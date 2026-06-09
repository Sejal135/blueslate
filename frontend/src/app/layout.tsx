import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blueslate",
  description: "AI receptionist for franchise businesses",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
