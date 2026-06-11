"use client"
import { useEffect, useState } from "react"

export default function Home() {
  const [status, setStatus] = useState("checking...")

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then(res => res.json())
      .then(data => setStatus(data.status))
      .catch(() => setStatus("backend unreachable"))
  }, [])

  return (
    <main>
      <h1>Blueslate</h1>
      <p>Backend status: {status}</p>
    </main>
  )
}
