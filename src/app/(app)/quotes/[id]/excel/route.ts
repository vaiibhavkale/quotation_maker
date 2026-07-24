import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireUser } from "@/lib/auth";
import { loadQuoteBundle } from "@/lib/quote-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await ctx.params;

  const b = await loadQuoteBundle(id, { tenantId: user.tenantId, scope: user.scope });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Quotation");
  const color = (b.brand.primaryColor || "#E8821E").replace("#", "FF");

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `${b.brand.displayName} — ${b.quote.number}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `${b.quote.title} · For: ${b.customer.name} · ${b.quote.date}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7280" }, size: 10 };

  const header = ["#", "Description", "HSN", "Unit", "Qty", "Rate (₹)", "Disc %", "Amount (₹)"];
  const hr = ws.addRow([]);
  const headerRow = ws.addRow(header);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  });

  b.items.forEach((it, i) => {
    const row = ws.addRow([
      i + 1, it.description, it.hsn ?? "", it.unit,
      it.quantity / 100, it.rate / 100, it.discountPct / 100, it.lineTotal / 100,
    ]);
    row.getCell(6).numFmt = "#,##0.00";
    row.getCell(8).numFmt = "#,##0.00";
  });

  ws.addRow([]);
  const totals: [string, number][] = [
    ["Subtotal", b.quote.subtotal], ["Discount", -b.quote.discountTotal],
    ...(b.quote.igst > 0
      ? [["IGST", b.quote.igst] as [string, number]]
      : [["CGST", b.quote.cgst] as [string, number], ["SGST", b.quote.sgst] as [string, number]]),
    ["Grand Total", b.quote.grandTotal],
  ];
  for (const [label, val] of totals) {
    const r = ws.addRow(["", "", "", "", "", "", label, val / 100]);
    r.getCell(7).font = { bold: label === "Grand Total" };
    r.getCell(8).font = { bold: label === "Grand Total" };
    r.getCell(8).numFmt = "#,##0.00";
  }

  ws.columns = [
    { width: 5 }, { width: 42 }, { width: 12 }, { width: 8 },
    { width: 10 }, { width: 14 }, { width: 10 }, { width: 16 },
  ];
  void hr;

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${b.quote.number.replaceAll("/", "-")}.xlsx"`,
    },
  });
}
