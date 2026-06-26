"use client";

import { useState, useEffect, useRef } from "react";
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
  voiceId: string; kbReady: boolean;
};

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [navError, setNavError] = useState("");
  const [data, setData] = useState<OnboardingData>({
    activityId: "", activityName: "", brandId: "", brandName: "",
    tenantId: "", tenantSlug: "", voiceId: "", kbReady: false,
  });
  const update = (patch: Partial<OnboardingData>) => setData((d) => ({ ...d, ...patch }));

  const canContinue =
    step === 1 ? !!data.activityId :
    step === 2 ? !!data.brandId :
    step === 3 ? data.kbReady :
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
        {step === 3 && <Step3Ingestion data={data} update={update} />}
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

function Step3Ingestion({ data, update }: { data: OnboardingData; update: (p: Partial<OnboardingData>) => void }) {
  const [urlInput, setUrlInput] = useState("");
  const [jobs, setJobs] = useState<{ id: string; label: string; status: string; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function pollJob(jobId: string) {
    for (let i = 0; i < 60; i++) { // ~2 min ceiling
      await sleep(2000);
      try {
        const res = await fetch(`${API}/kb-jobs/${jobId}`);
        const json = await res.json();
        if (json.status !== "success") break;
        const job = json.job;
        setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: job.status, message: job.message || job.status } : j)));
        if (job.status === "completed") { update({ kbReady: true }); break; }
        if (job.status === "failed") break;
      } catch { break; }
    }
  }

  function addJob(id: string, label: string) {
    setJobs((prev) => [...prev, { id, label, status: "queued", message: "Queued…" }]);
    pollJob(id);
  }

  async function submitUrl() {
    if (!urlInput.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim(), tenant_slug: data.tenantSlug }),
      });
      const json = await res.json();
      if (json.job_id) { addJob(json.job_id, "Website"); setUrlInput(""); }
    } catch {} finally { setSubmitting(false); }
  }

  async function submitFile(file: File) {
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append("tenant_slug", data.tenantSlug);
      form.append("file", file);
      const res = await fetch(`${API}/ingest/file`, { method: "POST", body: form });
      const json = await res.json();
      if (json.job_id) addJob(json.job_id, file.name);
    } catch {} finally { setSubmitting(false); }
  }

  const card = { background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 20, marginTop: 12 };
  const label = { fontSize: 14, fontWeight: 600 as const, color: tokens.textPrimary, marginBottom: 8, display: "block" };

  return (
    <div>
      <h1 style={{ fontSize: 28, fontWeight: 600, margin: "8px 0 4px" }}>Let's learn about your franchise</h1>
      <p style={{ color: tokens.textSecondary, marginTop: 0 }}>Add your info any way that's easiest — do as many as you like. One is enough to continue.</p>

      <div style={card}>
        <label style={label}>Paste your website</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://yoursite.com"
            style={{ flex: 1, padding: "10px 12px", border: `1px solid ${tokens.borderDefault}`, borderRadius: 8, fontSize: 14, fontFamily: tokens.fontSans }}
          />
          <button
            onClick={submitUrl}
            disabled={submitting || !urlInput.trim()}
            style={{ background: tokens.brandTeal, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer", opacity: submitting || !urlInput.trim() ? 0.5 : 1 }}
          >
            Scrape
          </button>
        </div>
      </div>

      <div style={card}>
        <label style={label}>Or drop a file (PDF, DOCX, TXT)</label>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(e) => e.target.files?.[0] && submitFile(e.target.files[0])}
          style={{ fontSize: 14 }}
        />
      </div>

      <div style={card}>
        <label style={label}>Or record a quick voice note</label>
        <VoiceRecorder tenantSlug={data.tenantSlug} onJob={addJob} />
      </div>

      {jobs.length > 0 && (
        <div style={{ ...card, marginTop: 16 }}>
          {jobs.map((j) => {
            const done = j.status === "completed", failed = j.status === "failed";
            return (
              <div key={j.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${tokens.surfaceSubtle}` }}>
                <span style={{ fontSize: 14, color: tokens.textPrimary }}>{j.label}</span>
                <span style={{ fontSize: 13, color: done ? tokens.brandTeal : failed ? tokens.brandCoral : tokens.textMuted }}>
                  {done ? `✓ ${j.message}` : failed ? "Couldn't read that source" : j.message}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Records a voice note in-browser via MediaRecorder and uploads it to /ingest/voice.
// onJob hands the returned job id back to Step3Ingestion so it polls in the same list.
function VoiceRecorder({ tenantSlug, onJob }: { tenantSlug: string; onJob: (id: string, label: string) => void }) {
  const [state, setState] = useState<"idle" | "recording" | "uploading">("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);

  // Refs survive re-renders without triggering them — needed for the live recorder + timer.
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ask for mic access and start capturing audio chunks.
  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      // Collect audio as it streams in.
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      // When stopped, bundle the chunks into one file and upload it.
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); // release the mic
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await uploadVoice(blob);
      };

      recorder.start();
      recorderRef.current = recorder;
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("We couldn't access your mic. Check the browser permission and try again.");
    }
  }

  // Stop recording — triggers recorder.onstop above.
  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
  }

  // Send the recorded blob to the voice ingestion endpoint.
  async function uploadVoice(blob: Blob) {
    setState("uploading");
    try {
      const form = new FormData();
      form.append("tenant_slug", tenantSlug);
      form.append("file", blob, "voice-note.webm"); // filename ext tells Whisper the format
      const res = await fetch(`${API}/ingest/voice`, { method: "POST", body: form });
      const json = await res.json();
      if (json.job_id) onJob(json.job_id, "Voice note");
      else setError(json.message || "Upload failed.");
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setState("idle");
    }
  }

  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");

  return (
    <div>
      {state === "idle" && (
        <button
          onClick={startRecording}
          style={{ background: tokens.brandCoral, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
        >
          ● Record a voice note
        </button>
      )}
      {state === "recording" && (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={stopRecording}
            style={{ background: tokens.brandSlate, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 600, cursor: "pointer" }}
          >
            ■ Stop
          </button>
          <span style={{ color: tokens.brandCoral, fontWeight: 600 }}>● {mins}:{secs}</span>
        </div>
      )}
      {state === "uploading" && <span style={{ color: tokens.textMuted }}>Uploading…</span>}
      {error && <p style={{ color: tokens.brandCoral, fontSize: 13, marginBottom: 0 }}>{error}</p>}
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
