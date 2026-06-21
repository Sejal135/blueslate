import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blueslate — XP League Frisco",
  description: "AI Receptionist Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: "#060d16", fontFamily: "var(--font-sans)" }}>
        {children}
      </body>
    </html>
  );
}