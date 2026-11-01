// Visits every page as the admin at desktop (1440) and phone (390) widths and fails on:
// sideways overflow, console errors, slow loads (> 3 s), window.confirm in the source,
// and hard-coded brand hex colours outside the allowed files. Read-only: safe on real data.
// Screenshots go to .visual/audit/ for a visual review.
//
// Usage: node scripts/ui-audit.mjs [baseUrl]
// Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import { execSync } from "node:child_process";
import fs from "node:fs";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const api = async (path) => (await fetch(`${SUPABASE_URL}${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })).json();

const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};

// ---------------------------------------------------------------- source checks
const grep = (pattern, extra = "") => {
  try {
    return execSync(`grep -rnE ${JSON.stringify(pattern)} src --include='*.tsx' --include='*.ts' ${extra}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const confirms = grep("window\\.confirm\\(");
check("no window.confirm in the app", !confirms, confirms.split("\n")[0]);
// brand colours belong in globals.css tokens; emails, the invoice template and chart palettes need literal hex
const hex = grep("#(081788|3846b4|d03b3b|f4f4f6)", "| grep -vE 'lib/mail|lib/format|components/invoice|DocumentTemplate|charts/Charts|pm/Avatar|ui-audit'");
check("no hard-coded brand hex colours in pages", !hex, hex.split("\n").slice(0, 3).join(" | "));

// ---------------------------------------------------------------- pages
const one = async (table, q = "") => (await api(`/rest/v1/${table}?select=id${q}&limit=1`))[0]?.id;
const [project, lead, doc, expense, client, vendor, [settings]] = await Promise.all([one("projects"), one("leads"), one("documents"), one("expenses"), one("clients"), one("vendors"), api("/rest/v1/settings?id=eq.1&select=booking")]);
const pages = [
  "/",
  "/my-work",
  "/projects",
  "/projects/new",
  project && `/projects/${project}`,
  project && `/projects/${project}?tab=list`,
  project && `/projects/${project}?tab=money`,
  "/calendar",
  "/time",
  "/crm",
  lead && `/crm/${lead}`,
  "/clients",
  client && `/clients/${client}`,
  "/documents",
  "/documents/new?type=invoice",
  doc && `/documents/${doc}`,
  "/expenses",
  "/expenses/new",
  expense && `/expenses/${expense}`,
  "/vendors",
  vendor && `/vendors/${vendor}`,
  "/reports",
  "/search?q=a",
  "/agreements",
  "/agreements/new",
  "/agreements/templates",
  "/verify",
  "/team",
  "/team/workload",
  "/team/leave",
  "/settings",
  "/items",
  "/enquire",
  settings?.booking?.enabled && `/book/${settings.booking.slug}`,
].filter(Boolean);

const link = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", email: "team@korakaagaz.co" }),
}).then((r) => r.json());
const browser = await puppeteer.launch({ headless: true });
fs.mkdirSync(".visual/audit", { recursive: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/auth/callback?token_hash=${link.hashed_token ?? link.properties?.hashed_token}&type=magiclink`, { waitUntil: "load" });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/favicon|Download the React DevTools/.test(m.text()) && errors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));
  for (const [vw, vh, tag] of [
    [1440, 900, "d"],
    [390, 844, "m"],
  ]) {
    await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 1 });
    for (const path of pages) {
      errors.length = 0;
      const t0 = Date.now();
      const res = await page.goto(`${base}${path}`, { waitUntil: "networkidle2", timeout: 60000 }).catch((e) => ({ status: () => e.message }));
      await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 30000 }).catch(() => {});
      const ms = Date.now() - t0;
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const name = `${tag}-${path.replace(/[/?=&]+/g, "_").replace(/^_|_$/g, "") || "home"}`.slice(0, 80);
      await page.screenshot({ path: `.visual/audit/${name}.png`, fullPage: true });
      const status = res?.status?.();
      const problems = [status !== 200 && status !== 304 && `status ${status}`, overflow > 1 && `overflows ${overflow}px`, ms > 3000 && `${ms} ms`, errors.length && `console: ${errors[0]}`].filter(
        Boolean,
      );
      check(`${tag === "d" ? "desktop" : "phone"} ${path}`, !problems.length, problems.join("; ") || `${ms} ms`);
    }
  }
} finally {
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
