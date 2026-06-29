import os
import json
import re
import uuid
import httpx
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timezone
from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from groq import Groq
from supabase import create_client
import inngest.fast_api
from app.inngest_functions import inngest_client, test_function, run_kb_ingestion

load_dotenv()

app = FastAPI(title="Blueslate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://blueslate-gamma.vercel.app",
        "https://blueslate-git-main-sejal135s-projects.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve Inngest functions at /api/inngest
inngest.fast_api.serve(app, inngest_client, [test_function, run_kb_ingestion])

# Initialize Firecrawl
firecrawl = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))

# Initialize Groq
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Initialize Supabase
supabase_client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY")
)

# Initialize Retell
RETELL_API_KEY = os.getenv("RETELL_API_KEY")

# Twilio free shared number as a constant
RETELL_FROM_NUMBER = os.getenv("RETELL_FROM_NUMBER", "+18664851671")

# ---- Helpers ----
def get_tenant_id(slug: str) -> str:
    res = supabase_client.table("tenants").select("id").eq("slug", slug).execute()
    if not res.data:
        raise ValueError(f"No franchise found for slug '{slug}'")
    return res.data[0]["id"]


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "franchise"

# Turns the merged KB JSON into readable text for the agent
def format_kb_for_agent(kb: dict) -> str:
    if not kb:
        return "No information available yet."
    lines = []
    if kb.get("business_name"): lines.append(f"Business name: {kb['business_name']}")
    if kb.get("location"): lines.append(f"Location: {kb['location']}")
    if kb.get("age_range"): lines.append(f"Ages served: {kb['age_range']}")
    if kb.get("phone"): lines.append(f"Phone: {kb['phone']}")
    if kb.get("games_offered"): lines.append("Games/activities: " + ", ".join(kb["games_offered"]))
    for p in (kb.get("programs") or []):
        bits = [p.get("name", "")]
        if p.get("price"): bits.append(f"price {p['price']}")
        if p.get("schedule"): bits.append(p["schedule"])
        if p.get("description"): bits.append(p["description"])
        lines.append("Program: " + " | ".join(b for b in bits if b))
    if kb.get("trial_info"): lines.append(f"Free trial: {kb['trial_info']}")
    for pp in (kb.get("birthday_parties") or []):
        bits = [pp.get("package_name", "")]
        if pp.get("price"): bits.append(f"price {pp['price']}")
        if pp.get("details"): bits.append(pp["details"])
        lines.append("Birthday party: " + " | ".join(b for b in bits if b))
    if kb.get("mission"): lines.append(f"Mission: {kb['mission']}")
    if kb.get("additional_info"): lines.append(f"Other: {kb['additional_info']}")
    return "\n".join(lines) if lines else "No information available yet."


# ---- Request models ----
class ScrapeRequest(BaseModel):
    url: str
    tenant_slug: str


class CreateTenantRequest(BaseModel):
    activity_id: str
    brand_id: str


class UpdateTenantRequest(BaseModel):
    activity_id: str
    brand_id: str

class VoiceRequest(BaseModel):
    voice_id: str

class CallRequest(BaseModel):
    tenant_slug: str
    to_number: str

@app.get("/health")
def health_check():
    return {"status": "ok", "project": "blueslate"}


@app.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    try:
        tenant_id = get_tenant_id(request.tenant_slug)

        job = supabase_client.table("kb_jobs").insert({
            "tenant_id": tenant_id,
            "source_type": "scrape",
            "source_ref": request.url,
            "status": "queued",
            "message": "Queued...",
        }).execute()
        job_id = job.data[0]["id"]

        await inngest_client.send(inngest.Event(
            name="kb/ingest.requested",
            data={
                "job_id": job_id,
                "tenant_id": tenant_id,
                "source_type": "scrape",
                "source_ref": request.url,
            },
        ))

        return {"status": "queued", "job_id": job_id}

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/ingest/file")
async def ingest_file(tenant_slug: str = Form(...), file: UploadFile = File(...)):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        contents = await file.read()
        safe_name = (file.filename or "upload").replace("/", "_")
        path = f"{tenant_id}/{uuid.uuid4()}_{safe_name}"

        supabase_client.storage.from_("kb-uploads").upload(
            path, contents, {"content-type": file.content_type or "application/octet-stream"}
        )

        job = supabase_client.table("kb_jobs").insert({
            "tenant_id": tenant_id,
            "source_type": "upload",
            "source_ref": path,
            "status": "queued",
            "message": "Queued...",
        }).execute()
        job_id = job.data[0]["id"]

        await inngest_client.send(inngest.Event(
            name="kb/ingest.requested",
            data={"job_id": job_id, "tenant_id": tenant_id, "source_type": "upload", "source_ref": path},
        ))
        return {"status": "queued", "job_id": job_id}

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/ingest/voice")
async def ingest_voice(tenant_slug: str = Form(...), file: UploadFile = File(...)):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        contents = await file.read()
        safe_name = (file.filename or "voice-note").replace("/", "_")
        path = f"{tenant_id}/{uuid.uuid4()}_{safe_name}"

        supabase_client.storage.from_("kb-uploads").upload(
            path, contents, {"content-type": file.content_type or "audio/webm"}
        )

        job = supabase_client.table("kb_jobs").insert({
            "tenant_id": tenant_id,
            "source_type": "voice",
            "source_ref": path,
            "status": "queued",
            "message": "Queued...",
        }).execute()
        job_id = job.data[0]["id"]

        await inngest_client.send(inngest.Event(
            name="kb/ingest.requested",
            data={"job_id": job_id, "tenant_id": tenant_id, "source_type": "voice", "source_ref": path},
        ))
        return {"status": "queued", "job_id": job_id}

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.post("/webhook")
async def handle_webhook(payload: dict):
    try:
        print("RETELL WEBHOOK PAYLOAD:", json.dumps(payload, indent=2))

        call_object = payload.get("call", {})
        print("TRANSCRIPT RAW:", json.dumps(call_object.get("transcript", "NOT FOUND"), indent=2))
        print("TOP LEVEL TRANSCRIPT:", json.dumps(payload.get("transcript", "NOT FOUND"), indent=2))

        call_id = call_object.get("call_id", "")
        recording_url = call_object.get("recording_url", "")
        duration = call_object.get("call_cost", {}).get("total_duration_seconds", 0)

        # Transcript is a pre-formatted string inside call_object
        transcript_text = call_object.get("transcript", "")

        # Use call_summary as backup if transcript is empty
        call_summary = call_object.get("call_analysis", {}).get("call_summary", "")
        text_to_analyze = transcript_text if transcript_text else call_summary

        # Send to Groq for lead extraction
        lead_prompt = f"""
Extract caller information from this call transcript.
Return ONLY a valid JSON object with exactly these fields, no explanation, no markdown fences:
{{
  "caller_name": "string or Unknown if not mentioned",
  "phone_number": "string or Unknown if not mentioned",
  "core_interest": "string - what they were interested in",
  "call_outcome": "string - one of: booked_trial, callback_requested, not_interested, general_inquiry"
}}

TRANSCRIPT:
{text_to_analyze}
"""

        lead_extraction = groq_client.chat.completions.create(
            messages=[{"role": "user", "content": lead_prompt}],
            model="llama-3.3-70b-versatile",
            temperature=0.1
        )

        lead_text = lead_extraction.choices[0].message.content.strip()

        if lead_text.startswith("```"):
            lead_text = lead_text.split("```")[1]
            if lead_text.startswith("json"):
                lead_text = lead_text[4:]

        lead_data = json.loads(lead_text)

        # Resolve the tenant this call belonged to.
        # Outbound calls ("call me now") carry tenant_slug in metadata, set at call-creation time.
        # Inbound calls (XP League's shared number) have no metadata, so they fall back to the
        # pilot — correct for now since XP League is the only inbound tenant. When each franchise
        # gets its own number, this fallback becomes a dialed-number -> tenant lookup.
        metadata = call_object.get("metadata") or {}
        tenant_slug = metadata.get("tenant_slug", "xpleague-frisco")
        tenant_id = get_tenant_id(tenant_slug)

        # Save lead to Supabase
        lead_response = supabase_client.table("leads")\
            .insert({
                "tenant_id": tenant_id,
                "caller_name": lead_data.get("caller_name", "Unknown"),
                "phone_number": lead_data.get("phone_number", "Unknown"),
                "core_interest": lead_data.get("core_interest", ""),
                "call_outcome": lead_data.get("call_outcome", "general_inquiry"),
                "raw_transcript": transcript_text,
                "call_duration_seconds": duration,
                "call_timestamp": datetime.now(timezone.utc).isoformat()
            })\
            .execute()

        lead_id = lead_response.data[0]["id"]

        # Save call log
        supabase_client.table("call_logs")\
            .insert({
                "tenant_id": tenant_id,
                "lead_id": lead_id,
                "provider_call_id": call_id,
                "status": "completed",
                "recording_url": recording_url
            })\
            .execute()

        return {"status": "success", "lead_id": lead_id}

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/kb-jobs/{job_id}")
async def get_kb_job(job_id: str):
    try:
        res = supabase_client.table("kb_jobs").select("*").eq("id", job_id).single().execute()
        return {"status": "success", "job": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# endpoint 1
@app.get("/activities")
async def list_activities():
    try:
        res = supabase_client.table("activities").select("id, key, name").order("name").execute()
        return {"status": "success", "activities": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# endpoint 2
@app.get("/brands")
async def list_brands(activity_id: str):
    try:
        res = supabase_client.table("brands") \
            .select("id, key, name, is_independent") \
            .eq("activity_id", activity_id) \
            .order("is_independent") \
            .order("name") \
            .execute()
        return {"status": "success", "brands": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# endpoint 3 — create a fresh franchise (called once per onboarding session)
@app.post("/onboarding/tenant")
async def create_tenant(req: CreateTenantRequest):
    try:
        brand = supabase_client.table("brands").select("name, key").eq("id", req.brand_id).single().execute()
        slug = f"{_slugify(brand.data['key'])}-{uuid.uuid4().hex[:6]}"
        name = f"New {brand.data['name']} franchise"

        res = supabase_client.table("tenants").insert({
            "slug": slug,
            "name": name,
            "activity_id": req.activity_id,
            "brand_id": req.brand_id,
        }).execute()

        return {"status": "success", "tenant_id": res.data[0]["id"], "slug": slug, "name": name}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# endpoint 4 — update the franchise created this session (when the owner edits earlier steps)
@app.patch("/onboarding/tenant/{slug}")
async def update_tenant(slug: str, req: UpdateTenantRequest):
    try:
        tenant_id = get_tenant_id(slug)
        supabase_client.table("tenants").update({
            "activity_id": req.activity_id,
            "brand_id": req.brand_id,
        }).eq("id", tenant_id).execute()
        return {"status": "success", "tenant_id": tenant_id, "slug": slug}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Live list of Retell voices for the picker (includes a preview audio URL per voice).
@app.get("/voices")
async def list_voices():
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://api.retellai.com/list-voices",
                headers={"Authorization": f"Bearer {RETELL_API_KEY}"},
            )
        r.raise_for_status()
        voices = r.json()
        picked = [
            {"voice_id": v["voice_id"], "voice_name": v.get("voice_name", v["voice_id"]),
             "preview_audio_url": v.get("preview_audio_url")}
            for v in voices[:6]
        ]
        return {"status": "success", "voices": picked}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Save the owner's chosen voice onto their tenant.
@app.patch("/onboarding/tenant/{slug}/voice")
async def set_voice(slug: str, req: VoiceRequest):
    try:
        tenant_id = get_tenant_id(slug)
        supabase_client.table("tenants").update({"voice_id": req.voice_id}).eq("id", tenant_id).execute()
        return {"status": "success", "voice_id": req.voice_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Places an outbound "call me now" — injects THIS tenant's KB + voice into the shared agent.
@app.post("/onboarding/call")
async def make_call(req: CallRequest):
    try:
        tenant_id = get_tenant_id(req.tenant_slug)

        tenant = supabase_client.table("tenants").select("name, voice_id").eq("id", tenant_id).single().execute()
        business_name = tenant.data.get("name") or "our program"
        voice_id = tenant.data.get("voice_id")

        kb_rows = supabase_client.table("knowledge_base").select("structured_data") \
            .eq("tenant_id", tenant_id).eq("is_active", True).limit(1).execute()
        kb = kb_rows.data[0]["structured_data"] if kb_rows.data else {}
        knowledge = format_kb_for_agent(kb)

        payload = {
            "from_number": RETELL_FROM_NUMBER,
            "to_number": req.to_number,
            "metadata": {"tenant_slug": req.tenant_slug},
            "retell_llm_dynamic_variables": {
                "business_name": business_name,
                "knowledge": knowledge,
            },
        }
        # Override the voice per call with the one the owner chose in step 4.
        if voice_id:
            payload["agent_override"] = {"agent": {"voice_id": voice_id}}

        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.retellai.com/v2/create-phone-call",
                headers={"Authorization": f"Bearer {RETELL_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
        if r.status_code >= 400:
            return {"status": "error", "message": f"Retell {r.status_code}: {r.text}"}
        data = r.json()
        return {"status": "success", "call_id": data.get("call_id"), "call_status": data.get("call_status")}

    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/leads")
async def get_leads(tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        leads_response = supabase_client.table("leads")\
            .select("*")\
            .eq("tenant_id", tenant_id)\
            .order("call_timestamp", desc=True)\
            .execute()

        return {"status": "success", "leads": leads_response.data}

    except Exception as e:
        return {"status": "error", "message": str(e)}
    
    