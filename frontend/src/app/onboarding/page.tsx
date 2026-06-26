"use client";

import { useState, useEffect } from "react";
import { tokens } from "../tokens";

const API = process.env.NEXT_PUBLIC_API_URL;
const STEPS = ["Activity", "Brand", "Knowledge", "Voice", "Go live"];
const ICONS: Record<string, string> = { esports: "🎮", coding: "💻" };

type Activity = { id: string; key: string; name: string };
type Brand = { id: string; key: string; name: string; is_independent: boolean };
type OnboardingData = {
  activityId: string; activityName: string;
  brandId: string; brandName: string;
  tenantId: string; tenantSlug: string;
  voiceId: string;
};

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [navError, setNavError] = useState("");
  const [data, setData] = useState<OnboardingData>({
    activityId: "", activityName: "", brandId: "", brandName: "",
    tenantId: "", tenantSlug: "", voiceId: "",
  });
  const update = (patch: Partial<OnboardingData>) => setData((d) => ({ ...d, ...patch }));

  const canContinue =
    step === 1 ? !!data.activityId :
    step === 2 ? !!data.brandId :
    true;

  const handleContinue = async () => {
    setNavError("");

    // Step 2 → create the franchise the first time, patch the same one on later passes.
    // One tenant per onboarding session, never a new row on Back-and-forward.
    if (step === 2) {
      setBusy(true);
      try {
        const url = data.tenantSlug
          ? `${API}/onboarding/tenant/${data.tenantSlug}`
          : `${API}/onboarding/tenant`;
        const res = await fetch(url, {
          method: data.tenantSlug ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activity_id: data.activityId, brand_id: data.brandId }),
        });
        const json = await res.json();
        if (json.status === "success") {
          update({ tenantId: json.tenant_id, tenantSlug: json.slug });
          setStep(3);
        } else {
          setNavError(json.message || "Could not save your franchise.");
        }
      } catch {
        setNavError("Could not reach the server.");
      } finally {
        setBusy(false);
      }
      return;
    }

    setStep((s) => Math.min(STEPS.length, s + 1));
  };

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      {/* Progress bar */}
      <div style={{ background: tokens.brandSlate, padding: "16px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", gap: 8 }}>
          {STEPS.map((label, i) => {
            const n = i + 1;
            const done = n < step, active = n === step;
            return (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 2, background: done || active ? tokens.brandTeal : "rgba(255,255,255,0.18)" }} />
                <div style={{ marginTop: 6, fontSize: 12, color: active ? "#fff" : "rgba(255,255,255,0.55)" }}>{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
        {step === 1 && <Step1Activity data={data} update={update} />}
        {step === 2 && <Step2Brand data={data} update={update} />}
        {step === 3 && <Placeholder title="Step 3 — Let us learn about your franchise" subtitle={data.tenantSlug ? `Franchise created: ${data.tenantSlug}` : undefined} />}
        {step === 4 && <Placeholder title="Step 4 — Choose your agent's voice" />}
        {step === 5 && <Placeholder title="Step 5 — Hear your agent" />}
      </div>

      {/* Nav */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 32px" }}>
        {navError && <p style={{ color: tokens.brandCoral, fontSize: 14 }}>{navError}</p>}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <button
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1 || busy}
            style={{ background: "transparent", border: "none", color: tokens.textMuted, cursor: step === 1 ? "default" : "pointer", fontSize: 14, opacity: step === 1 ? 0.4 : 1 }}
          >
            ← Back
          </button>
          <button
            onClick={handleContinue}
            disabled={!canContinue || busy}
            style={{
              background: canContinue && !busy ? tokens.brandTeal : tokens.borderDefault,
              color: canContinue && !busy ? "#fff" : tokens.textMuted,
              border: "none", borderRadius: 8, padding: "12px 28px",
              fontSize: 15, fontWeight: 600, cursor: canContinue && !busy ? "pointer" : "default",
            }}
          >
            {busy && step === 2 ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Step1Activity({ data, update }: { data: OnboardingData; update: (p: Partial<OnboardingData>) => void }) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/activities`);
        const json = await res.json();
        if (json.status === "success") setActivities(json.activities);
        else setError(json.message || "Could not load activities");
      } catch {
        setError("Could not reach the server. Is the backend running?");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: "8px 0 4px" }}>What kind of program do you run?</h1>
      <p style={{ color: tokens.textSecondary, marginTop: 0 }}>Pick your activity type to get started.</p>

      {loading && <p style={{ color: tokens.textMuted }}>Loading…</p>}
      {error && <p style={{ color: tokens.brandCoral }}>{error}</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
        {activities.map((a) => {
          const selected = data.activityId === a.id;
          return (
            <button
              key={a.id}
              // Changing activity invalidates the brand, so clear it — but KEEP the tenant
              // slug so step 2 patches the same franchise instead of creating a new one.
              onClick={() => update({ activityId: a.id, activityName: a.name, brandId: "", brandName: "" })}
              style={{
                textAlign: "left", cursor: "pointer",
                background: selected ? "rgba(14,169,139,0.08)" : tokens.surfaceBase,
                border: `2px solid ${selected ? tokens.brandTeal : tokens.borderDefault}`,
                borderRadius: 12, padding: 20,
              }}
            >
              <div style={{ fontSize: 28 }}>{ICONS[a.key] || "🎯"}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8, color: tokens.textPrimary }}>{a.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step2Brand({ data, update }: { data: OnboardingData; update: (p: Partial<OnboardingData>) => void }) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!data.activityId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/brands?activity_id=${data.activityId}`);
        const json = await res.json();
        if (json.status === "success") setBrands(json.brands);
        else setError(json.message || "Could not load brands");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [data.activityId]);

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: "8px 0 4px" }}>Which {data.activityName.toLowerCase()} brand?</h1>
      <p style={{ color: tokens.textSecondary, marginTop: 0 }}>Pick your franchise brand, or start as an independent operator.</p>

      {loading && <p style={{ color: tokens.textMuted }}>Loading…</p>}
      {error && <p style={{ color: tokens.brandCoral }}>{error}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
        {brands.map((b) => {
          const selected = data.brandId === b.id;
          return (
            <button
              key={b.id}
              // Keep the tenant slug so Continue patches the existing franchise.
              onClick={() => update({ brandId: b.id, brandName: b.name })}
              style={{
                textAlign: "left", cursor: "pointer",
                background: selected ? "rgba(14,169,139,0.08)" : tokens.surfaceBase,
                border: `2px solid ${selected ? tokens.brandTeal : tokens.borderDefault}`,
                borderRadius: 12, padding: "16px 20px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 600, color: tokens.textPrimary }}>{b.name}</span>
              <span style={{ fontSize: 12, color: b.is_independent ? tokens.textMuted : tokens.brandTeal }}>
                {b.is_independent ? "Start from scratch" : "Recognized brand"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Placeholder({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 40, textAlign: "center" }}>
      <p style={{ fontSize: 18, fontWeight: 600, color: tokens.textPrimary, margin: 0 }}>{title}</p>
      <p style={{ color: tokens.textMuted, marginBottom: 0 }}>{subtitle || "Coming in the next stage."}</p>
    </div>
  );
}
