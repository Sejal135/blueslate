"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { tokens } from "../../tokens";
import TopNav from "../../components/TopNav";

const API = process.env.NEXT_PUBLIC_API_URL;

type Child = { name: string; age: number | null; program_interest: string };
type Status = { key: string; label: string; color: string } | null;
type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  do_not_contact: boolean;
  created_at: string;
  lead_statuses: Status;
  children: Child[];
};
type LeadActivity = {
  type: "lead";
  timestamp: string | null;
  caller_name: string;
  core_interest: string;
  call_outcome: string;
  raw_transcript: string;
};
type CallLogActivity = {
  type: "call_log";
  timestamp: string | null;
  status: string;
  provider_call_id: string;
};
type Activity = LeadActivity | CallLogActivity;

const humanize = (s: string) => (s ? s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

export default function ContactDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant_slug") || "";

  const [contact, setContact] = useState<Contact | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!params.id || !tenantSlug) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API}/contacts/${params.id}?tenant_slug=${tenantSlug}`);
        const json = await res.json();
        if (json.status === "success") {
          setContact(json.contact);
          setActivity(json.activity);
        } else setError(json.message || "Could not load this contact.");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.id, tenantSlug]);

  const fullName = (c: Contact) => `${c.first_name} ${c.last_name}`.trim() || "Unknown";
  const fmtDateTime = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

  const card = { background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24, marginBottom: 20 };
  const sectionTitle = { fontSize: 18, fontWeight: 600, margin: "0 0 16px" };

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      <TopNav active="contacts" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        <Link href="/contacts" style={{ color: tokens.textSecondary, fontSize: 14, textDecoration: "none" }}>
          ← Back to contacts
        </Link>

        {error && <p style={{ color: tokens.brandCoral, marginTop: 20 }}>{error}</p>}

        {loading ? (
          <p style={{ color: tokens.textMuted, marginTop: 20 }}>Loading…</p>
        ) : !contact ? (
          !error && <p style={{ color: tokens.textMuted, marginTop: 20 }}>Contact not found.</p>
        ) : (
          <>
            {/* Hero */}
            <div style={{ ...card, marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>{fullName(contact)}</h1>
                {contact.do_not_contact && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: tokens.brandCoral, background: `${tokens.brandCoral}18`, padding: "2px 8px", borderRadius: 12 }}>
                    DNC
                  </span>
                )}
                {contact.lead_statuses ? (
                  <span style={{ display: "inline-block", fontSize: 13, fontWeight: 600, color: contact.lead_statuses.color, background: `${contact.lead_statuses.color}18`, padding: "5px 12px", borderRadius: 20 }}>
                    {contact.lead_statuses.label}
                  </span>
                ) : (
                  <span style={{ fontSize: 14, color: tokens.textMuted }}>No status</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 32, marginTop: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Phone</div>
                  <div style={{ fontSize: 15, color: contact.phone ? tokens.textPrimary : tokens.textMuted, marginTop: 4 }}>
                    {contact.phone || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Email</div>
                  <div style={{ fontSize: 15, color: contact.email ? tokens.textPrimary : tokens.textMuted, marginTop: 4 }}>
                    {contact.email || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: tokens.textMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>Added</div>
                  <div style={{ fontSize: 15, color: tokens.textMuted, marginTop: 4 }}>{fmtDateTime(contact.created_at)}</div>
                </div>
              </div>
            </div>

            {/* Children */}
            <div style={card}>
              <h2 style={sectionTitle}>Children</h2>
              {contact.children.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {contact.children.map((ch, i) => (
                    <span key={i} style={{ fontSize: 14, color: tokens.textSecondary, background: tokens.surfaceSubtle, padding: "8px 14px", borderRadius: 8 }}>
                      {ch.name}
                      {ch.age != null ? ` · ${ch.age}` : ""}
                      {ch.program_interest ? ` · ${ch.program_interest}` : ""}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ color: tokens.textMuted, fontSize: 14, margin: 0 }}>No children on file.</p>
              )}
            </div>

            {/* Activity */}
            <div style={card}>
              <h2 style={sectionTitle}>Activity</h2>
              {activity.length === 0 ? (
                <p style={{ color: tokens.textMuted, fontSize: 14, margin: 0 }}>No activity yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activity.map((a, i) => (
                    <div key={i} style={{ border: `1px solid ${tokens.borderDefault}`, borderRadius: 10, padding: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: tokens.textPrimary }}>
                            {a.type === "lead" ? humanize(a.call_outcome) || "Call" : humanize(a.status) || "Call"}
                          </span>
                          {a.type === "lead" && a.core_interest && (
                            <span style={{ fontSize: 13, color: tokens.textMuted }}>· {a.core_interest}</span>
                          )}
                        </div>
                        <span style={{ fontSize: 13, color: tokens.textMuted }}>{fmtDateTime(a.timestamp)}</span>
                      </div>

                      {a.type === "lead" && a.raw_transcript && (
                        <div style={{ marginTop: 10 }}>
                          <button
                            onClick={() => setExpanded(expanded === i ? null : i)}
                            style={{ background: "none", border: "none", padding: 0, color: tokens.brandTeal, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                          >
                            {expanded === i ? "Hide transcript" : "View transcript"}
                          </button>
                          {expanded === i && (
                            <div style={{ marginTop: 10, background: tokens.surfaceSubtle, borderRadius: 8, padding: 14, fontSize: 13, color: tokens.textSecondary, whiteSpace: "pre-wrap" }}>
                              {a.raw_transcript}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
