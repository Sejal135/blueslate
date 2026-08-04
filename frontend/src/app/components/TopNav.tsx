"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { tokens } from "../tokens";

const NAV_ITEMS = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "contacts", label: "Contacts", href: "/contacts" },
  { key: "calls", label: "Calls", href: "/calls" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns" },
];

function NavLink({ item, isActive }: { item: (typeof NAV_ITEMS)[number]; isActive: boolean }) {
  const [hovered, setHovered] = useState(false);

  const color = isActive ? "#fff" : hovered ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.6)";

  return (
    <Link
      href={item.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color, fontSize: 14, fontWeight: isActive ? 700 : 600, textDecoration: "none",
        paddingBottom: 4, borderBottom: `2px solid ${isActive ? tokens.brandTeal : "transparent"}`,
      }}
    >
      {item.label}
    </Link>
  );
}

export default function TopNav({ active, right }: { active: string; right?: ReactNode }) {
  return (
    <div style={{ background: tokens.brandSlate, padding: "16px 24px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>Blueslate</span>
          <nav style={{ display: "flex", gap: 20 }}>
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.key} item={item} isActive={active === item.key} />
            ))}
          </nav>
        </div>
        {right}
      </div>
    </div>
  );
}
