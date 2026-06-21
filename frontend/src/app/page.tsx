"use client"
import { useState } from "react"
import Link from "next/link"
import { tokens } from "./tokens"

interface Program {
  name: string
  description: string
  price: string
  schedule: string
}

interface BirthdayParty {
  package_name: string
  price: string
  details: string
}

interface Staff {
  name: string
  role: string
}

interface KnowledgeData {
  business_name: string
  phone: string
  location: string
  age_range: string
  games_offered: string[]
  programs: Program[]
  trial_info: string
  birthday_parties: BirthdayParty[]
  staff: Staff[]
  mission: string
  additional_info: string
}

export default function Dashboard() {
  const [url, setUrl] = useState("https://www.friscofalcons.gg/")
  const [loading, setLoading] = useState(false)
  const [knowledge, setKnowledge] = useState<KnowledgeData | null>(null)
  const [error, setError] = useState("")
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleScrape() {
    setLoading(true)
    setError("")
    setSaved(false)
    setKnowledge(null)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/scrape`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url, tenant_slug: "xpleague-frisco" })
        }
      )
      const data = await response.json()
      if (data.status === "error") {
        setError(data.message)
      } else {
        setKnowledge(data.structured_data)
      }
    } catch {
      setError("Failed to connect to backend")
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!knowledge) return
    setSaving(true)
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/scrape`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url, tenant_slug: "xpleague-frisco" })
        }
      )
      const data = await response.json()
      if (data.saved_to_db) setSaved(true)
    } catch {
      setError("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  function updateField(field: keyof KnowledgeData, value: string) {
    if (!knowledge) return
    setKnowledge({ ...knowledge, [field]: value })
  }

  const navStyle = {
    background: tokens.brandSlate,
    borderBottom: "1px solid rgba(255,255,255,0.12)",
    padding: "16px 40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }

  const pageStyle = {
    minHeight: "100vh",
    background: tokens.surfaceSubtle,
    color: tokens.textPrimary,
    fontFamily: tokens.fontSans,
  }

  const cardStyle = {
    background: tokens.surfaceBase,
    border: "1px solid " + tokens.borderDefault,
    borderRadius: 10,
    padding: 24,
    marginBottom: 24,
  }

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    color: tokens.textMuted,
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  }

  const textareaStyle = {
    width: "100%",
    padding: "10px 14px",
    background: tokens.surfaceSubtle,
    border: "1px solid " + tokens.borderDefault,
    borderRadius: 6,
    fontSize: 14,
    color: tokens.textPrimary,
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
    fontFamily: tokens.fontSans,
  }

  return (
    <div style={pageStyle}>
      <nav style={navStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src="https://www.friscofalcons.gg/uploads/b/cfb69920-003e-11ef-b3c4-41bfe6bc70a5/FRISCO_TX_WHITE.png"
            alt="XP League Frisco"
            style={{ height: 40, objectFit: "contain" }}
          />
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.12)" }} />
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>
              Powered by
            </p>
            <p style={{ margin: 0, fontSize: 16, fontWeight: "bold", color: "white" }}>
              Blueslate AI
            </p>
          </div>
        </div>
        <Link
          href="/leads"
          style={{
            padding: "8px 18px",
            background: "transparent",
            color: "rgba(255,255,255,0.6)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 6,
            fontSize: 13,
            textDecoration: "none"
          }}
        >
          Leads Dashboard
        </Link>
      </nav>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: "bold", margin: "0 0 4px", color: tokens.textPrimary }}>
            Knowledge Base
          </h1>
          <p style={{ color: tokens.textMuted, margin: 0, fontSize: 14 }}>
            XP League Frisco — AI Receptionist Knowledge
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter franchise URL"
            style={{
              flex: 1,
              padding: "10px 14px",
              background: tokens.surfaceBase,
              border: "1px solid " + tokens.borderDefault,
              borderRadius: 8,
              fontSize: 14,
              color: tokens.textPrimary,
            }}
          />
          <button
            onClick={handleScrape}
            disabled={loading}
            style={{
              padding: "10px 28px",
              background: loading ? tokens.borderDefault : tokens.brandTeal,
              color: loading ? tokens.textMuted : "white",
              border: "none",
              borderRadius: 8,
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: "bold"
            }}
          >
            {loading ? "Scraping..." : "Scrape"}
          </button>
        </div>

        {error && (
          <div style={{
            padding: 16,
            background: "#1f0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            color: "#fca5a5",
            marginBottom: 24
          }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: tokens.textMuted,
            background: tokens.surfaceBase,
            border: "1px solid " + tokens.borderDefault,
            borderRadius: 8,
            marginBottom: 24
          }}>
            Scraping and extracting knowledge... this takes about 45 seconds
          </div>
        )}

        {knowledge && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 24, color: tokens.textPrimary }}>
              Extracted Knowledge
            </h2>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 20, color: tokens.brandBlue, textTransform: "uppercase", letterSpacing: 1 }}>
                Basic Info
              </h3>
              {[
                { label: "Business Name", field: "business_name" },
                { label: "Phone", field: "phone" },
                { label: "Location", field: "location" },
                { label: "Age Range", field: "age_range" },
                { label: "Mission", field: "mission" },
                { label: "Trial Info", field: "trial_info" },
                { label: "Additional Info", field: "additional_info" },
              ].map(({ label, field }) => (
                <div key={field} style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>{label}</label>
                  <textarea
                    value={(knowledge[field as keyof KnowledgeData] as string) || ""}
                    onChange={(e) => updateField(field as keyof KnowledgeData, e.target.value)}
                    rows={2}
                    style={textareaStyle}
                  />
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: tokens.brandBlue, textTransform: "uppercase", letterSpacing: 1 }}>
                Games Offered
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {knowledge.games_offered.map((game, i) => (
                  <span key={i} style={{
                    padding: "6px 14px",
                    background: `color-mix(in srgb, ${tokens.brandTeal} 12%, transparent)`,
                    color: tokens.brandBlue,
                    borderRadius: 20,
                    fontSize: 13,
                    border: `1px solid color-mix(in srgb, ${tokens.brandTeal} 25%, transparent)`
                  }}>
                    {game}
                  </span>
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: tokens.brandBlue, textTransform: "uppercase", letterSpacing: 1 }}>
                Programs
              </h3>
              {knowledge.programs.map((program, i) => (
                <div key={i} style={{
                  padding: 16,
                  border: "1px solid " + tokens.borderDefault,
                  borderRadius: 8,
                  marginBottom: 12,
                  background: tokens.surfaceSubtle
                }}>
                  <p style={{ fontWeight: "bold", marginBottom: 4, color: tokens.textPrimary }}>{program.name}</p>
                  <p style={{ fontSize: 13, color: tokens.textMuted, marginBottom: 4 }}>{program.description}</p>
                  <p style={{ fontSize: 13, color: tokens.brandTeal }}>{program.price}</p>
                  <p style={{ fontSize: 13, color: tokens.textMuted }}>{program.schedule}</p>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: tokens.brandBlue, textTransform: "uppercase", letterSpacing: 1 }}>
                Birthday Parties
              </h3>
              {knowledge.birthday_parties.map((party, i) => (
                <div key={i} style={{
                  padding: 16,
                  border: "1px solid " + tokens.borderDefault,
                  borderRadius: 8,
                  marginBottom: 12,
                  background: tokens.surfaceSubtle
                }}>
                  <p style={{ fontWeight: "bold", marginBottom: 4, color: tokens.textPrimary }}>{party.package_name}</p>
                  <p style={{ fontSize: 13, color: tokens.brandTeal, marginBottom: 4 }}>{party.price}</p>
                  <p style={{ fontSize: 13, color: tokens.textMuted }}>{party.details}</p>
                </div>
              ))}
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: tokens.brandBlue, textTransform: "uppercase", letterSpacing: 1 }}>
                Staff
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {knowledge.staff.map((member, i) => (
                  <div key={i} style={{
                    padding: "10px 16px",
                    border: "1px solid " + tokens.borderDefault,
                    borderRadius: 8,
                    minWidth: 180,
                    background: tokens.surfaceSubtle
                  }}>
                    <p style={{ fontWeight: "bold", fontSize: 14, margin: "0 0 4px", color: tokens.textPrimary }}>{member.name}</p>
                    <p style={{ fontSize: 12, color: tokens.textMuted, margin: 0 }}>{member.role}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "12px 32px",
                  background: saving ? tokens.borderDefault : tokens.brandTeal,
                  color: saving ? tokens.textMuted : "white",
                  border: "none",
                  borderRadius: 8,
                  cursor: saving ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: "bold"
                }}
              >
                {saving ? "Saving..." : "Save to Knowledge Base"}
              </button>
              {saved && (
                <span style={{ color: tokens.brandTeal, fontSize: 14 }}>
                  ✓ Saved successfully
                </span>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
