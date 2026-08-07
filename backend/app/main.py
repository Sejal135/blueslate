import os
import io
import json
import re
import uuid
import csv
import httpx
import resend
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from firecrawl import FirecrawlApp
from groq import Groq
from supabase import create_client
import inngest.fast_api
from app.inngest_functions import inngest_client, test_function, run_kb_ingestion, run_campaign

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
inngest.fast_api.serve(app, inngest_client, [test_function, run_kb_ingestion, run_campaign])

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

# Initialize Resend
resend.api_key = os.getenv("RESEND_API_KEY")

# ---- Helpers ----
def get_tenant_id(slug: str) -> str:
    res = supabase_client.table("tenants").select("id").eq("slug", slug).execute()
    if not res.data:
        raise ValueError(f"No franchise found for slug '{slug}'")
    return res.data[0]["id"]


def _slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "franchise"

# Post-call email: program info + trial link to a captured parent email.
def send_post_call_email(business_name: str, to_email: str, child_name: str, website_url: str | None):
    kid = f" for {child_name}" if child_name and child_name != "Unknown" else ""
    link = website_url or None
    cta = (
        f'<p><a href="{link}" style="background:#0EA98B;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Book your free trial</a></p>'
        if link else
        '<p>Reply to this email or give us a call to book your free trial!</p>'
    )
    html = f"""
    <div style="font-family:sans-serif">
      <h2>Thanks for calling {business_name}!</h2>
      <p>We'd love to see you{kid} at a free trial class.</p>
      {cta}
    </div>
    """
    return send_email(to_email, f"Your free trial at {business_name}", html)

# Send an email via Resend. Returns True on success.
def send_email(to: str, subject: str, html: str) -> bool:
    try:
        resend.Emails.send({
            "from": "onboarding@resend.dev",  # test sender; swap for verified domain later
            "to": to,
            "subject": subject,
            "html": html,
        })
        return True
    except Exception as e:
        print("EMAIL ERROR:", e)
        return False
    

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

# Canonicalize a phone to E.164-ish digits so the same number always matches.
def normalize_phone(raw: str) -> str | None:
    if not raw or raw == "Unknown":
        return None
    digits = re.sub(r"[^\d]", "", raw)
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None      # anything else is unreliable — don't fabricate an E.164

# Find-or-create a contact by phone within a tenant (upsert by natural key).
# Same person calling twice reuses one contact instead of duplicating.
def resolve_contact(tenant_id: str, phone: str, caller_name: str, email: str = None) -> str:
    phone = normalize_phone(phone)
    email = (email or "").strip().lower() or None
    parts = (caller_name or "").strip().split(" ", 1)
    first = parts[0] if parts and parts[0] else "Unknown"
    last = parts[1] if len(parts) > 1 else ""

    if phone:
        found = supabase_client.table("contacts").select("id, email") \
            .eq("tenant_id", tenant_id).eq("phone", phone).limit(1).execute()
        if found.data:
            contact_id = found.data[0]["id"]
            # Backfill email if we now have one and didn't before.
            if email and not found.data[0].get("email"):
                supabase_client.table("contacts").update({"email": email}).eq("id", contact_id).execute()
            return contact_id

    created = supabase_client.table("contacts").insert({
        "tenant_id": tenant_id,
        "first_name": first, "last_name": last,
        "phone": phone,
        "email": email,
        "source": "inbound_call",
    }).execute()
    return created.data[0]["id"]

# Find-or-create a child under a contact (upsert by contact_id + name).
# Same kid mentioned across calls reuses one row instead of duplicating.
def resolve_child(tenant_id: str, contact_id: str, child_name: str, child_age, program_interest: str):
    if not child_name or child_name == "Unknown":
        return  # nothing to attach

    # Coerce age to int or None — the model usually sends a number, but be defensive.
    try:
        age = int(child_age)
    except (TypeError, ValueError):
        age = None

    # Look up existing child by natural key (contact + name).
    found = supabase_client.table("children").select("id") \
        .eq("contact_id", contact_id).eq("name", child_name).limit(1).execute()
    if found.data:
        # Update age/interest if we learned them this call.
        supabase_client.table("children").update({
            "age": age, "program_interest": program_interest,
        }).eq("id", found.data[0]["id"]).execute()
        return

    # None found → create.
    supabase_client.table("children").insert({
        "tenant_id": tenant_id,
        "contact_id": contact_id,
        "name": child_name,
        "age": age,
        "program_interest": program_interest,
    }).execute()


# Maps what extraction returns → your lead_statuses keys.
OUTCOME_TO_STATUS = {
    "booked_trial": "trial_booked",
    "callback_requested": "needs_callback",
    "not_interested": "not_interested",
    "general_inquiry": "new_lead",
}

# Set a contact's status, advance-only: never move backward in the pipeline.
def apply_status(tenant_id: str, contact_id: str, call_outcome: str):
    status_key = OUTCOME_TO_STATUS.get(call_outcome, "new_lead")

    # Look up the target status row (need its id + sort_order) for this tenant.
    target = supabase_client.table("lead_statuses").select("id, sort_order") \
        .eq("tenant_id", tenant_id).eq("key", status_key).limit(1).execute()
    if not target.data:
        return  # status not seeded for this tenant — skip
    target_id = target.data[0]["id"]
    target_sort = target.data[0]["sort_order"]

    # Read the contact's current status to compare positions.
    contact = supabase_client.table("contacts").select("lead_status_id") \
        .eq("id", contact_id).single().execute()
    current_id = contact.data.get("lead_status_id")

    # If they already have a status, only advance (new sort_order must be higher).
    if current_id:
        current = supabase_client.table("lead_statuses").select("sort_order") \
            .eq("id", current_id).single().execute()
        if current.data and target_sort <= current.data["sort_order"]:
            return  # same or earlier stage → don't move backward

    supabase_client.table("contacts").update({"lead_status_id": target_id}) \
        .eq("id", contact_id).execute()
    
# The default lead-status pipeline every tenant starts with.
DEFAULT_LEAD_STATUSES = [
    ("new_lead",         "New lead",         "#1A6CF0", True,  1),
    ("needs_callback",   "Needs callback",   "#F5A623", True,  2),
    ("trial_booked",     "Trial booked",     "#0EA98B", True,  3),
    ("not_interested",   "Not interested",   "#94A3B8", True,  4),
    ("do_not_contact",   "Do not contact",   "#EF4444", True,  5),
    ("voicemail_left",   "Voicemail left",   "#64748B", False, 10),
    ("no_answer",        "No answer",        "#64748B", False, 11),
    ("lapsed",           "Lapsed",           "#64748B", False, 12),
]

# Seed a tenant's lead-status pipeline. Called once at tenant creation.
def seed_lead_statuses(tenant_id: str):
    rows = [
        {"tenant_id": tenant_id, "key": k, "label": lbl, "color": clr,
         "is_visible": vis, "is_system": not vis, "sort_order": so}
        for (k, lbl, clr, vis, so) in DEFAULT_LEAD_STATUSES
    ]
    supabase_client.table("lead_statuses").insert(rows).execute()

# Mark a contact Do-Not-Contact (DNC) and set their status to do_not_contact.
# DNC is an override — it applies regardless of pipeline position (compliance beats advance-only).
def apply_dnc(tenant_id: str, contact_id: str):
    dnc = supabase_client.table("lead_statuses").select("id") \
        .eq("tenant_id", tenant_id).eq("key", "do_not_contact").limit(1).execute()
    update = {"do_not_contact": True}
    if dnc.data:
        update["lead_status_id"] = dnc.data[0]["id"]
    supabase_client.table("contacts").update(update).eq("id", contact_id).execute()


# Temporary endpoint to confirm email works end-to-end.
@app.post("/test-email")
async def test_email(to: str):
    ok = send_email(to, "Blueslate test", "<p>If you're reading this, Resend works. 🎉</p>")
    return {"status": "success" if ok else "error"}

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


class CreateCampaignRequest(BaseModel):
    tenant_slug: str
    name: str
    goal: str
    audience_status_key: str | None = None
    scheduled_at: str | None = None

class LinkProfileRequest(BaseModel):
    user_id: str
    tenant_slug: str


class VoiceRequest(BaseModel):
    voice_id: str

class CallRequest(BaseModel):
    tenant_slug: str
    to_number: str

@app.get("/health")
def health_check():
    return {"status": "ok", "project": "blueslate"}


# Export a tenant's contacts as a downloadable CSV.
@app.get("/contacts/export")
async def export_contacts(tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)
        res = supabase_client.table("contacts") \
            .select("first_name, last_name, phone, email, do_not_contact, "
                    "lead_statuses(key), created_at") \
            .eq("tenant_id", tenant_id).order("created_at", desc=True).execute()

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["first_name", "last_name", "phone", "email", "status", "do_not_contact", "created_at"])
        for c in res.data:
            status = (c.get("lead_statuses") or {}).get("key", "")
            writer.writerow([
                c.get("first_name", ""), c.get("last_name", ""),
                c.get("phone", "") or "", c.get("email", "") or "",
                status, c.get("do_not_contact", False), c.get("created_at", ""),
            ])

        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={tenant_slug}-contacts.csv"},
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/scrape")
async def scrape_url(request: ScrapeRequest):
    try:
        tenant_id = get_tenant_id(request.tenant_slug)

        # Save the source URL on the tenant so we can link to their real site later (e.g. post-call email).
        supabase_client.table("tenants").update({"website_url": request.url}).eq("id", tenant_id).execute()

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

# Import contacts from an uploaded CSV. Dedupes by normalized phone OR email; skips matches.
@app.post("/contacts/import")
async def import_contacts(tenant_slug: str = Form(...), file: UploadFile = File(...)):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        # Read the uploaded CSV into rows.
        raw = await file.read()
        text = raw.decode("utf-8-sig")  # utf-8-sig strips Excel's byte-order mark if present
        reader = csv.DictReader(io.StringIO(text))

        created, skipped, errors = 0, 0, 0
        for row in reader:
            try:
                phone = normalize_phone(row.get("phone", ""))
                email = (row.get("email") or "").strip().lower() or None

                # Dedupe: does a contact already match by phone OR email?
                match = None
                if phone:
                    r = supabase_client.table("contacts").select("id") \
                        .eq("tenant_id", tenant_id).eq("phone", phone).limit(1).execute()
                    if r.data:
                        match = r.data[0]
                if not match and email:
                    r = supabase_client.table("contacts").select("id") \
                        .eq("tenant_id", tenant_id).eq("email", email).limit(1).execute()
                    if r.data:
                        match = r.data[0]

                if match:
                    skipped += 1
                    continue

                # No match → create the contact.
                supabase_client.table("contacts").insert({
                    "tenant_id": tenant_id,
                    "first_name": (row.get("first_name") or "").strip() or "Unknown",
                    "last_name": (row.get("last_name") or "").strip(),
                    "phone": phone,
                    "email": email,
                    "source": "imported_list",
                }).execute()
                created += 1
            except Exception:
                errors += 1

        return {"status": "success", "created": created, "skipped": skipped, "errors": errors}

    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/webhook")
async def handle_webhook(payload: dict):

    try:
        # Retell fires three events per call (started, ended, analyzed). Only process the
        # final one — it's fired once and carries the full transcript + analysis we need.
        event = payload.get("event")
        if event != "call_analyzed":
            return {"status": "ignored", "event": event}

        print("RETELL WEBHOOK PAYLOAD:", json.dumps(payload, indent=2))

        call_object = payload.get("call", {})
        print("TRANSCRIPT RAW:", json.dumps(call_object.get("transcript", "NOT FOUND"), indent=2))
        print("TOP LEVEL TRANSCRIPT:", json.dumps(payload.get("transcript", "NOT FOUND"), indent=2))

        call_id = call_object.get("call_id", "")
        # Retell retries call_analyzed if we don't 2xx within 10s, and our handler is slow
        # (Groq + DB writes). Dedupe by call_id so a retry doesn't create a second contact.
        existing = supabase_client.table("call_logs") \
            .select("id").eq("provider_call_id", call_id).limit(1).execute()
        if existing.data:
            return {"status": "duplicate", "call_id": call_id}
         
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
  "email": "string or Unknown if not mentioned",
  "child_name": "string or Unknown if not mentioned",
  "child_age": "number or null if not mentioned",
  "core_interest": "string - what they were interested in",
  "call_outcome": "string - one of: booked_trial, callback_requested, not_interested, general_inquiry",
  "opted_out": "boolean - true ONLY if the caller explicitly asked to stop being contacted / called / texted (e.g. 'stop calling me', 'take me off your list', 'do not contact me')",
  "opt_out_phrase": "string - the caller's exact words that signal opt-out, or empty string if none"
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
        # DEBUG LINE
        print("PARSED LEAD:", json.dumps(lead_data, indent=2))

        # Resolve the tenant this call belonged to.
        # Outbound calls ("call me now") carry tenant_slug in metadata, set at call-creation time.
        # Inbound calls (XP League's shared number) have no metadata, so they fall back to the
        # pilot — correct for now since XP League is the only inbound tenant. When each franchise
        # gets its own number, this fallback becomes a dialed-number -> tenant lookup.
        metadata = call_object.get("metadata") or {}
        tenant_slug = metadata.get("tenant_slug", "xpleague-frisco")
        tenant_id = get_tenant_id(tenant_slug)
        # Resolve the caller to a contact (find-or-create by phone), then link the lead to it.
        contact_id = resolve_contact(
            tenant_id,
            lead_data.get("phone_number", "Unknown"),
            lead_data.get("caller_name", "Unknown"),
            lead_data.get("email"),
        )

        resolve_child(
            tenant_id,
            contact_id,
            lead_data.get("child_name", "Unknown"),
            lead_data.get("child_age"),
            lead_data.get("core_interest", ""),
        )

        # Opt-out is an override: if the caller asked to stop contact, mark DNC and skip
        # normal status advancement. Otherwise apply the usual advance-only status.
        if lead_data.get("opted_out"):
            apply_dnc(tenant_id, contact_id)
            print(f"OPT-OUT detected: {lead_data.get('opt_out_phrase')}")
        else:
            apply_status(tenant_id, contact_id, lead_data.get("call_outcome", "general_inquiry"))

        # Send the post-call trial-info email if we captured one.
        email = (lead_data.get("email") or "").strip().lower()
        if email and email != "unknown":
            tenant_row = supabase_client.table("tenants").select("name, website_url") \
                .eq("id", tenant_id).single().execute().data
            business_name = tenant_row.get("name", "our program")
            website_url = tenant_row.get("website_url")
            sent = send_post_call_email(business_name, email, lead_data.get("child_name", ""), website_url)
            print(f"POST-CALL EMAIL to {email}: {'sent' if sent else 'FAILED'}")

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
                "contact_id": contact_id,
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


# All call activity for a tenant. leads is the primary source (richest per-call
# data); call_logs is embedded via its lead_id FK to attach status + provider_call_id.
@app.get("/calls")
async def get_calls(tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        res = supabase_client.table("leads") \
            .select("caller_name, phone_number, call_outcome, call_duration_seconds, call_timestamp, "
                    "contact_id, call_logs(status, provider_call_id)") \
            .eq("tenant_id", tenant_id) \
            .order("call_timestamp", desc=True) \
            .execute()

        calls = []
        for l in res.data:
            log = (l.get("call_logs") or [{}])[0]
            calls.append({
                "caller_name": l["caller_name"],
                "phone_number": l["phone_number"],
                "call_outcome": l["call_outcome"],
                "call_duration_seconds": l["call_duration_seconds"],
                "call_timestamp": l["call_timestamp"],
                "contact_id": l["contact_id"],
                "provider_call_id": log.get("provider_call_id"),
                "status": log.get("status"),
            })

        return {"status": "success", "calls": calls}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# One call's full detail, keyed by Retell's provider_call_id (not the leads row id).
# call_logs is the source of truth for provider_call_id; leads is embedded off its lead_id FK.
@app.get("/calls/{provider_call_id}")
async def get_call_detail(provider_call_id: str, tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        res = supabase_client.table("call_logs") \
            .select("status, provider_call_id, "
                    "leads(caller_name, phone_number, core_interest, call_outcome, raw_transcript, "
                    "call_duration_seconds, call_timestamp, contact_id)") \
            .eq("tenant_id", tenant_id).eq("provider_call_id", provider_call_id) \
            .limit(1).execute()

        if not res.data:
            return {"status": "error", "message": "Call not found"}

        row = res.data[0]
        lead = row.get("leads") or {}
        call = {
            "caller_name": lead.get("caller_name"),
            "phone_number": lead.get("phone_number"),
            "core_interest": lead.get("core_interest"),
            "call_outcome": lead.get("call_outcome"),
            "raw_transcript": lead.get("raw_transcript"),
            "call_duration_seconds": lead.get("call_duration_seconds"),
            "call_timestamp": lead.get("call_timestamp"),
            "contact_id": lead.get("contact_id"),
            "provider_call_id": row.get("provider_call_id"),
            "status": row.get("status"),
        }

        return {"status": "success", "call": call}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Dashboard summary: today's call count, new-lead count, and a recent-leads feed.
@app.get("/dashboard")
async def get_dashboard(tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        start_of_day = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
        today_res = supabase_client.table("leads").select("id", count="exact", head=True) \
            .eq("tenant_id", tenant_id) \
            .gte("call_timestamp", start_of_day.isoformat()) \
            .lt("call_timestamp", end_of_day.isoformat()) \
            .execute()
        today_calls = today_res.count or 0

        new_lead_status = supabase_client.table("lead_statuses").select("id") \
            .eq("tenant_id", tenant_id).eq("key", "new_lead").limit(1).execute()
        if new_lead_status.data:
            new_leads_res = supabase_client.table("contacts").select("id", count="exact", head=True) \
                .eq("tenant_id", tenant_id) \
                .eq("lead_status_id", new_lead_status.data[0]["id"]) \
                .execute()
            new_leads = new_leads_res.count or 0
        else:
            new_leads = 0

        recent_res = supabase_client.table("leads") \
            .select("caller_name, core_interest, call_outcome, call_timestamp, contact_id") \
            .eq("tenant_id", tenant_id) \
            .order("call_timestamp", desc=True) \
            .limit(8) \
            .execute()

        return {
            "status": "success",
            "today_calls": today_calls,
            "new_leads": new_leads,
            "recent_leads": recent_res.data,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Return the tenant's current merged KB for a quick onboarding preview.
@app.get("/kb/preview")
async def kb_preview(tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)
        res = supabase_client.table("knowledge_base").select("structured_data") \
            .eq("tenant_id", tenant_id).eq("is_active", True).limit(1).execute()
        kb = res.data[0]["structured_data"] if res.data else {}
        return {"status": "success", "kb": kb}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Links a Supabase Auth user to the tenant they claim. Upsert by user_id (the
# profiles PK) so re-linking (e.g. a second onboarding pass) just repoints it.
@app.post("/profiles/link")
async def link_profile(req: LinkProfileRequest):
    try:
        tenant_id = get_tenant_id(req.tenant_slug)

        supabase_client.table("profiles").upsert(
            {"user_id": req.user_id, "tenant_id": tenant_id},
            on_conflict="user_id",
        ).execute()

        return {"status": "success", "user_id": req.user_id, "tenant_id": tenant_id}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/profiles/{user_id}")
async def get_profile(user_id: str):
    try:
        res = supabase_client.table("profiles").select("tenants(slug, name)") \
            .eq("user_id", user_id).limit(1).execute()

        if not res.data or not res.data[0].get("tenants"):
            return {"status": "error", "message": "no tenant linked"}

        return {"status": "success", "tenant": res.data[0]["tenants"]}
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
    

# All contacts for a tenant, with their status + children nested in one query.
@app.get("/contacts")
async def get_contacts(tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)
        res = supabase_client.table("contacts") \
            .select("id, first_name, last_name, phone, email, do_not_contact, created_at, "
                    "lead_statuses(key, label, color), "
                    "children(name, age, program_interest)") \
            .eq("tenant_id", tenant_id) \
            .order("created_at", desc=True) \
            .execute()
        return {"status": "success", "contacts": res.data}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Single contact + its call activity. .eq("tenant_id", tenant_id) on the contact
# lookup enforces isolation — a contact_id from another tenant just 404s via .single().
@app.get("/contacts/{contact_id}")
async def get_contact_detail(contact_id: str, tenant_slug: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        contact = supabase_client.table("contacts") \
            .select("id, first_name, last_name, phone, email, do_not_contact, created_at, "
                    "lead_statuses(key, label, color), "
                    "children(name, age, program_interest)") \
            .eq("id", contact_id).eq("tenant_id", tenant_id).single().execute()

        leads = supabase_client.table("leads") \
            .select("caller_name, core_interest, call_outcome, raw_transcript, call_timestamp") \
            .eq("contact_id", contact_id).eq("tenant_id", tenant_id) \
            .order("call_timestamp", desc=True).execute()

        calls = supabase_client.table("call_logs") \
            .select("status, created_at, provider_call_id") \
            .eq("contact_id", contact_id).eq("tenant_id", tenant_id) \
            .order("created_at", desc=True).execute()

        activity = [
            {"type": "lead", "timestamp": l["call_timestamp"], "caller_name": l["caller_name"],
             "core_interest": l["core_interest"], "call_outcome": l["call_outcome"],
             "raw_transcript": l["raw_transcript"]}
            for l in leads.data
        ] + [
            {"type": "call_log", "timestamp": c["created_at"], "status": c["status"],
             "provider_call_id": c["provider_call_id"]}
            for c in calls.data
        ]
        activity.sort(key=lambda a: a["timestamp"] or "", reverse=True)

        return {"status": "success", "contact": contact.data, "activity": activity}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# TCPA compliance gate: decides whether a contact may be dialed right now.
# Pure decision logic only — does not place calls. Checks, in order: DNC,
# calling-hours window (8am-9pm in the tenant's local timezone), and retry limits.
def can_dial(contact: dict, tenant: dict) -> tuple[bool, str]:
    if contact.get("do_not_contact") is True:
        return False, "dnc"

    tz_name = tenant.get("timezone") or "America/Chicago"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("America/Chicago")

    local_now = datetime.now(tz)
    if not (8 <= local_now.hour < 21):
        return False, "outside_calling_hours"

    logs = supabase_client.table("call_logs") \
        .select("created_at") \
        .eq("contact_id", contact["id"]) \
        .order("created_at", desc=True) \
        .execute()

    if len(logs.data) >= 2:
        return False, "max_retries"

    if logs.data:
        last_attempt = datetime.fromisoformat(logs.data[0]["created_at"])
        if datetime.now(timezone.utc) - last_attempt < timedelta(hours=24):
            return False, "retry_too_soon"

    return True, "ok"


# Create a draft campaign (audience + goal only — no dialing/scheduling logic yet).
@app.post("/campaigns")
async def create_campaign(req: CreateCampaignRequest):
    try:
        tenant_id = get_tenant_id(req.tenant_slug)

        res = supabase_client.table("campaigns").insert({
            "tenant_id": tenant_id,
            "name": req.name,
            "goal": req.goal,
            "audience_status_key": req.audience_status_key,
            "scheduled_at": req.scheduled_at,
        }).execute()

        return {"status": "success", "campaign": res.data[0]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Audience preview: contacts matching a lead status for this tenant, excluding do_not_contact.
@app.get("/campaigns/audience")
async def get_campaign_audience(tenant_slug: str, status_key: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        res = supabase_client.table("contacts") \
            .select("id, first_name, phone, lead_status_id, lead_statuses!inner(key)") \
            .eq("tenant_id", tenant_id) \
            .eq("do_not_contact", False) \
            .eq("lead_statuses.key", status_key) \
            .not_.is_("phone", "null") \
            .execute()

        contacts = [
            {"id": c["id"], "first_name": c["first_name"], "phone": c["phone"], "lead_status_id": c["lead_status_id"]}
            for c in res.data
        ]

        return {"status": "success", "count": len(contacts), "contacts": contacts}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Test endpoint for the TCPA gate — does not dial, just reports the decision.
@app.get("/campaigns/can-dial")
async def check_can_dial(tenant_slug: str, contact_id: str):
    try:
        tenant_id = get_tenant_id(tenant_slug)

        tenant = supabase_client.table("tenants").select("*").eq("id", tenant_id).single().execute()
        contact = supabase_client.table("contacts").select("*") \
            .eq("id", contact_id).eq("tenant_id", tenant_id).single().execute()

        allowed, reason = can_dial(contact.data, tenant.data)
        return {"status": "success", "can_dial": allowed, "reason": reason}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# Launch a campaign: marks it active and hands off to Inngest's run-campaign
# function, which walks the audience and dials TCPA-approved contacts. Returns immediately.
@app.post("/campaigns/{campaign_id}/launch")
async def launch_campaign(campaign_id: str):
    try:
        campaign = supabase_client.table("campaigns").select("tenant_id").eq("id", campaign_id).single().execute()
        tenant_id = campaign.data["tenant_id"]

        supabase_client.table("campaigns").update({"status": "active"}).eq("id", campaign_id).execute()

        await inngest_client.send(inngest.Event(
            name="campaign/launch.requested",
            data={"campaign_id": campaign_id, "tenant_id": tenant_id},
        ))

        return {"status": "success", "message": "campaign launching"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# List of tenants for the dashboard's tenant picker.
@app.get("/tenants")
async def list_tenants():
    try:
        res = supabase_client.table("tenants").select("slug, name").order("created_at", desc=True).execute()
        return {"status": "success", "tenants": res.data}
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

        seed_lead_statuses(res.data[0]["id"])

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
    