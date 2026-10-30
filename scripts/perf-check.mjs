// Times key pages as the signed-in admin: server response (TTFB) and full load, median of 3.
// Read-only apart from signing in. Usage: node scripts/perf-check.mjs [baseUrl]
// Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "https://app.korakaagaz.co";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
const api = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", ...init.headers } });
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};

const link = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: "team@korakaagaz.co" }) });
const [project] = (await api("/rest/v1/projects?select=id&limit=1")) ?? [];
const pages = ["/", "/my-work", "/projects", ...(project ? [`/projects/${project.id}`] : []), "/documents", "/clients", "/calendar", "/time", "/reports", "/team/workload", "/settings"];

const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(`${base}/auth/callback?token_hash=${link.hashed_token ?? link.properties.hashed_token}&type=magiclink`, { waitUntil: "load" });
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const rows = [];
let region = "";
for (const p of pages) {
  const ttfb = [];
  const load = [];
  for (let i = 0; i < 3; i++) {
    const res = await page.goto(`${base}${p}`, { waitUntil: "load", timeout: 90000 });
    region ||= res?.headers()["x-vercel-id"] ?? "";
    const t = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return { ttfb: n.responseStart - n.requestStart, load: n.loadEventEnd - n.startTime };
    });
    ttfb.push(t.ttfb);
    load.push(t.load);
  }
  rows.push({ page: p.replace(/[0-9a-f-]{36}/, "[id]"), ttfb_ms: Math.round(median(ttfb)), load_ms: Math.round(median(load)) });
}
await browser.close();
console.table(rows);
console.log(`median TTFB ${median(rows.map((r) => r.ttfb_ms))} ms · region ${region.split("::").slice(0, 2).join("::")}`);
