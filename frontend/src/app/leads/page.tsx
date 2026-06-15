"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

interface Lead {
  id: string
  caller_name: string
  phone_number: string
  core_interest: string
  call_outcome: string
  call_duration_seconds: number
  call_timestamp: string
  raw_transcript: string
}

export default function LeadsDashboard() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<string>("")
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null)

  async function fetchLeads() {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/leads`
      )
      const data = await response.json()
      if (data.status === "success") {
        setLeads(data.leads)
        setLastRefreshed(new Date().toLocaleTimeString())
      }
    } catch (error) {
      console.error("Failed to fetch leads:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLeads()
    const interval = setInterval(fetchLeads, 30000)
    return () => clearInterval(interval)
  }, [])

  function formatDuration(seconds: number) {
    if (!seconds) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  function formatTimestamp(timestamp: string) {
    if (!timestamp) return "—"
    return new Date(timestamp).toLocaleString()
  }

  function getOutcomeColor(outcome: string) {
    switch (outcome) {
      case "booked_trial": return "#22c55e"
      case "callback_requested": return "#f59e0b"
      case "not_interested": return "#ef4444"
      default: return "#94a3b8"
    }
  }

  function getOutcomeLabel(outcome: string) {
    switch (outcome) {
      case "booked_trial": return "✓ Booked Trial"
      case "callback_requested": return "↩ Callback"
      case "not_interested": return "✗ Not Interested"
      default: return "ℹ General Inquiry"
    }
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
    padding: 20,
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
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {lastRefreshed && (
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              Updated: {lastRefreshed}
            </span>
          )}
          <button
            onClick={fetchLeads}
            style={{
              padding: "8px 18px",
              background: "#1d4ed8",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: "500"
            }}
          >
            ↻ Refresh
          </button>
          <Link
            href="/"
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
            Knowledge Base
          </Link>
        </div>
      </nav>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "40px 24px" }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: "bold", margin: "0 0 4px", color: "white" }}>
            Leads Dashboard
          </h1>
          <p style={{ color: "#94a3b8", margin: 0, fontSize: 14 }}>
            XP League Frisco — Inbound call leads captured by Blueslate AI
          </p>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total Leads", value: leads.length, color: "#60a5fa" },
            { label: "Booked Trial", value: leads.filter(l => l.call_outcome === "booked_trial").length, color: "#22c55e" },
            { label: "Callback Requested", value: leads.filter(l => l.call_outcome === "callback_requested").length, color: "#f59e0b" },
            { label: "General Inquiry", value: leads.filter(l => l.call_outcome === "general_inquiry").length, color: "#94a3b8" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ ...cardStyle, flex: 1 }}>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>
                {label}
              </p>
              <p style={{ fontSize: 32, fontWeight: "bold", margin: 0, color }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 48, color: "#94a3b8" }}>
            Loading leads...
          </div>
        ) : leads.length === 0 ? (
          <div style={{ ...cardStyle, textAlign: "center", padding: 48, color: "#94a3b8" }}>
            No leads yet. Make a test call to see them here.
          </div>
        ) : (
          <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0a1628", borderBottom: "1px solid #1e3a5f" }}>
                  {["Caller Name", "Phone", "Interest", "Outcome", "Duration", "Timestamp", "Transcript"].map(h => (
                    <th key={h} style={{
                      padding: "14px 16px",
                      textAlign: "left",
                      fontSize: 12,
                      fontWeight: "600",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      letterSpacing: 1
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => (
                  <tr key={lead.id} style={{
                    borderBottom: "1px solid #1e3a5f",
                    background: i % 2 === 0 ? "#0d1b2a" : "#0a1628",
                  }}>
                    <td style={{ padding: "14px 16px", fontSize: 14, fontWeight: "500", color: "white" }}>
                      {lead.caller_name || "—"}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "#94a3b8" }}>
                      {lead.phone_number || "—"}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "#cbd5e1" }}>
                      {lead.core_interest || "—"}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      <span style={{
                        fontSize: 12,
                        fontWeight: "500",
                        color: getOutcomeColor(lead.call_outcome),
                        background: `${getOutcomeColor(lead.call_outcome)}20`,
                        padding: "4px 10px",
                        borderRadius: 20,
                        border: `1px solid ${getOutcomeColor(lead.call_outcome)}40`
                      }}>
                        {getOutcomeLabel(lead.call_outcome)}
                      </span>
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 14, color: "#94a3b8" }}>
                      {formatDuration(lead.call_duration_seconds)}
                    </td>
                    <td style={{ padding: "14px 16px", fontSize: 13, color: "#94a3b8" }}>
                      {formatTimestamp(lead.call_timestamp)}
                    </td>
                    <td style={{ padding: "14px 16px" }}>
                      {lead.raw_transcript && (
                        <button
                          onClick={() => setSelectedLead(lead)}
                          style={{
                            fontSize: 12,
                            padding: "4px 12px",
                            background: "transparent",
                            border: "1px solid #1e3a5f",
                            borderRadius: 4,
                            cursor: "pointer",
                            color: "#60a5fa"
                          }}
                        >
                          View
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selectedLead && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.8)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 50
        }}>
          <div style={{
            background: "#0d1b2a",
            border: "1px solid #1e3a5f",
            borderRadius: 12,
            padding: 32,
            maxWidth: 620,
            width: "90%",
            maxHeight: "80vh",
            overflow: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: "bold", margin: "0 0 4px", color: "white" }}>
                  Call Transcript
                </h2>
                <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
                  {selectedLead.caller_name} — {formatTimestamp(selectedLead.call_timestamp)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: 20,
                  cursor: "pointer",
                  color: "#94a3b8"
                }}
              >
                ✕
              </button>
            </div>
            <pre style={{
              fontSize: 13,
              lineHeight: 1.8,
              color: "#cbd5e1",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              background: "#060d16",
              padding: 16,
              borderRadius: 8,
              border: "1px solid #1e3a5f"
            }}>
              {selectedLead.raw_transcript}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}