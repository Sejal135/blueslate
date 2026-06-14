from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
from datetime import datetime
from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from groq import Groq
from supabase import create_client

load_dotenv()

app = FastAPI(title="Blueslate API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://blueslate.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
        target_urls = [
            f"{request.url.rstrip('/')}/about-us",
            f"{request.url.rstrip('/')}/trial-session",
            f"{request.url.rstrip('/')}/book-your-party",
            f"{request.url.rstrip('/')}/summercamps",
            f"{request.url.rstrip('/')}/additional-programs",
        ]

        all_content = []
        for url in target_urls:
            try:
                result = firecrawl.scrape_url(
                    url,
                    formats=["markdown"],
                    actions=[{"type": "wait", "milliseconds": 8000}]
                )
                if result.markdown and len(result.markdown.strip()) > 100:
                    all_content.append(
                        f"## Page: {url}\n{result.markdown}"
                    )
            except Exception:
                continue

        # Combine and truncate to stay within Groq token limit
        combined_content = "\n\n---\n\n".join(all_content)
        if len(combined_content) > 8000:
            combined_content = combined_content[:8000]

        # Send to Groq for structured extraction
        prompt = f"""
You are extracting structured knowledge from a youth esports franchise website.
Extract all useful business information from the following scraped content.

Return ONLY a valid JSON object with exactly these fields, no explanation, no markdown fences:
{{
  "business_name": "string",
  "phone": "string",
  "location": "string",
  "age_range": "string",
  "games_offered": ["list of games"],
  "programs": [
    {{
      "name": "string",
      "description": "string",
      "price": "string",
      "schedule": "string"
    }}
  ],
  "trial_info": "string",
  "birthday_parties": [
    {{
      "package_name": "string",
      "price": "string",
      "details": "string"
    }}
  ],
  "staff": [
    {{
      "name": "string",
      "role": "string"
    }}
  ],
  "mission": "string",
  "additional_info": "string"
}}

Ignore any cart, checkout, or payment UI content.
Only extract real business information.

SCRAPED CONTENT:
{combined_content}
"""

        chat_completion = groq_client.chat.completions.create(
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.1
        )

        response_text = chat_completion.choices[0].message.content.strip()

        # Clean up response — remove markdown code fences if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]

        structured_data = json.loads(response_text)

        # Get tenant ID from Supabase
        tenant_response = supabase_client.table("tenants")\
            .select("id")\
            .eq("slug", request.tenant_slug)\
            .single()\
            .execute()

        tenant_id = tenant_response.data["id"]

        # Deactivate old knowledge base entries for this tenant
        supabase_client.table("knowledge_base")\
            .update({"is_active": False})\
            .eq("tenant_id", tenant_id)\
            .execute()

        # Save new structured data
        supabase_client.table("knowledge_base")\
            .insert({
                "tenant_id": tenant_id,
                "source_url": request.url,
                "raw_content": combined_content,
                "structured_data": structured_data,
                "is_active": True
            })\
            .execute()

        return {
            "status": "success",
            "url": request.url,
            "tenant_slug": request.tenant_slug,
            "pages_scraped": len(all_content),
            "structured_data": structured_data,
            "saved_to_db": True
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@app.post("/webhook")
async def handle_webhook(payload: dict):
    try:
        # Extract call data from Retell AI payload
        call_id = payload.get("call_id", "")
        transcript = payload.get("transcript", "")
        recording_url = payload.get("recording_url", "")
        start_timestamp = payload.get("start_timestamp", 0)
        end_timestamp = payload.get("end_timestamp", 0)
        duration = int((end_timestamp - start_timestamp) / 1000) if end_timestamp and start_timestamp else 0

        # Send transcript to Groq for lead extraction
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
{transcript}
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
                "raw_transcript": transcript,
                "call_duration_seconds": duration,
                "call_timestamp": datetime.utcnow().isoformat()
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