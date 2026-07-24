import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HIQM — HESEOS Intelligent Quotation Maker",
  description: "Multi-tenant white-label quotation intelligence platform for the HESEOS ecosystem.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
