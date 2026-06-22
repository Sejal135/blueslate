from fastapi import FastAPI, UploadFile, File, Form
import uuid
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
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

# for testing inngest
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

# Request model
class ScrapeRequest(BaseModel):
    url: str
    tenant_slug: str

@app.get("/health")
def health_check():
    return {"status": "ok", "project": "blueslate"}
@app.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    try:
        tenant_response = supabase_client.table("tenants") \
            .select("id").eq("slug", request.tenant_slug).single().execute()
        tenant_id = tenant_response.data["id"]

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
                "source_ref": request.url
            },
        ))

        return {"status": "queued", "job_id": job_id}

    except Exception as e:
        return {"status": "error", "message": str(e)}

# to read different types of file uploads and inngest it
@app.post("/ingest/file")
async def ingest_file(tenant_slug: str = Form(...), file: UploadFile = File(...)):
    try:
        tenant = supabase_client.table("tenants").select("id").eq("slug", tenant_slug).single().execute()
        tenant_id = tenant.data["id"]

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
        tenant = supabase_client.table("tenants").select("id").eq("slug", tenant_slug).single().execute()
        tenant_id = tenant.data["id"]

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

        # Get tenant ID
        tenant_response = supabase_client.table("tenants")\
            .select("id")\
            .eq("slug", "xpleague-frisco")\
            .single()\
            .execute()

        tenant_id = tenant_response.data["id"]

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

@app.get("/leads")
async def get_leads():
    try:
        tenant_response = supabase_client.table("tenants")\
            .select("id")\
            .eq("slug", "xpleague-frisco")\
            .single()\
            .execute()

        tenant_id = tenant_response.data["id"]

        leads_response = supabase_client.table("leads")\
            .select("*")\
            .eq("tenant_id", tenant_id)\
            .order("call_timestamp", desc=True)\
            .execute()

        return {
            "status": "success",
            "leads": leads_response.data
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
    