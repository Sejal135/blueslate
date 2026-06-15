"use client"
import { useState } from "react"
import Link from "next/link"

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
          body: JSON.stringify({
            url: url,
            tenant_slug: "xpleague-frisco"
          })
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
          body: JSON.stringify({
            url: url,
            tenant_slug: "xpleague-frisco"
          })
        }
      )

      const data = await response.json()
      if (data.saved_to_db) {
        setSaved(true)
      }
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
    background: "#0d1b2a",
    borderBottom: "1px solid #1e3a5f",
    padding: "16px 40px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }

  const pageStyle = {
    minHeight: "100vh",
    background: "#060d16",
    color: "white",
    fontFamily: "'Segoe UI', sans-serif",
  }

  const cardStyle = {
    background: "#0d1b2a",
    border: "1px solid #1e3a5f",
    borderRadius: 10,
    padding: 24,
    marginBottom: 24,
  }

  const labelStyle = {
    display: "block" as const,
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  }

  const textareaStyle = {
    width: "100%",
    padding: "10px 14px",
    background: "#060d16",
    border: "1px solid #1e3a5f",
    borderRadius: 6,
    fontSize: 14,
    color: "white",
    resize: "vertical" as const,
    boxSizing: "border-box" as const,
    fontFamily: "'Segoe UI', sans-serif",
  }

  return (
    <div style={pageStyle}>

      {/* Navbar */}
      <nav style={navStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <img
            src="https://www.friscofalcons.gg/uploads/b/cfb69920-003e-11ef-b3c4-41bfe6bc70a5/FRISCO_TX_WHITE.png"
            alt="XP League Frisco"
            style={{ height: 40, objectFit: "contain" }}
          />
          <div style={{ width: 1, height: 32, background: "#1e3a5f" }} />
          <div>
            <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", letterSpacing: 2, textTransform: "uppercase" }}>
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
            color: "#94a3b8",
            border: "1px solid #1e3a5f",
            borderRadius: 6,
            fontSize: 13,
            textDecoration: "none"
          }}
        >
          Leads Dashboard
        </Link>
      </nav>

      {/* Main Content */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>

        {/* Page Title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: "bold", margin: "0 0 4px", color: "white" }}>
            Knowledge Base
          </h1>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: 14 }}>
            XP League Frisco — AI Receptionist Knowledge
          </p>
        </div>

        {/* URL Input */}
        <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter franchise URL"
            style={{
              flex: 1,
              padding: "10px 14px",
              background: "#0d1b2a",
              border: "1px solid #1e3a5f",
              borderRadius: 8,
              fontSize: 14,
              color: "white",
            }}
          />
          <button
            onClick={handleScrape}
            disabled={loading}
            style={{
              padding: "10px 28px",
              background: loading ? "#1e3a5f" : "#1d4ed8",
              color: "white",
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

        {/* Error */}
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

        {/* Loading */}
        {loading && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: "#94a3b8",
            background: "#0d1b2a",
            border: "1px solid #1e3a5f",
            borderRadius: 8,
            marginBottom: 24
          }}>
            Scraping and extracting knowledge... this takes about 45 seconds
          </div>
        )}

        {/* Knowledge Display */}
        {knowledge && (
          <div>
            <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 24, color: "white" }}>
              Extracted Knowledge
            </h2>

            {/* Basic Info */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 20, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1 }}>
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

            {/* Games Offered */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1 }}>
                Games Offered
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {knowledge.games_offered.map((game, i) => (
                  <span key={i} style={{
                    padding: "6px 14px",
                    background: "#1d4ed820",
                    color: "#60a5fa",
                    borderRadius: 20,
                    fontSize: 13,
                    border: "1px solid #1d4ed840"
                  }}>
                    {game}
                  </span>
                ))}
              </div>
            </div>

            {/* Programs */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1 }}>
                Programs
              </h3>
              {knowledge.programs.map((program, i) => (
                <div key={i} style={{
                  padding: 16,
                  border: "1px solid #1e3a5f",
                  borderRadius: 8,
                  marginBottom: 12,
                  background: "#060d16"
                }}>
                  <p style={{ fontWeight: "bold", marginBottom: 4, color: "white" }}>{program.name}</p>
                  <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>{program.description}</p>
                  <p style={{ fontSize: 13, color: "#22c55e" }}>{program.price}</p>
                  <p style={{ fontSize: 13, color: "#94a3b8" }}>{program.schedule}</p>
                </div>
              ))}
            </div>

            {/* Birthday Parties */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1 }}>
                Birthday Parties
              </h3>
              {knowledge.birthday_parties.map((party, i) => (
                <div key={i} style={{
                  padding: 16,
                  border: "1px solid #1e3a5f",
                  borderRadius: 8,
                  marginBottom: 12,
                  background: "#060d16"
                }}>
                  <p style={{ fontWeight: "bold", marginBottom: 4, color: "white" }}>{party.package_name}</p>
                  <p style={{ fontSize: 13, color: "#22c55e", marginBottom: 4 }}>{party.price}</p>
                  <p style={{ fontSize: 13, color: "#94a3b8" }}>{party.details}</p>
                </div>
              ))}
            </div>

            {/* Staff */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: "600", marginBottom: 16, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1 }}>
                Staff
              </h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {knowledge.staff.map((member, i) => (
                  <div key={i} style={{
                    padding: "10px 16px",
                    border: "1px solid #1e3a5f",
                    borderRadius: 8,
                    minWidth: 180,
                    background: "#060d16"
                  }}>
                    <p style={{ fontWeight: "bold", fontSize: 14, margin: "0 0 4px", color: "white" }}>{member.name}</p>
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{member.role}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: "12px 32px",
                  background: saving ? "#1e3a5f" : "#059669",
                  color: "white",
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
                <span style={{ color: "#22c55e", fontSize: 14 }}>
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