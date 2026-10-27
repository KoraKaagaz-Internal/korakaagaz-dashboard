import QRCode from "qrcode";

/**
 * UPI deep link (NPCI linking spec): any UPI app can scan the QR and pay.
 * We get no confirmation back, so payments are recorded by hand.
 */
export function upiUri(opts: { vpa: string; name: string; amount?: number; note?: string }): string {
  const params = new URLSearchParams({ pa: opts.vpa.trim(), pn: opts.name.trim(), cu: "INR" });
  if (opts.amount && opts.amount > 0) params.set("am", opts.amount.toFixed(2));
  if (opts.note) params.set("tn", opts.note.slice(0, 50));
  // URLSearchParams encodes spaces as "+", which some UPI apps show literally.
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

export function isValidVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/.test(vpa.trim());
}

/** Synchronous QR as an SVG path (works in the browser for the live preview, and on the server). */
export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  let d = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return { size, d };
}
