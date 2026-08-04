import logging

from dotenv import load_dotenv
import inngest

from app.kb_ingestion import scrape_site, extract_kb, set_job_status, parse_file, transcribe_voice, upsert_source, rebuild_kb
from app.campaign_dialer import load_campaign, load_tenant_and_kb, load_audience, set_campaign_status, process_contact

load_dotenv()  # ensures INNGEST_DEV is read before the client is created

inngest_client = inngest.Inngest(
    app_id="blueslate",
    logger=logging.getLogger("uvicorn"),
)


@inngest_client.create_function(
    fn_id="test-function",
    trigger=inngest.TriggerEvent(event="test/hello"),
)
async def test_function(ctx: inngest.Context) -> dict:
    ctx.logger.info("Inngest test function fired")
    name = ctx.event.data.get("name", "world")
    return {"message": f"hello, {name}"}


@inngest_client.create_function(
    fn_id="run-kb-ingestion",
    trigger=inngest.TriggerEvent(event="kb/ingest.requested"),
)
async def run_kb_ingestion(ctx: inngest.Context) -> dict:
    data = ctx.event.data
    job_id = data["job_id"]
    tenant_id = data["tenant_id"]
    source_type = data.get("source_type", "scrape")
    source_ref = data.get("source_ref") or data.get("url")  # back-compat

    try:
        if source_type == "upload":
            await ctx.step.run("status-reading",
                               lambda: set_job_status(job_id, "scraping", "Reading your file..."))
            content = await ctx.step.run("parse-file", lambda: parse_file(source_ref))
        elif source_type == "voice":
            await ctx.step.run("status-transcribing",
                               lambda: set_job_status(job_id, "scraping", "Listening to your note..."))
            content = await ctx.step.run("transcribe", lambda: transcribe_voice(source_ref))
        else:  # scrape
            await ctx.step.run("status-scraping",
                               lambda: set_job_status(job_id, "scraping", "Reading your website..."))
            content = await ctx.step.run("scrape", lambda: scrape_site(source_ref))

        if not content:
            await ctx.step.run("status-empty",
                               lambda: set_job_status(job_id, "failed",
                                                      error="We couldn't read any content from that source."))
            return {"job_id": job_id, "status": "failed"}

        # 2. Extract (shared)
        await ctx.step.run("status-extracting",
                           lambda: set_job_status(job_id, "extracting", "Extracting your programs, pricing & schedule..."))
        structured = await ctx.step.run("extract", lambda: extract_kb(content))

        await ctx.step.run("status-saving",
                           lambda: set_job_status(job_id, "merging", "Merging into your agent's knowledge..."))
        await ctx.step.run("upsert-source",
                           lambda: upsert_source(tenant_id, source_type, source_ref, content, structured))
        merged = await ctx.step.run("rebuild-kb", lambda: rebuild_kb(tenant_id))

        await ctx.step.run("status-done",
                           lambda: set_job_status(job_id, "completed",
                                                  "Done! We merged that into your agent's knowledge.",
                                                  structured_data=merged))
        return {"job_id": job_id, "status": "completed"}

    except Exception as e:
        set_job_status(job_id, "failed", error=str(e))
        raise


@inngest_client.create_function(
    fn_id="run-campaign",
    trigger=inngest.TriggerEvent(event="campaign/launch.requested"),
)
async def run_campaign(ctx: inngest.Context) -> dict:
    data = ctx.event.data
    campaign_id = data["campaign_id"]
    tenant_id = data["tenant_id"]

    campaign = await ctx.step.run("load-campaign", lambda: load_campaign(campaign_id))
    tenant_kb = await ctx.step.run("load-tenant-kb", lambda: load_tenant_and_kb(tenant_id))
    tenant = tenant_kb["tenant"]
    knowledge = tenant_kb["knowledge"]

    audience = await ctx.step.run(
        "load-audience", lambda: load_audience(tenant_id, campaign["audience_status_key"])
    )

    results = []
    for contact in audience:
        result = await ctx.step.run(
            f"dial-contact-{contact['id']}",
            process_contact,
            tenant_id, campaign_id, campaign["goal"], tenant, tenant.get("slug"), knowledge, contact,
        )
        results.append(result)

    await ctx.step.run("status-completed", lambda: set_campaign_status(campaign_id, "completed"))

    dialed = sum(1 for r in results if r["result"] == "dialed")
    return {
        "campaign_id": campaign_id,
        "total": len(results),
        "dialed": dialed,
        "skipped_or_failed": len(results) - dialed,
    }