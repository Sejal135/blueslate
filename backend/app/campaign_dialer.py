import os
import httpx
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Stateless client — main.py has its own instance too (same pattern as kb_ingestion.py).
supabase_client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
)

RETELL_API_KEY = os.getenv("RETELL_API_KEY")
RETELL_FROM_NUMBER = os.getenv("RETELL_FROM_NUMBER", "+18664851671")


# Mirrors main.py's can_dial. Duplicated (not imported) to avoid a circular import:
# main.py imports inngest_functions, so inngest_functions/this module can't import main.
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


# Mirrors main.py's format_kb_for_agent. Duplicated for the same reason as can_dial.
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


def load_campaign(campaign_id: str) -> dict:
    res = supabase_client.table("campaigns").select("*").eq("id", campaign_id).single().execute()
    return res.data


def load_tenant_and_kb(tenant_id: str) -> dict:
    tenant = supabase_client.table("tenants").select("slug, name, voice_id, timezone") \
        .eq("id", tenant_id).single().execute()

    kb_rows = supabase_client.table("knowledge_base").select("structured_data") \
        .eq("tenant_id", tenant_id).eq("is_active", True).limit(1).execute()
    kb = kb_rows.data[0]["structured_data"] if kb_rows.data else {}

    return {"tenant": tenant.data, "knowledge": format_kb_for_agent(kb)}


# Mirrors GET /campaigns/audience's query exactly.
def load_audience(tenant_id: str, status_key: str) -> list[dict]:
    res = supabase_client.table("contacts") \
        .select("id, first_name, phone, lead_status_id, do_not_contact, lead_statuses!inner(key)") \
        .eq("tenant_id", tenant_id) \
        .eq("do_not_contact", False) \
        .eq("lead_statuses.key", status_key) \
        .not_.is_("phone", "null") \
        .execute()
    return res.data


def set_campaign_status(campaign_id: str, status: str) -> str:
    supabase_client.table("campaigns").update({"status": status}).eq("id", campaign_id).execute()
    return status


# One dial attempt for one contact: TCPA re-check, then dial-or-skip, then log.
# Always writes a call_logs row (dialed/skipped_.../failed) and never raises —
# a transient Retell error must not trigger an Inngest function-level retry
# that could end up placing a second call to the same contact.
async def process_contact(tenant_id: str, campaign_id: str, tenant: dict, tenant_slug: str,
                           knowledge: str, contact: dict) -> dict:
    allowed, reason = can_dial(contact, tenant)
    if not allowed:
        supabase_client.table("call_logs").insert({
            "tenant_id": tenant_id,
            "contact_id": contact["id"],
            "status": f"skipped_{reason}",
        }).execute()
        return {"contact_id": contact["id"], "result": f"skipped_{reason}"}

    payload = {
        "from_number": RETELL_FROM_NUMBER,
        "to_number": contact["phone"],
        "metadata": {"tenant_slug": tenant_slug, "campaign_id": campaign_id},
        "retell_llm_dynamic_variables": {
            "business_name": tenant.get("name") or "our program",
            "knowledge": knowledge,
        },
    }
    if tenant.get("voice_id"):
        payload["agent_override"] = {"agent": {"voice_id": tenant["voice_id"]}}

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(
                "https://api.retellai.com/v2/create-phone-call",
                headers={"Authorization": f"Bearer {RETELL_API_KEY}", "Content-Type": "application/json"},
                json=payload,
            )
        if r.status_code >= 400:
            raise RuntimeError(f"Retell {r.status_code}: {r.text}")
        provider_call_id = r.json().get("call_id")
    except Exception as e:
        supabase_client.table("call_logs").insert({
            "tenant_id": tenant_id,
            "contact_id": contact["id"],
            "status": "failed",
        }).execute()
        return {"contact_id": contact["id"], "result": "failed", "error": str(e)}

    supabase_client.table("call_logs").insert({
        "tenant_id": tenant_id,
        "contact_id": contact["id"],
        "provider_call_id": provider_call_id,
        "status": "dialed",
    }).execute()
    return {"contact_id": contact["id"], "result": "dialed", "provider_call_id": provider_call_id}
