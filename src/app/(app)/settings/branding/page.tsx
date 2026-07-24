import { requireUser } from "@/lib/auth";
import { getSql } from "@/db";
import { updateBranding } from "@/app/actions/misc";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const user = await requireUser();
  const sql = getSql();
  const [b] = await sql`select * from branding_profiles where tenant_id = ${user.tenantId}`;

  const F = ({ name, label, def, placeholder }: { name: string; label: string; def?: string | null; placeholder?: string }) => (
    <div>
      <label className="label">{label}</label>
      <input name={name} defaultValue={def ?? ""} placeholder={placeholder} className="input" />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">White-label branding</h1>
      <p className="mb-6 text-sm text-ink-500">
        Everything here appears on your quotations, PDFs and the customer quote page.
      </p>

      <form action={updateBranding} className="space-y-6">
        <div className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <F name="displayName" label="Display name" def={b?.display_name} />
          <div>
            <label className="label">Brand colour</label>
            <div className="flex items-center gap-3">
              <input type="color" name="primaryColor" defaultValue={b?.primary_color ?? "#E8821E"}
                className="h-10 w-16 cursor-pointer rounded-lg border border-ink-200" />
              <span className="text-xs text-ink-500">Used across app shell, PDF and quote page</span>
            </div>
          </div>
          <F name="gstin" label="GSTIN" def={b?.gstin} />
          <F name="phone" label="Phone" def={b?.phone} />
          <F name="email" label="Email" def={b?.email} />
          <F name="address" label="Address" def={b?.address} />
        </div>

        <div className="card grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
          <F name="bankName" label="Bank name" def={b?.bank_name} />
          <F name="bankAccount" label="Account number" def={b?.bank_account} />
          <F name="bankIfsc" label="IFSC" def={b?.bank_ifsc} />
          <F name="upiId" label="UPI ID (for QR on quotes)" def={b?.upi_id} placeholder="business@upi" />
          <F name="signatureName" label="Signatory name" def={b?.signature_name} />
        </div>

        <div className="card space-y-4 p-5">
          <div>
            <label className="label">Terms & conditions</label>
            <textarea name="terms" defaultValue={b?.terms ?? ""} className="input h-24" />
          </div>
          <div>
            <label className="label">Footer note</label>
            <input name="footerNote" defaultValue={b?.footer_note ?? ""} className="input" />
          </div>
        </div>

        <button className="btn-primary">Save branding</button>
      </form>
    </div>
  );
}
