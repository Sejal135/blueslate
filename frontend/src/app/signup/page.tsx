"use client";

import { useState, useEffect, Suspense, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { tokens } from "../tokens";

const API = process.env.NEXT_PUBLIC_API_URL;

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get("tenant_slug") || "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  // No tenant-less signup — an account always attaches to a franchise built in
  // onboarding. Missing/empty tenant_slug means they skipped that step.
  useEffect(() => {
    if (!tenantSlug) {
      router.push("/onboarding");
    }
  }, [tenantSlug, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setSubmitting(false);
      setError(error.message);
      return;
    }
  
    // Link the franchise built during onboarding as soon as we have a user id —
    // don't wait for a session, since email confirmation being ON means data.session
    // is null at signup time even though data.user already exists.
    if (data.user) {
      try {
        const linkRes = await fetch(`${API}/profiles/link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: data.user.id, tenant_slug: tenantSlug }),
        });
        const linkBody = await linkRes.json();
        if (linkBody.status !== "success") {
          console.error("profiles/link failed:", linkBody.message);
        }
      } catch (linkErr) {
        console.error("profiles/link request failed:", linkErr);
      }
    }

    setSubmitting(false);
    if (data.session) {
      router.push("/dashboard");
    } else {
      setCheckEmail(true);
    }
  }


  const label = { fontSize: 14, fontWeight: 600 as const, color: tokens.textPrimary, marginBottom: 8, display: "block" };
  const input = { width: "100%", padding: "10px 12px", border: `1px solid ${tokens.borderDefault}`, borderRadius: 8, fontSize: 14, fontFamily: tokens.fontSans, boxSizing: "border-box" as const };

  if (!tenantSlug) {
    return (
      <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
        <div style={{ background: tokens.brandSlate, padding: "16px 24px" }}>
          <div style={{ maxWidth: 760, margin: "0 auto" }}>
            <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>Blueslate</span>
          </div>
        </div>

        <div style={{ maxWidth: 420, margin: "0 auto", padding: "64px 24px" }}>
          <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24, textAlign: "center" }}>
            <p style={{ fontSize: 15, color: tokens.textPrimary, margin: 0, fontWeight: 600 }}>
              Let&apos;s set up your franchise first
            </p>
            <p style={{ fontSize: 14, color: tokens.textSecondary, margin: "8px 0 0" }}>
              Taking you to onboarding…
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      <div style={{ background: tokens.brandSlate, padding: "16px 24px" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>Blueslate</span>
        </div>
      </div>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "64px 24px" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Create your account</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          Set up access to your Blueslate dashboard.
        </p>

        <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 24 }}>
          {checkEmail ? (
            <div>
              <p style={{ fontSize: 15, color: tokens.textPrimary, margin: "0 0 8px", fontWeight: 600 }}>Check your email</p>
              <p style={{ fontSize: 14, color: tokens.textSecondary, margin: 0 }}>
                We sent a confirmation link to <strong>{email}</strong>. Confirm your address, then{" "}
                <Link href="/login" style={{ color: tokens.brandTeal, fontWeight: 600 }}>log in</Link>.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={label}>Email</label>
                <input
                  type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={input} placeholder="you@example.com"
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={label}>Password</label>
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
                {submitting ? "Creating account…" : "Create account"}
              </button>
            </form>
          )}
        </div>

        {!checkEmail && (
          <p style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 20, textAlign: "center" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: tokens.brandTeal, fontWeight: 600, textDecoration: "none" }}>Log in</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div />}>
      <SignupForm />
    </Suspense>
  );
}