"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { tokens } from "../tokens";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  // The reset-link email lands here with a recovery token in the URL; the
  // Supabase client auto-exchanges it for a session (detectSessionInUrl).
  // Wait for that before allowing the form — otherwise updateUser() has no session to act on.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setChecking(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  const label = { fontSize: 14, fontWeight: 600 as const, color: tokens.textPrimary, marginBottom: 8, display: "block" };
  const input = { width: "100%", padding: "10px 12px", border: `1px solid ${tokens.borderDefault}`, borderRadius: 8, fontSize: 14, fontFamily: tokens.fontSans, boxSizing: "border-box" as const };

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      <div style={{ background: tokens.brandSlate, padding: "16px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>Blueslate</span>
        </div>
      </div>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "64px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Set a new password</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          Choose a new password for your account.
        </p>

        <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24 }}>
          {checking ? (
            <p style={{ color: tokens.textMuted, fontSize: 14, margin: 0 }}>Checking your reset link…</p>
          ) : done ? (
            <div>
              <p style={{ fontSize: 15, color: tokens.textPrimary, margin: "0 0 8px", fontWeight: 600 }}>Password updated</p>
              <p style={{ fontSize: 14, color: tokens.textSecondary, margin: 0 }}>Taking you to your dashboard…</p>
            </div>
          ) : !ready ? (
            <div>
              <p style={{ fontSize: 15, color: tokens.textPrimary, margin: "0 0 8px", fontWeight: 600 }}>This link is invalid or expired</p>
              <p style={{ fontSize: 14, color: tokens.textSecondary, margin: 0 }}>
                Request a new one from{" "}
                <Link href="/forgot-password" style={{ color: tokens.brandTeal, fontWeight: 600 }}>the reset page</Link>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 20 }}>
                <label style={label}>New password</label>
                <input
                  type="password" required minLength={6} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={input} placeholder="At least 6 characters"
                />
              </div>

              {error && <p style={{ color: tokens.brandCoral, fontSize: 14, margin: "0 0 16px" }}>{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", background: tokens.brandTeal, color: "#fff", border: "none",
                  borderRadius: 8, padding: "12px 20px", fontSize: 15, fontWeight: 600,
                  cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
