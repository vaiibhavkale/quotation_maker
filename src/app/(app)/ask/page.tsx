import { AskClient } from "@/components/ask-client";

export const dynamic = "force-dynamic";

export default function AskPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">✦ Ask HIQM</h1>
        <p className="mt-1 text-sm text-ink-500">
          Natural-language answers over your live quotation data. The numbers come from SQL - AI only narrates.
        </p>
      </div>
      <AskClient />
    </div>
  );
}
