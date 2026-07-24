import React from "react";
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { fmtINR, pct, amountInWords } from "@/lib/money";

export type QuotePdfData = {
  brand: {
    displayName: string; primaryColor: string; gstin?: string | null;
    address?: string | null; phone?: string | null; email?: string | null;
    bankName?: string | null; bankAccount?: string | null; bankIfsc?: string | null;
    upiId?: string | null; signatureName?: string | null; terms?: string | null;
    footerNote?: string | null; poweredByHeseos: boolean;
  };
  quote: {
    number: string; title: string; date: string; validUntil?: string | null; revision: number;
    subtotal: number; discountTotal: number; cgst: number; sgst: number; igst: number; grandTotal: number;
  };
  customer: { name: string; address?: string | null; gstin?: string | null; phone?: string | null };
  items: {
    description: string; hsn?: string | null; unit: string;
    quantity: number; rate: number; discountPct: number; gstRatePct: number; lineTotal: number;
  }[];
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, color: "#1F2937", fontFamily: "Helvetica" },
  headerBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  brandName: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 8, color: "#6B7280", lineHeight: 1.5 },
  qtag: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  rule: { height: 3, marginVertical: 10, borderRadius: 2 },
  row: { flexDirection: "row" },
  box: { flex: 1, padding: 8, backgroundColor: "#F8FAFC", borderRadius: 4, marginRight: 6 },
  boxTitle: { fontSize: 7, color: "#6B7280", textTransform: "uppercase", marginBottom: 3, fontFamily: "Helvetica-Bold" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#FFFFFF", paddingVertical: 5, paddingHorizontal: 4 },
  td: { fontSize: 8.5, paddingVertical: 5, paddingHorizontal: 4 },
  totalLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  sigBlock: { marginTop: 26, alignItems: "flex-end" },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", fontSize: 7.5, color: "#9CA3AF" },
});

const W = { idx: "5%", desc: "35%", hsn: "10%", qty: "9%", rate: "13%", disc: "7%", gst: "7%", amt: "14%" };

export function QuotePdf({ data }: { data: QuotePdfData }) {
  const { brand, quote, customer, items } = data;
  const color = brand.primaryColor || "#E8821E";
  const interState = quote.igst > 0;

  return (
    <Document title={quote.number} author={brand.displayName}>
      <Page size="A4" style={s.page}>
        <View style={s.headerBar}>
          <View>
            <Text style={[s.brandName, { color }]}>{brand.displayName}</Text>
            <Text style={s.small}>{brand.address ?? ""}</Text>
            <Text style={s.small}>
              {[brand.phone, brand.email].filter(Boolean).join("  ·  ")}
            </Text>
            {brand.gstin ? <Text style={s.small}>GSTIN: {brand.gstin}</Text> : null}
          </View>
          <View>
            <Text style={[s.qtag, { color }]}>QUOTATION</Text>
            <Text style={[s.small, { textAlign: "right" }]}>{quote.number}</Text>
            <Text style={[s.small, { textAlign: "right" }]}>Rev {quote.revision} · {quote.date}</Text>
            {quote.validUntil ? (
              <Text style={[s.small, { textAlign: "right" }]}>Valid until {quote.validUntil}</Text>
            ) : null}
          </View>
        </View>

        <View style={[s.rule, { backgroundColor: color }]} />

        <View style={[s.row, { marginBottom: 10 }]}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Quotation for</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{customer.name}</Text>
            {customer.address ? <Text style={s.small}>{customer.address}</Text> : null}
            {customer.gstin ? <Text style={s.small}>GSTIN: {customer.gstin}</Text> : null}
            {customer.phone ? <Text style={s.small}>{customer.phone}</Text> : null}
          </View>
          <View style={[s.box, { marginRight: 0 }]}>
            <Text style={s.boxTitle}>Subject</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10 }}>{quote.title}</Text>
            <Text style={s.small}>
              {interState ? "Inter-state supply (IGST applicable)" : "Intra-state supply (CGST + SGST applicable)"}
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: color, flexDirection: "row", borderTopLeftRadius: 4, borderTopRightRadius: 4 }}>
          <Text style={[s.th, { width: W.idx }]}>#</Text>
          <Text style={[s.th, { width: W.desc }]}>Description</Text>
          <Text style={[s.th, { width: W.hsn }]}>HSN</Text>
          <Text style={[s.th, { width: W.qty, textAlign: "right" }]}>Qty</Text>
          <Text style={[s.th, { width: W.rate, textAlign: "right" }]}>Rate</Text>
          <Text style={[s.th, { width: W.disc, textAlign: "right" }]}>Disc</Text>
          <Text style={[s.th, { width: W.gst, textAlign: "right" }]}>GST</Text>
          <Text style={[s.th, { width: W.amt, textAlign: "right" }]}>Amount</Text>
        </View>
        {items.map((it, i) => (
          <View key={i} style={{ flexDirection: "row", backgroundColor: i % 2 ? "#F8FAFC" : "#FFFFFF" }} wrap={false}>
            <Text style={[s.td, { width: W.idx }]}>{i + 1}</Text>
            <Text style={[s.td, { width: W.desc }]}>{it.description}</Text>
            <Text style={[s.td, { width: W.hsn }]}>{it.hsn ?? "-"}</Text>
            <Text style={[s.td, { width: W.qty, textAlign: "right" }]}>{(it.quantity / 100).toLocaleString("en-IN")} {it.unit}</Text>
            <Text style={[s.td, { width: W.rate, textAlign: "right" }]}>{fmtINR(it.rate)}</Text>
            <Text style={[s.td, { width: W.disc, textAlign: "right" }]}>{pct(it.discountPct)}</Text>
            <Text style={[s.td, { width: W.gst, textAlign: "right" }]}>{pct(it.gstRatePct)}</Text>
            <Text style={[s.td, { width: W.amt, textAlign: "right" }]}>{fmtINR(it.lineTotal)}</Text>
          </View>
        ))}

        <View style={[s.row, { marginTop: 12 }]}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.boxTitle}>Amount in words</Text>
            <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Oblique", marginBottom: 10 }}>
              {amountInWords(quote.grandTotal)}
            </Text>
            {brand.bankName ? (
              <>
                <Text style={s.boxTitle}>Bank details</Text>
                <Text style={s.small}>{brand.bankName} · A/c {brand.bankAccount} · IFSC {brand.bankIfsc}</Text>
                {brand.upiId ? <Text style={s.small}>UPI: {brand.upiId}</Text> : null}
              </>
            ) : null}
          </View>
          <View style={{ width: 200 }}>
            <View style={s.totalLine}><Text>Subtotal</Text><Text>{fmtINR(quote.subtotal)}</Text></View>
            <View style={s.totalLine}><Text>Discount</Text><Text>- {fmtINR(quote.discountTotal)}</Text></View>
            {interState ? (
              <View style={s.totalLine}><Text>IGST</Text><Text>{fmtINR(quote.igst)}</Text></View>
            ) : (
              <>
                <View style={s.totalLine}><Text>CGST</Text><Text>{fmtINR(quote.cgst)}</Text></View>
                <View style={s.totalLine}><Text>SGST</Text><Text>{fmtINR(quote.sgst)}</Text></View>
              </>
            )}
            <View style={[s.totalLine, { borderTopWidth: 1, borderTopColor: color, marginTop: 3, paddingTop: 4 }]}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11 }}>Grand Total</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color }}>{fmtINR(quote.grandTotal)}</Text>
            </View>
          </View>
        </View>

        {brand.terms ? (
          <View style={{ marginTop: 14 }}>
            <Text style={s.boxTitle}>Terms & conditions</Text>
            <Text style={[s.small, { width: "70%" }]}>{brand.terms}</Text>
          </View>
        ) : null}

        <View style={s.sigBlock}>
          <Text style={{ fontSize: 8, color: "#6B7280", marginBottom: 24 }}>For {brand.displayName}</Text>
          <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{brand.signatureName ?? "Authorized Signatory"}</Text>
        </View>

        <Text style={s.footer} fixed>
          {[brand.footerNote, brand.poweredByHeseos ? "Powered by HESEOS · HIQM" : null].filter(Boolean).join("   ·   ")}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  return await renderToBuffer(<QuotePdf data={data} />);
}
