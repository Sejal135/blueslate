// Blueslate v2.0 design tokens. Source of truth: globals.css :root.
// Use in inline styles: style={{ color: tokens.brandTeal }}
export const tokens = {
    brandSlate:    "var(--brand-slate)",
    brandTeal:     "var(--brand-teal)",
    brandBlue:     "var(--brand-blue)",
    brandCoral:    "var(--brand-coral)",
    brandAmber:    "var(--brand-amber)",
    textPrimary:   "var(--text-primary)",
    textSecondary: "var(--text-secondary)",
    textMuted:     "var(--text-muted)",
    surfaceBase:   "var(--surface-base)",
    surfaceSubtle: "var(--surface-subtle)",
    borderDefault: "var(--border-default)",
    fontDisplay:   "var(--font-display)",
    fontSans:      "var(--font-sans)",
    fontMono:      "var(--font-mono)",
  } as const;
  