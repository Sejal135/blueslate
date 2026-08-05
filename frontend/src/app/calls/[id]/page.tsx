"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { tokens } from "../../tokens";
import TopNav from "../../components/TopNav";

const API = process.env.NEXT_PUBLIC_API_URL;

type Call = {
  caller_name: string;
  phone_number: string;
  core_interest: string;
  call_outcome: string;
  raw_transcript: string | null;
  call_duration_seconds: number | null;
  call_timestamp: string;
  contact_id: string | null;
  provider_call_id: string;
  status: string | null;
};

const OUTCOME_COLORS: Record<string, string> = {
  booked_trial: "#0EA98B",
  callback_requested: "#F5A623",
  not_interested: "#94A3B8",
  general_inquiry: "#1A6CF0",
};
const outcomeColor = (outcome: string) => OUTCOME_COLORS[outcome] || "#64748B";
const humanize = (s: string) => (s ? s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

function CallDetailContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant_slug") || "";

  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!params.id || !tenantSlug) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API}/calls/${params.id}?tenant_slug=${tenantSlug}`);
        const json = await res.json();
        if (json.status === "success") setCall(json.call);
        else setError(json.message || "Could not load this call.");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id, tenantSlug]);

  const fmtDateTime = (s: string) => (s ? new Date(s).toLocaleString() : "—");
  const fmtDuration = (secs: number | null) => {
    if (secs == null) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const card = { background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24, marginBottom: 20 };
  const sectionTitle = { fontSize: 18, fontWeight: 600, margin: "0 0 16px" };

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      <TopNav active="calls" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <Link href="/calls" style={{ color: tokens.textSecondary, fontSize: 14, textDecoration: "none" }}>
          ← Back to calls
        </Link>

        {error && <p style={{ color: tokens.brandCoral, marginTop: 20 }}>{error}</p>}

        {loading ? (
          <p style={{ color: tokens.textMuted, marginTop: 20 }}>Loading…</p>
        ) : !call ? (
          !error && <p style={{ color: tokens.textMuted, marginTop: 20 }}>Call not found.</p>
        ) : (
          <>
            {/* Hero */}
            <div style={{ ...card, marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>{call.caller_name || "Unknown"}</h1>
                {call.call_outcome ? (
                  <span style={{ display: "inline-block", fontSize: 13, fontWeight: 600, color: outcomeColor(call.call_outcome), background: `${outcomeColor(call.call_outcome)}18`, padding: "5px 12px", borderRadius: 20 }}>
                    {humanize(call.call_outcome)}
                  </span>
                ) : (
                  <span style={{ fontSize: 14, color: tokens.textMuted }}>No outcome recorded</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 32, marginTop: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Phone</div>
                  <div style={{ fontSize: 15, color: call.phone_number && call.phone_number !== "Unknown" ? tokens.textPrimary : tokens.textMuted, marginTop: 4 }}>
                    {call.phone_number && call.phone_number !== "Unknown" ? call.phone_number : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</div>
                  <div style={{ fontSize: 15, color: tokens.textMuted, marginTop: 4 }}>{fmtDuration(call.call_duration_seconds)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Time</div>
                  <div style={{ fontSize: 15, color: tokens.textMuted, marginTop: 4 }}>{fmtDateTime(call.call_timestamp)}</div>
                </div>
                {call.core_interest && (
                  <div>
                    <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Interest</div>
                    <div style={{ fontSize: 15, color: tokens.textPrimary, marginTop: 4 }}>{call.core_interest}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Transcript */}
            <div style={card}>
              <h2 style={sectionTitle}>Transcript</h2>
              {call.raw_transcript ? (
                <div style={{ background: tokens.surfaceSubtle, borderRadius: 8, padding: 16, fontSize: 14, color: tokens.textSecondary, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {call.raw_transcript}
                </div>
              ) : (
                <p style={{ color: tokens.textMuted, fontSize: 14, margin: 0 }}>Transcript not available.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CallDetailPage() {
  return (
    <Suspense fallback={<div />}>
      <CallDetailContent />
    </Suspense>
  );
}