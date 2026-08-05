"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { tokens } from "../tokens";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    router.push("/dashboard");
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
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Log in</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          Welcome back to Blueslate.
        </p>

        <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={label}>Email</label>
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={input} placeholder="you@example.com"
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={label}>Password</label>
              <input
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={input} placeholder="Your password"
              />
            </div>

            <div style={{ textAlign: "right", marginBottom: 20 }}>
              <Link href="/forgot-password" style={{ color: tokens.brandTeal, fontSize: 13, fontWeight: 600, textDecoration: "none" }}>
                Forgot password?
              </Link>
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
              {submitting ? "Logging in…" : "Log in"}
            </button>
          </form>
        </div>

        <p style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 20, textAlign: "center" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" style={{ color: tokens.brandTeal, fontWeight: 600, textDecoration: "none" }}>Sign up</Link>
        </p>
      </div>
    </div>
  );
}
