/** All money is integer paise. Percentages are integer ×100 (1850 = 18.50%). */

export const fmtINR = (paise: number, opts?: { compact?: boolean }) => {
  const rupees = paise / 100;
  if (opts?.compact) {
    if (Math.abs(rupees) >= 1e7) return `₹${(rupees / 1e7).toFixed(2)} Cr`;
    if (Math.abs(rupees) >= 1e5) return `₹${(rupees / 1e5).toFixed(2)} L`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 2,
  }).format(rupees);
};

export const pct = (x100: number) => `${(x100 / 100).toFixed(x100 % 100 === 0 ? 0 : 2)}%`;

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  return `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  return `${h ? ones[h] + " Hundred" + (r ? " " : "") : ""}${twoDigits(r)}`;
}

/** Indian-system amount in words (for the PDF). */
export function amountInWords(paise: number): string {
  let n = Math.floor(Math.abs(paise) / 100);
  if (n === 0) return "Zero Rupees Only";
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (n) parts.push(threeDigits(n));
  return `${parts.join(" ")} Rupees Only`;
}
