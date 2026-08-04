"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { tokens } from "../tokens";

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
type Tenant = { slug: string; name: string };

export default function ContactsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [slug, setSlug] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
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
        const res = await fetch(`${API}/contacts?tenant_slug=${slug}`);
        const json = await res.json();
        if (json.status === "success") setContacts(json.contacts);
        else setError(json.message || "Could not load contacts.");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  const fullName = (c: Contact) => `${c.first_name} ${c.last_name}`.trim() || "Unknown";
  const fmtDate = (s: string) => (s ? new Date(s).toLocaleDateString() : "—");
  const tenantName = tenants.find((t) => t.slug === slug)?.name || "";

  const th = {
    padding: "16px 20px", textAlign: "left" as const, fontSize: 13, fontWeight: 600,
    color: tokens.textMuted, textTransform: "uppercase" as const, letterSpacing: 0.5,
    borderBottom: `1px solid ${tokens.borderDefault}`,
  };
  const td = {
    padding: "18px 20px", fontSize: 15, color: tokens.textPrimary,
    borderBottom: `1px solid ${tokens.surfaceSubtle}`, verticalAlign: "middle" as const,
  };

  return (
    <div style={{ minHeight: "100vh", background: tokens.surfaceSubtle, fontFamily: tokens.fontSans, color: tokens.textPrimary }}>
      {/* Nav */}
      <div style={{ background: tokens.brandSlate, padding: "18px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>Blueslate</span>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={{ padding: "10px 14px", borderRadius: 8, border: "none", fontSize: 14, fontFamily: tokens.fontSans, background: "#fff", color: tokens.textPrimary, maxWidth: 340 }}
          >
            {tenants.map((t) => (
              <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 24px" }}>
        {/* Page header */}
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: "0 0 6px" }}>Contacts</h1>
        <p style={{ color: tokens.textSecondary, fontSize: 15, margin: "0 0 28px" }}>
          {tenantName ? `${tenantName} — ` : ""}{contacts.length} {contacts.length === 1 ? "contact" : "contacts"} captured by Blueslate
        </p>

        {error && <p style={{ color: tokens.brandCoral }}>{error}</p>}
        {loading ? (
          <p style={{ color: tokens.textMuted }}>Loading…</p>
        ) : contacts.length === 0 ? (
          <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, padding: 48, textAlign: "center", color: tokens.textMuted, fontSize: 15 }}>
            No contacts yet for this franchise. Make a call to see them here.
          </div>
        ) : (
          <div style={{ background: tokens.surfaceBase, border: `1px solid ${tokens.borderDefault}`, borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Name</th>
                  <th style={th}>Phone</th>
                  <th style={th}>Status</th>
                  <th style={th}>Children</th>
                  <th style={th}>Added</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => router.push(`/contacts/${c.id}?tenant_slug=${slug}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={td}>
                      <span style={{ fontWeight: 600 }}>{fullName(c)}</span>
                      {c.do_not_contact && (
                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: tokens.brandCoral, background: `${tokens.brandCoral}18`, padding: "2px 8px", borderRadius: 12 }}>
                          DNC
                        </span>
                      )}
                    </td>
                    <td style={{ ...td, color: c.phone ? tokens.textPrimary : tokens.textMuted }}>{c.phone || "—"}</td>
                    <td style={td}>
                      {c.lead_statuses ? (
                        <span style={{ display: "inline-block", fontSize: 13, fontWeight: 600, color: c.lead_statuses.color, background: `${c.lead_statuses.color}18`, padding: "5px 12px", borderRadius: 20 }}>
                          {c.lead_statuses.label}
                        </span>
                      ) : (
                        <span style={{ fontSize: 14, color: tokens.textMuted }}>No status</span>
                      )}
                    </td>
                    <td style={td}>
                      {c.children.length ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {c.children.map((ch, i) => (
                            <span key={i} style={{ fontSize: 13, color: tokens.textSecondary, background: tokens.surfaceSubtle, padding: "4px 10px", borderRadius: 8 }}>
                              {ch.name}{ch.age != null ? ` · ${ch.age}` : ""}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: tokens.textMuted }}>—</span>
                      )}
                    </td>
                    <td style={{ ...td, color: tokens.textMuted, fontSize: 14 }}>{fmtDate(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}