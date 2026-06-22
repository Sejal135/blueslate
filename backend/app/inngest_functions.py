import logging

from dotenv import load_dotenv
import inngest

from app.kb_ingestion import scrape_site, extract_kb, save_kb, set_job_status

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
    url = data["url"]

    try:
        # Each step is durable: it runs once on success, retries on failure,
        # and is skipped (memoized) if the function is re-invoked.
        await ctx.step.run(
            "status-scraping",
            lambda: set_job_status(job_id, "scraping", "Reading your website..."),
        )
        content = await ctx.step.run("scrape", lambda: scrape_site(url))

        if not content:
            await ctx.step.run(
                "status-empty",
                lambda: set_job_status(
                    job_id, "failed",
                    error="We couldn't read any content from that website.",
                ),
            )
            return {"job_id": job_id, "status": "failed"}

        await ctx.step.run(
            "status-extracting",
            lambda: set_job_status(job_id, "extracting", "Extracting your programs, pricing & schedule..."),
        )
        structured = await ctx.step.run("extract", lambda: extract_kb(content))

        await ctx.step.run(
            "status-saving",
            lambda: set_job_status(job_id, "merging", "Saving your agent's knowledge..."),
        )
        await ctx.step.run("save", lambda: save_kb(tenant_id, url, content, structured))

        await ctx.step.run(
            "status-done",
            lambda: set_job_status(
                job_id, "completed",
                "Done! We found your programs, pricing, and schedule.",
                structured_data=structured,
            ),
        )
        return {"job_id": job_id, "status": "completed"}

    except Exception as e:
        # Mark the job failed so the UI can show an error, then re-raise so
        # Inngest records the failure and applies its retry policy.
        set_job_status(job_id, "failed", error=str(e))
        raise