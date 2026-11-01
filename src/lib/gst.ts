import type { ExportType, GstMode } from "./types";

/** GST state codes (first two digits of a GSTIN). 96 = outside India (exports). */
export const STATES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "96": "Outside India",
};

export const OUTSIDE_INDIA = "96";

export function stateName(code: string | null | undefined): string {
  return (code && STATES[code]) || "";
}

/** "Odisha (21)" */
export function stateLabel(code: string | null | undefined): string {
  const name = stateName(code);
  return name ? `${name} (${code})` : "";
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN check digit (15th character), mod-36 algorithm used by GSTN. */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = CHARS.indexOf(first14[i]);
    const product = v * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinCheck = { ok: true; state: string; pan: string } | { ok: false; reason: string };

export function checkGstin(raw: string): GstinCheck {
  const g = raw.trim().toUpperCase();
  if (!g) return { ok: false, reason: "empty" };
  if (!GSTIN_RE.test(g)) return { ok: false, reason: "Format should be like 21ABCDE1234F1Z5" };
  if (!STATES[g.slice(0, 2)] || g.startsWith("96")) return { ok: false, reason: "Unknown state code" };
  if (gstinCheckDigit(g.slice(0, 14)) !== g[14]) return { ok: false, reason: "Check digit doesn't match: likely a typo" };
  return { ok: true, state: g.slice(0, 2), pan: g.slice(2, 12) };
}

/** Official captcha-protected search; there is no free API, so we link to it. */
export const GST_PORTAL_SEARCH = "https://services.gst.gov.in/services/searchtp";

/** IGST for inter-state or export-with-IGST, CGST+SGST within the state, none for export under LUT. */
export function autoGstMode(supplierState: string, placeOfSupply: string, exportType: ExportType): GstMode {
  if (placeOfSupply === OUTSIDE_INDIA || exportType !== "none") return exportType === "igst" ? "igst" : "none";
  if (!placeOfSupply || !supplierState) return "cgst_sgst";
  return placeOfSupply === supplierState ? "cgst_sgst" : "igst";
}

export const LUT_ENDORSEMENT = "SUPPLY MEANT FOR EXPORT UNDER LETTER OF UNDERTAKING WITHOUT PAYMENT OF INTEGRATED TAX";
export const EXPORT_IGST_ENDORSEMENT = "SUPPLY MEANT FOR EXPORT ON PAYMENT OF INTEGRATED TAX";

/**
 * Approximate PIN → state from India Post's postal zones (first 2-3 digits).
 * Good enough to pre-fill a picker; the user can always change it.
 */
const PIN3: Record<string, string> = {
  "160": "04",
  "403": "30",
  "744": "35",
  "194": "38",
  "737": "11",
  "246": "05",
  "247": "05",
  "248": "05",
  "249": "05",
  "263": "05",
  "790": "12",
  "791": "12",
  "792": "12",
  "793": "17",
  "794": "17",
  "795": "14",
  "796": "15",
  "797": "13",
  "798": "13",
  "799": "16",
};
const PIN2: Record<string, string> = {
  "11": "07",
  "12": "06",
  "13": "06",
  "14": "03",
  "15": "03",
  "16": "03",
  "17": "02",
  "18": "01",
  "19": "01",
  "20": "09",
  "21": "09",
  "22": "09",
  "23": "09",
  "24": "09",
  "25": "09",
  "26": "09",
  "27": "09",
  "28": "09",
  "30": "08",
  "31": "08",
  "32": "08",
  "33": "08",
  "34": "08",
  "36": "24",
  "37": "24",
  "38": "24",
  "39": "24",
  "40": "27",
  "41": "27",
  "42": "27",
  "43": "27",
  "44": "27",
  "45": "23",
  "46": "23",
  "47": "23",
  "48": "23",
  "49": "22",
  "50": "36",
  "51": "37",
  "52": "37",
  "53": "37",
  "56": "29",
  "57": "29",
  "58": "29",
  "59": "29",
  "60": "33",
  "61": "33",
  "62": "33",
  "63": "33",
  "64": "33",
  "67": "32",
  "68": "32",
  "69": "32",
  "70": "19",
  "71": "19",
  "72": "19",
  "73": "19",
  "74": "19",
  "75": "21",
  "76": "21",
  "77": "21",
  "78": "18",
  "80": "10",
  "81": "20",
  "82": "20",
  "83": "20",
  "84": "10",
  "85": "10",
};

export function stateFromPin(pin: string): string {
  const p = pin.replace(/\D/g, "");
  if (p.length !== 6) return "";
  if (p.startsWith("682") && Number(p.slice(3)) >= 551) return "31"; // Lakshadweep 682551-682559
  return PIN3[p.slice(0, 3)] ?? PIN2[p.slice(0, 2)] ?? "";
}

export const DEFAULT_SAC = "998391"; // Specialty design services
