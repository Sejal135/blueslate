// "use client"
// import { useEffect, useState } from "react"

// export default function Home() {
//   const [status, setStatus] = useState("checking...")

//   useEffect(() => {
//     fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
//       .then(res => res.json())
//       .then(data => setStatus(data.status))
//       .catch(() => setStatus("backend unreachable"))
//   }, [])

//   return (
//     <main>
//       <h1>Blueslate</h1>
//       <p>Backend status: {status}</p>
//     </main>
//   )
// }

"use client"
import { useState } from "react"

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

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px", fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: "bold", marginBottom: 8 }}>
        Blueslate
      </h1>
      <p style={{ color: "#666", marginBottom: 32 }}>
        AI Receptionist — Knowledge Base
      </p>

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
            border: "1px solid #ddd",
            borderRadius: 8,
            fontSize: 14
          }}
        />
        <button
          onClick={handleScrape}
          disabled={loading}
          style={{
            padding: "10px 24px",
            background: loading ? "#999" : "#2563eb",
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
          background: "#fef2f2",
          border: "1px solid #fecaca",
          borderRadius: 8,
          color: "#dc2626",
          marginBottom: 24
        }}>
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{
          padding: 24,
          textAlign: "center",
          color: "#666",
          background: "#f9fafb",
          borderRadius: 8,
          marginBottom: 24
        }}>
          Scraping and extracting knowledge... this takes about 45 seconds
        </div>
      )}

      {/* Knowledge Display */}
      {knowledge && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: "bold", marginBottom: 24 }}>
            Extracted Knowledge
          </h2>

          {/* Basic Info */}
          <section style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#374151" }}>
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
                <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
                  {label}
                </label>
                <textarea
                  value={(knowledge[field as keyof KnowledgeData] as string) || ""}
                  onChange={(e) => updateField(field as keyof KnowledgeData, e.target.value)}
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #ddd",
                    borderRadius: 6,
                    fontSize: 14,
                    resize: "vertical",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            ))}
          </section>

          {/* Games Offered */}
          <section style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#374151" }}>
              Games Offered
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {knowledge.games_offered.map((game, i) => (
                <span key={i} style={{
                  padding: "4px 12px",
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  borderRadius: 20,
                  fontSize: 13
                }}>
                  {game}
                </span>
              ))}
            </div>
          </section>

          {/* Programs */}
          <section style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#374151" }}>
              Programs
            </h3>
            {knowledge.programs.map((program, i) => (
              <div key={i} style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                marginBottom: 12
              }}>
                <p style={{ fontWeight: "bold", marginBottom: 4 }}>{program.name}</p>
                <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>{program.description}</p>
                <p style={{ fontSize: 13, color: "#059669" }}>{program.price}</p>
                <p style={{ fontSize: 13, color: "#6b7280" }}>{program.schedule}</p>
              </div>
            ))}
          </section>

          {/* Birthday Parties */}
          <section style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#374151" }}>
              Birthday Parties
            </h3>
            {knowledge.birthday_parties.map((party, i) => (
              <div key={i} style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                marginBottom: 12
              }}>
                <p style={{ fontWeight: "bold", marginBottom: 4 }}>{party.package_name}</p>
                <p style={{ fontSize: 13, color: "#059669", marginBottom: 4 }}>{party.price}</p>
                <p style={{ fontSize: 13, color: "#6b7280" }}>{party.details}</p>
              </div>
            ))}
          </section>

          {/* Staff */}
          <section style={{ marginBottom: 32 }}>
            <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 16, color: "#374151" }}>
              Staff
            </h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {knowledge.staff.map((member, i) => (
                <div key={i} style={{
                  padding: "10px 16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  minWidth: 180
                }}>
                  <p style={{ fontWeight: "bold", fontSize: 14 }}>{member.name}</p>
                  <p style={{ fontSize: 12, color: "#6b7280" }}>{member.role}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Save Button */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "12px 32px",
                background: saving ? "#999" : "#059669",
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
              <span style={{ color: "#059669", fontSize: 14 }}>
                ✓ Saved successfully
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  )
}