"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { tokens } from "../tokens";
import TopNav from "../components/TopNav";

const API = process.env.NEXT_PUBLIC_API_URL;

type RecentLead = {
  caller_name: string;
  core_interest: string;
  call_outcome: string;
  call_timestamp: string;
  contact_id: string | null;
};
type Dashboard = { today_calls: number; new_leads: number; recent_leads: RecentLead[] };
type Tenant = { slug: string; name: string };

const OUTCOME_COLORS: Record<string, string> = {
  booked_trial: "#0EA98B",
  callback_requested: "#F5A623",
  not_interested: "#94A3B8",
  general_inquiry: "#1A6CF0",
};
const outcomeColor = (outcome: string) => OUTCOME_COLORS[outcome] || "#64748B";
const humanize = (s: string) => (s ? s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

export default function DashboardPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [slug, setSlug] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/tenants`);
        const json = await res.json();
        if (json.status === "success" && json.tenants.length) {
          setTenants(json.tenants);
          setSlug(json.tenants[0].slug);
        } else setError("No tenants found.");
      } catch {
        setError("Could not reach the server.");
      }
    })();
  }, []);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API}/dashboard?tenant_slug=${slug}`);
        const json = await res.json();
        if (json.status === "success") {
          setDashboard({ today_calls: json.today_calls, new_leads: json.new_leads, recent_leads: json.recent_leads });
        } else setError(json.message || "Could not load the dashboard.");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const fmtDateTime = (s: string) => (s ? new Date(s).toLocaleString() : "—");
  const tenantName = tenants.find((t) => t.slug === slug)?.name || "";

  const tile = { background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24 };
  const card = { background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24 };

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      <TopNav
        active="dashboard"
        right={
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "none", fontSize: 14, fontFamily: tokens.fontSans, background: "#fff", color: tokens.textPrimary, maxWidth: 340 }}
          >
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>
            ))}
          </select>
        }
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Page header */}
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Dashboard</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          {tenantName || "—"}
        </p>

        {error && <p style={{ color: tokens.brandCoral }}>{error}</p>}

        {loading ? (
          <p style={{ color: tokens.textMuted }}>Loading…</p>
        ) : dashboard ? (
          <>
            {/* Stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 28 }}>
              <div style={tile}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: tokens.brandTeal, display: "inline-block" }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: tokens.textMuted }}>Today&apos;s calls</span>
                </div>
                <div style={{ fontSize: 40, fontWeight: 700, color: tokens.textPrimary }}>{dashboard.today_calls}</div>
              </div>
              <div style={tile}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: tokens.brandBlue, display: "inline-block" }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: tokens.textMuted }}>New leads</span>
                </div>
                <div style={{ fontSize: 40, fontWeight: 700, color: tokens.textPrimary }}>{dashboard.new_leads}</div>
              </div>
            </div>

            {/* Recent leads */}
            <div style={card}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 16px" }}>Recent leads</h2>

              {dashboard.recent_leads.length === 0 ? (
                <p style={{ color: tokens.textMuted, fontSize: 14, margin: 0 }}>
                  No leads yet. Your first leads appear here after a call.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {dashboard.recent_leads.map((l, i) => {
                    const row = (
                      <div
                        style={{
                          border: `1px solid ${tokens.borderDefault}`, borderRadius: 10, padding: 16,
                          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10,
                          cursor: l.contact_id ? "pointer" : "default",
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15, color: tokens.textPrimary }}>
                            {l.caller_name && l.caller_name !== "Unknown" ? l.caller_name : "Unknown"}
                          </div>
                          {l.core_interest && l.core_interest !== "Unknown" && (
                            <div style={{ fontSize: 13, color: tokens.textMuted, marginTop: 2 }}>{l.core_interest}</div>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {l.call_outcome ? (
                            <span style={{ display: "inline-block", fontSize: 13, fontWeight: 600, color: outcomeColor(l.call_outcome), background: `${outcomeColor(l.call_outcome)}18`, padding: "5px 12px", borderRadius: 20 }}>
                              {humanize(l.call_outcome)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 13, color: tokens.textMuted }}>—</span>
                          )}
                          <span style={{ fontSize: 13, color: tokens.textMuted }}>{fmtDateTime(l.call_timestamp)}</span>
                        </div>
                      </div>
                    );
                    return l.contact_id ? (
                      <Link key={i} href={`/contacts/${l.contact_id}?tenant_slug=${slug}`} style={{ textDecoration: "none", color: "inherit" }}>
                        {row}
                      </Link>
                    ) : (
                      <div key={i}>{row}</div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
