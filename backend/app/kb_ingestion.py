import io
from pypdf import PdfReader
from docx import Document

import os
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from groq import Groq
from supabase import create_client

load_dotenv()

# These are stateless clients, so it's fine that main.py also has its own instances.
firecrawl = FirecrawlApp(api_key=os.getenv("FIRECRAWL_API_KEY"))
groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
supabase_client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
)


def set_job_status(
    job_id: str,
    status: str,
    message: str | None = None,
    structured_data: dict | None = None,
    error: str | None = None,
) -> str:
    update: dict = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if message is not None:
        update["message"] = message
    if structured_data is not None:
        update["structured_data"] = structured_data
    if error is not None:
        update["error"] = error

    supabase_client.table("kb_jobs").update(update).eq("id", job_id).execute()
    return status


def scrape_site(url: str) -> str:
    target_urls = [
        f"{url.rstrip('/')}/about-us",
        f"{url.rstrip('/')}/trial-session",
        f"{url.rstrip('/')}/book-your-party",
        f"{url.rstrip('/')}/summercamps",
        f"{url.rstrip('/')}/additional-programs",
    ]

    all_content = []
    for u in target_urls:
        try:
            result = firecrawl.scrape_url(
                u,
                formats=["markdown"],
                actions=[{"type": "wait", "milliseconds": 8000}],
            )
            if result.markdown and len(result.markdown.strip()) > 100:
                all_content.append(f"## Page: {u}\n{result.markdown}")
        except Exception:
            continue

    combined = "\n\n---\n\n".join(all_content)
    return combined[:8000] if len(combined) > 8000 else combined


def extract_kb(combined_content: str) -> dict:
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
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-versatile",
        temperature=0.1,
    )

    response_text = chat_completion.choices[0].message.content.strip()

    # Strip markdown code fences if Groq added them
    if response_text.startswith("```"):
        response_text = response_text.split("```")[1]
        if response_text.startswith("json"):
            response_text = response_text[4:]

    return json.loads(response_text)


SOURCE_PRIORITY = {"voice": 5, "upload": 4, "scrape": 3, "brand": 2}


def upsert_source(tenant_id: str, source_type: str, source_ref: str,
                  raw_content: str, structured_data: dict) -> None:
    supabase_client.table("kb_sources").upsert(
        {
            "tenant_id": tenant_id,
            "source_type": source_type,
            "priority": SOURCE_PRIORITY.get(source_type, 3),
            "source_ref": source_ref,
            "raw_content": raw_content,
            "structured_data": structured_data,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="tenant_id,source_type",
    ).execute()


def _is_empty(value) -> bool:
    return value is None or value == "" or value == [] or value == {}


def rebuild_kb(tenant_id: str) -> dict:
    rows = supabase_client.table("kb_sources") \
        .select("structured_data, priority") \
        .eq("tenant_id", tenant_id) \
        .order("priority", desc=False) \
        .execute().data

    merged: dict = {}
    for row in rows:  # lowest priority first; higher priority overwrites on non-empty
        for key, value in (row.get("structured_data") or {}).items():
            if not _is_empty(value):
                merged[key] = value

    # Write the merged result as the single active knowledge_base row (what the agent reads)
    supabase_client.table("knowledge_base").update({"is_active": False}) \
        .eq("tenant_id", tenant_id).execute()
    supabase_client.table("knowledge_base").insert({
        "tenant_id": tenant_id,
        "source_url": "merged",
        "raw_content": "",
        "structured_data": merged,
        "is_active": True,
    }).execute()

    return merged

# downloads the file from the supabase storage bucket and pulls text out, same 8000-char cap as the scrape
def parse_file(storage_path: str) -> str:
    data = supabase_client.storage.from_("kb-uploads").download(storage_path)
    lower = storage_path.lower()

    if lower.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    elif lower.endswith(".docx"):
        doc = Document(io.BytesIO(data))
        text = "\n".join(p.text for p in doc.paragraphs)
    elif lower.endswith(".txt"):
        text = data.decode("utf-8", errors="ignore")
    else:
        raise ValueError(f"Unsupported file type: {storage_path}")

    text = text.strip()
    return text[:8000] if len(text) > 8000 else text

# the owner records a quick clip, and Groq Whisper turns it into text that flows through the exact same extract → save
def transcribe_voice(storage_path: str) -> str:
    data = supabase_client.storage.from_("kb-uploads").download(storage_path)
    filename = storage_path.split("/")[-1]

    transcription = groq_client.audio.transcriptions.create(
        file=(filename, data),
        model="whisper-large-v3",
    )

    text = transcription.text.strip()
    return text[:8000] if len(text) > 8000 else text