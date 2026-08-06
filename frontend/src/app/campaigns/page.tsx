"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tokens } from "../tokens";
import TopNav from "../components/TopNav";
import { useAuth, signOut } from "../lib/useAuth";

const API = process.env.NEXT_PUBLIC_API_URL;

type Tenant = { slug: string; name: string };

const STATUSES = [
  { key: "new_lead", label: "New lead", color: "#1A6CF0" },
  { key: "needs_callback", label: "Needs callback", color: "#F5A623" },
  { key: "trial_booked", label: "Trial booked", color: "#0EA98B" },
  { key: "not_interested", label: "Not interested", color: "#94A3B8" },
];

const GOALS = [
  { key: "reengage_past_leads", label: "Re-engage past leads", desc: "Warmly reconnect with people who showed interest but didn't enroll." },
  { key: "fill_summer_camp", label: "Fill summer camp spots", desc: "Let families know spots are open before camp fills up." },
  { key: "follow_up_trial", label: "Follow up after a trial", desc: "Check in with a family whose child tried a class but didn't enroll." },
  { key: "winback_inactive", label: "Win back inactive families", desc: "Reconnect with families who've gone quiet." },
  { key: "follow_up_noshow", label: "Follow up no-shows", desc: "Reach out to families who booked a trial but didn't show." },
  { key: "custom", label: "Custom", desc: "Write your own goal for this campaign." },
];

export default function CampaignsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  const [statusKey, setStatusKey] = useState("");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceError, setAudienceError] = useState("");

  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");

  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [launchSuccess, setLaunchSuccess] = useState("");

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
    if (!tenant || !statusKey) {
      setAudienceCount(null);
      return;
    }
    setAudienceLoading(true);
    setAudienceError("");
    (async () => {
      try {
        const res = await fetch(`${API}/campaigns/audience?tenant_slug=${tenant.slug}&status_key=${statusKey}`);
        const json = await res.json();
        if (json.status === "success") setAudienceCount(json.count);
        else {
          setAudienceError(json.message || "Could not load audience.");
          setAudienceCount(null);
        }
      } catch {
        setAudienceError("Could not reach the server.");
        setAudienceCount(null);
      } finally {
        setAudienceLoading(false);
      }
    })();
  }, [tenant, statusKey]);

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  async function handleLaunch() {
    if (!tenant) return;
    setLaunching(true);
    setLaunchError("");
    setLaunchSuccess("");
    try {
      const createRes = await fetch(`${API}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_slug: tenant.slug, name, goal, audience_status_key: statusKey }),
      });
      const createJson = await createRes.json();
      if (createJson.status !== "success") {
        setLaunchError(createJson.message || "Could not create campaign.");
        return;
      }

      const launchRes = await fetch(`${API}/campaigns/${createJson.campaign.id}/launch`, { method: "POST" });
      const launchJson = await launchRes.json();
      if (launchJson.status !== "success") {
        setLaunchError(launchJson.message || "Could not launch campaign.");
        return;
      }

      setLaunchSuccess(`Campaign launching — audience of ${audienceCount} ${audienceCount === 1 ? "contact" : "contacts"}`);
    } catch {
      setLaunchError("Could not reach the server.");
    } finally {
      setLaunching(false);
    }
  }

  const canLaunch = !!statusKey && !!goal && !!name.trim() && audienceCount !== null && audienceCount > 0 && !launching;

  const card = { background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24, marginBottom: 20 };
  const sectionTitle = { fontSize: 18, fontWeight: 600, margin: "0 0 4px" };
  const sectionHint = { color: tokens.textSecondary, fontSize: 14, margin: "0 0 16px" };

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
        active="campaigns"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {tenant && <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{tenant.name}</span>}
            {logoutButton}
          </div>
        }
      />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Launch a campaign</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          Pick an audience and a goal, then Blueslate calls them for you.
        </p>

        {profileError ? (
          <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 48, textAlign: "center", color: tokens.textMuted, fontSize: 15 }}>
            {profileError}
          </div>
        ) : (
          <>
        {/* Question 1 — audience */}
        <div style={card}>
          <h2 style={sectionTitle}>1. Who do you want to reach?</h2>
          <p style={sectionHint}>Pick the status that defines your audience.</p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {STATUSES.map((s) => {
              const selected = statusKey === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setStatusKey(s.key)}
                  style={{
                    textAlign: "left", cursor: "pointer",
                    background: selected ? "rgba(14,169,139,0.08)" : tokens.surfaceBase,
                    border: `2px solid ${selected ? tokens.brandTeal : tokens.borderDefault}`,
                    borderRadius: 12, padding: "12px 16px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: s.color, display: "inline-block" }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: tokens.textPrimary }}>{s.label}</span>
                </button>
              );
            })}
          </div>

          {statusKey && (
            <div style={{ marginTop: 16 }}>
              {audienceLoading ? (
                <p style={{ color: tokens.textMuted, fontSize: 14, margin: 0 }}>Counting audience…</p>
              ) : audienceError ? (
                <p style={{ color: tokens.brandCoral, fontSize: 14, margin: 0 }}>{audienceError}</p>
              ) : audienceCount === 0 ? (
                <p style={{ color: tokens.brandCoral, fontSize: 14, margin: 0 }}>No contacts match this status.</p>
              ) : audienceCount !== null ? (
                <div style={{ display: "inline-block", background: "rgba(14,169,139,0.08)", color: tokens.brandTeal, fontSize: 14, fontWeight: 600, padding: "6px 14px", borderRadius: 20 }}>
                  {audienceCount} {audienceCount === 1 ? "contact" : "contacts"}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Question 2 — goal */}
        <div style={card}>
          <h2 style={sectionTitle}>2. What's the goal?</h2>
          <p style={sectionHint}>This shapes how the agent frames the call.</p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {GOALS.map((g) => {
              const selected = goal === g.key;
              return (
                <button
                  key={g.key}
                  onClick={() => setGoal(g.key)}
                  style={{
                    textAlign: "left", cursor: "pointer",
                    background: selected ? "rgba(14,169,139,0.08)" : tokens.surfaceBase,
                    border: `2px solid ${selected ? tokens.brandTeal : tokens.borderDefault}`,
                    borderRadius: 12, padding: 16,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 600, color: tokens.textPrimary }}>{g.label}</div>
                  <div style={{ fontSize: 13, color: tokens.textMuted, marginTop: 4 }}>{g.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Question 3 — name + launch */}
        <div style={card}>
          <h2 style={sectionTitle}>3. Name your campaign</h2>
          <p style={sectionHint}>Just for your own reference.</p>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Summer camp push — August"
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${tokens.borderDefault}`, borderRadius: 8, fontSize: 14, fontFamily: tokens.fontSans, boxSizing: "border-box" }}
          />

          {audienceCount !== null && audienceCount > 0 && (
            <p style={{ fontSize: 14, color: tokens.textSecondary, margin: "16px 0 0" }}>
              <strong style={{ color: tokens.textPrimary }}>{audienceCount} {audienceCount === 1 ? "contact" : "contacts"}</strong> will be called when you launch.
            </p>
          )}

          <button
            onClick={handleLaunch}
            disabled={!canLaunch}
            style={{
              marginTop: 16, width: "100%",
              background: canLaunch ? tokens.brandTeal : tokens.borderDefault,
              color: "#fff", border: "none", borderRadius: 8, padding: "12px 20px",
              fontSize: 15, fontWeight: 600, cursor: canLaunch ? "pointer" : "default",
            }}
          >
            {launching ? "Launching…" : "Launch campaign"}
          </button>

          {launchError && <p style={{ color: tokens.brandCoral, fontSize: 14, marginTop: 12 }}>{launchError}</p>}
          {launchSuccess && (
            <p style={{ color: tokens.brandTeal, fontSize: 14, fontWeight: 600, marginTop: 12 }}>{launchSuccess}</p>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
