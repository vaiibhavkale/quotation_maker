import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HIQM - HESEOS Intelligent Quotation Maker",
  description: "Multi-tenant white-label quotation intelligence platform for the HESEOS ecosystem.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning: some browser extensions (password
          managers, ad-blockers) inject attributes like __processed_*__
          into <body> before React hydrates. That's a false-positive
          mismatch, not a real one - this only silences attribute-level
          warnings on this node, not genuine structural hydration errors. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
