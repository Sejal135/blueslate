"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tokens } from "../tokens";
import TopNav from "../components/TopNav";
import { useAuth, signOut } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL;

type Call = {
  caller_name: string;
  phone_number: string;
  call_outcome: string;
  call_duration_seconds: number | null;
  call_timestamp: string;
  contact_id: string | null;
  provider_call_id: string | null;
  status: string | null;
};
type Tenant = { slug: string; name: string };

const OUTCOME_COLORS: Record<string, string> = {
  booked_trial: "#0EA98B",
  callback_requested: "#F5A623",
  not_interested: "#94A3B8",
  general_inquiry: "#1A6CF0",
};
const outcomeColor = (outcome: string) => OUTCOME_COLORS[outcome] || "#64748B";
const humanize = (s: string) => (s ? s.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : "");

export default function CallsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [calls, setCalls] = useState<Call[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError("");
    (async () => {
      try {
        const res = await fetch(`${API}/profiles/${user.id}`);
        const json = await res.json();
        if (json.status === "success") setTenant(json.tenant);
        else setProfileError("No franchise linked to this account.");
      } catch {
        setProfileError("Could not reach the server.");
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [user]);

  useEffect(() => {
    if (!tenant) return;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API}/calls?tenant_slug=${tenant.slug}`);
        const json = await res.json();
        if (json.status === "success") setCalls(json.calls);
        else setError(json.message || "Could not load calls.");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [tenant]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  const fmtDateTime = (s: string) => (s ? new Date(s).toLocaleString() : "—");
  const fmtDuration = (secs: number | null) => {
    if (secs == null) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const th = {
    padding: "16px 20px", textAlign: "left" as const, fontSize: 13, fontWeight: 600,
    color: tokens.textMuted, textTransform: "uppercase" as const, letterSpacing: 0.5,
    borderBottom: `1px solid ${tokens.borderDefault}`,
  };
  const td = {
    padding: "18px 20px", fontSize: 15, color: tokens.textPrimary,
    borderBottom: `1px solid ${tokens.surfaceSubtle}`, verticalAlign: "middle" as const,
  };

  // Don't flash any page chrome until we know who's logged in and what they can see.
  if (authLoading || (user && profileLoading)) {
    return (
      <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: tokens.textMuted }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return null; // redirecting to /login
  }

  const logoutButton = (
    <button
      onClick={handleLogout}
      style={{
        background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "rgba(255,255,255,0.85)",
        borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
      }}
    >
      Log out
    </button>
  );

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      <TopNav
        active="calls"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {tenant && <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{tenant.name}</span>}
            {logoutButton}
          </div>
        }
      />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Page header */}
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Calls</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          {tenant ? `${tenant.name} — ` : ""}{calls.length} {calls.length === 1 ? "call" : "calls"} logged by Blueslate
        </p>

        {profileError ? (
          <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 48, textAlign: "center", color: tokens.textMuted, fontSize: 15 }}>
            {profileError}
          </div>
        ) : (
          <>
            {error && <p style={{ color: tokens.brandCoral }}>{error}</p>}
            {loading ? (
              <p style={{ color: tokens.textMuted }}>Loading…</p>
            ) : calls.length === 0 ? (
              <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 48, textAlign: "center", color: tokens.textMuted, fontSize: 15 }}>
                No calls yet for this franchise.
              </div>
            ) : (
              <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={th}>Caller</th>
                      <th style={th}>Phone</th>
                      <th style={th}>Outcome</th>
                      <th style={th}>Duration</th>
                      <th style={th}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.map((c, i) => {
                      const clickable = !!c.provider_call_id;
                      return (
                        <tr
                          key={i}
                          onClick={() => clickable && router.push(`/calls/${c.provider_call_id}`)}
                          style={{ cursor: clickable ? "pointer" : "default" }}
                        >
                          <td style={td}>
                            <span style={{ fontWeight: 600 }}>{c.caller_name || "Unknown"}</span>
                          </td>
                          <td style={{ ...td, color: c.phone_number && c.phone_number !== "Unknown" ? tokens.textPrimary : tokens.textMuted }}>
                            {c.phone_number && c.phone_number !== "Unknown" ? c.phone_number : "—"}
                          </td>
                          <td style={td}>
                            {c.call_outcome ? (
                              <span style={{ display: "inline-block", fontSize: 13, fontWeight: 600, color: outcomeColor(c.call_outcome), background: `${outcomeColor(c.call_outcome)}18`, padding: "5px 12px", borderRadius: 20 }}>
                                {humanize(c.call_outcome)}
                              </span>
                            ) : (
                              <span style={{ fontSize: 14, color: tokens.textMuted }}>—</span>
                            )}
                          </td>
                          <td style={{ ...td, color: tokens.textMuted, fontSize: 14 }}>{fmtDuration(c.call_duration_seconds)}</td>
                          <td style={{ ...td, color: tokens.textMuted, fontSize: 14 }}>{fmtDateTime(c.call_timestamp)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
