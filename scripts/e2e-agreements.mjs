// End-to-end checks of agreements: draft from a template, edit, send, sign on the public page with an
// email code (add-ons chosen), the sealed PDF and its fingerprint, verify, quote from proposal, and
// a declined NDA. Safe on real data: it only touches its own rows, and every email address it uses
// is @example.com, which the app never actually emails.
//
// Usage: node scripts/e2e-agreements.mjs [baseUrl]
// Env (from .env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
import { createHash, createHmac } from "node:crypto";
import puppeteer from "puppeteer";

const base = process.argv[2] ?? "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CRON_SECRET;
if (!SUPABASE_URL || !SERVICE || !SECRET) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET");
const stamp = Date.now();
const CLIENT = `E2E Agreement Client ${stamp}`;
const CLIENT_EMAIL = `e2e-sign-${stamp}@example.com`;

const api = async (path, init = {}) => {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
  });
  const t = await res.text();
  return t ? JSON.parse(t) : null;
};
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
};
async function until(fn, ms = 20000) {
  const end = Date.now() + ms;
  let v;
  while (Date.now() < end) {
    v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 700));
  }
  return v;
}
function helpers(page) {
  page.setDefaultTimeout(45000);
  const go = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 90000 });
    await page.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 60000 }).catch(() => {});
  };
  const tap = async (selector) => {
    for (let i = 0; ; i++) {
      try {
        const h = await page.waitForSelector(selector, { visible: true });
        await h.evaluate((el) => el.scrollIntoView({ block: "center" }));
        await h.click();
        return;
      } catch (e) {
        if (i >= 4) throw e;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  };
  const button = (t) => tap(`::-p-xpath(//button[normalize-space()='${t}' and not(@disabled)] | //a[normalize-space()='${t}'])`);
  const confirm = () => tap("::-p-xpath((//span[@role='dialog']//button)[last()])");
  const body = () => page.evaluate(() => document.body.innerText);
  return { go, tap, button, confirm, body };
}
const otpHash = (signerId, code) => createHmac("sha256", SECRET).update(`otp:${signerId}:${code}`).digest("hex");

const browser = await puppeteer.launch();
const made = { clients: [], agreements: [], documents: [] };
try {
  const [client] = await api("/rest/v1/clients", {
    method: "POST",
    body: JSON.stringify({ name: CLIENT, email: CLIENT_EMAIL, state_code: "21", address: "1 Test Street", city: "Bhubaneswar", pin: "751001" }),
  });
  made.clients.push(client.id);

  const link = await api("/auth/v1/admin/generate_link", { method: "POST", body: JSON.stringify({ type: "magiclink", email: "team@korakaagaz.co" }) });
  const admin = await browser.newPage();
  await admin.setViewport({ width: 1400, height: 1000 });
  const A = helpers(admin);
  await admin.goto(`${base}/auth/callback?token_hash=${link.hashed_token ?? link.properties?.hashed_token}&type=magiclink`, { waitUntil: "load" });

  // ---------------------------------------------------------------- draft from the proposal template
  await A.go(`/agreements/new?client=${client.id}&kind=proposal`);
  const newBody = await A.body();
  check(
    "new agreement page lists the starter templates",
    ["Proposal: brand identity", "Service agreement", "Mutual NDA", "Freelancer agreement", "Model release", "Usage licence"].every((t) => newBody.includes(t)),
  );
  await A.button("Create draft");
  await admin.waitForFunction(() => /\/agreements\/[0-9a-f-]{36}$/.test(location.pathname), { timeout: 60000 });
  const agId = admin.url().match(/agreements\/([0-9a-f-]{36})/)[1];
  made.agreements.push(agId);
  const [draft] = await api(`/rest/v1/agreements?id=eq.${agId}&select=kind,status,body,items,client_id,expires_on`);
  check(
    "draft is a proposal for the client with pricing from the template",
    draft.kind === "proposal" && draft.status === "draft" && draft.client_id === client.id && draft.items.length === 3,
    JSON.stringify({ k: draft.kind, n: draft.items.length }),
  );
  check("merge fields are filled from the client and studio", draft.body.includes(`**${CLIENT}**`) && !draft.body.includes("{{"));
  const [signer0] = await api(`/rest/v1/agreement_signers?agreement_id=eq.${agId}&select=email,party`);
  check("the client is added as the signer", signer0?.email === CLIENT_EMAIL && signer0?.party === "client", JSON.stringify(signer0));

  // edit the title in the editor and save
  const title = await admin.waitForSelector("::-p-xpath(//label[span[normalize-space()='Title']]//input)");
  await title.click({ clickCount: 3 });
  await title.type(`E2E Proposal ${stamp}`);
  await A.button("Save draft");
  const renamed = await until(async () => (await api(`/rest/v1/agreements?id=eq.${agId}&select=title`))[0]?.title === `E2E Proposal ${stamp}`);
  check("editing and saving the draft", !!renamed);

  // ---------------------------------------------------------------- send
  await A.button("Send for signature");
  await A.confirm();
  const sent = await until(async () => (await api(`/rest/v1/agreements?id=eq.${agId}&select=status,sent_at`))[0]?.status === "sent");
  check("sending moves it to waiting for signature", !!sent);
  await A.go(`/agreements/${agId}`);
  check("staff page shows the signer and history", (await A.body()).includes("Not opened") && (await A.body()).includes("sent it for signature"));

  // ---------------------------------------------------------------- public signing page
  const [signer] = await api(`/rest/v1/agreement_signers?agreement_id=eq.${agId}&select=id,token`);
  const pub = await (await browser.createBrowserContext()).newPage();
  await pub.setViewport({ width: 390, height: 844, isMobile: true });
  const P = helpers(pub);
  await P.go(`/s/${signer.token}`);
  const pubBody = await P.body();
  check("the signing page opens without an account", pubBody.includes(`E2E Proposal ${stamp}`) || pubBody.includes(CLIENT));
  check("opening the link is logged", !!(await until(async () => (await api(`/rest/v1/agreement_events?agreement_id=eq.${agId}&action=eq.viewed&select=id`)).length)));
  const scroll = await pub.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("the signing page fits a phone", scroll <= 1, `${scroll}px`);
  // choose the first optional add-on (Stationery set)
  await P.tap("::-p-xpath(//input[@type='checkbox' and @aria-label='Stationery set'])");
  await P.button("Email me a code");
  await pub.waitForFunction(() => document.body.innerText.includes("Code from the email"));
  // the code went by email (skipped for @example.com): put a known one in its place
  await api(`/rest/v1/agreement_signers?id=eq.${signer.id}`, { method: "PATCH", body: JSON.stringify({ otp_hash: otpHash(signer.id, "424242") }) });
  // wrong code first
  const codeBox = await pub.waitForSelector("input[autocomplete='one-time-code']");
  await codeBox.type("111111");
  await P.tap("::-p-xpath(//label[contains(., 'agree to sign electronically')]//input)");
  await P.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Accept and sign')])");
  await pub.waitForFunction(() => document.body.innerText.includes("isn't right"));
  check("a wrong code is refused and counted", (await api(`/rest/v1/agreement_signers?id=eq.${signer.id}&select=otp_attempts`))[0].otp_attempts === 1);
  await codeBox.click({ clickCount: 3 });
  await codeBox.type("424242");
  // the studio's own email gets the "signed" copy; point it at a test address for this run
  await api(`/rest/v1/agreements?id=eq.${agId}`, { method: "PATCH", body: JSON.stringify({ created_by: `e2e-owner-${stamp}@example.com` }) });
  await P.tap("::-p-xpath(//button[starts-with(normalize-space(), 'Accept and sign')])");
  await pub.waitForFunction(() => /Signed/.test(document.body.innerText) && !document.body.innerText.includes("Signing…"), { timeout: 90000 });
  const done = await until(async () => {
    const [a] = await api(`/rest/v1/agreements?id=eq.${agId}&select=status,final_hash,signed_pdf_path,items,completed_at`);
    return a?.status === "signed" && a.final_hash ? a : null;
  }, 90000);
  check(
    "signing completes and seals the agreement",
    !!done,
    JSON.stringify(done ?? (await api(`/rest/v1/agreement_events?agreement_id=eq.${agId}&select=action,detail&order=id`))),
  );
  check(
    "the chosen add-on is part of the signed version",
    !!done && done.items.find((i) => i.title === "Stationery set")?.selected === true && done.items.find((i) => i.title === "Social media kit")?.selected === false,
  );
  const [signed] = await api(`/rest/v1/agreement_signers?id=eq.${signer.id}&select=signed_at,signature_name,signed_ip,otp_hash`);
  check(
    "the signature records name, time and IP, and the code is cleared",
    !!signed.signed_at && !!signed.signature_name && !!signed.signed_ip && signed.otp_hash === null,
    JSON.stringify(signed),
  );
  const events = await api(`/rest/v1/agreement_events?agreement_id=eq.${agId}&select=action,hash,prev_hash&order=id`);
  const chained = events.every((e, i) => i === 0 || e.prev_hash === events[i - 1].hash);
  check(
    "the signing log is complete and chained",
    ["created", "sent", "viewed", "code_sent", "code_wrong", "code_verified", "signed", "completed", "sealed"].every((a) => events.some((e) => e.action === a)) && chained,
    events.map((e) => e.action).join(","),
  );

  // the signer downloads the PDF; its SHA-256 matches and verify recognises it
  if (done) {
    const pdf = new Uint8Array(await (await fetch(`${base}/s/${signer.token}/pdf`)).arrayBuffer());
    const hash = createHash("sha256").update(pdf).digest("hex");
    check("the signed PDF downloads and matches its fingerprint", String.fromCharCode(...pdf.slice(0, 5)) === "%PDF-" && hash === done.final_hash, `${pdf.length} bytes`);
    const verified = await (
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_agreement_hash`, {
        method: "POST",
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SERVICE, "Content-Type": "application/json" },
        body: JSON.stringify({ p_hash: hash }),
      })
    ).json();
    check("verify recognises the signed copy", verified?.number && verified.signers?.[0]?.name === signed.signature_name, JSON.stringify(verified));
    pdf[pdf.length - 10] ^= 1;
    const tampered = createHash("sha256").update(pdf).digest("hex");
    const none = await (
      await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_agreement_hash`, {
        method: "POST",
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? SERVICE, "Content-Type": "application/json" },
        body: JSON.stringify({ p_hash: tampered }),
      })
    ).json();
    check("a changed copy doesn't verify", none === null);
  }
  await P.go(`/s/${signer.token}`);
  check("a signed link can't be signed again", !(await pub.$("::-p-xpath(//button[normalize-space()='Email me a code'])")));

  // ---------------------------------------------------------------- quote from the proposal
  await A.go(`/agreements/${agId}`);
  await A.button("Create quote from proposal");
  await admin.waitForFunction(() => /\/documents\/[0-9a-f-]{36}\/edit/.test(location.pathname), { timeout: 60000 });
  const quoteId = admin.url().match(/documents\/([0-9a-f-]{36})/)[1];
  made.documents.push(quoteId);
  const [quote] = await api(`/rest/v1/documents?id=eq.${quoteId}&select=doc_type,status,client_id,taxable,document_items(title,unit_price)`);
  check(
    "the quote has the accepted lines only (identity + stationery)",
    quote.doc_type === "quote" && quote.status === "draft" && quote.client_id === client.id && Number(quote.taxable) === 145000 && quote.document_items.length === 2,
    JSON.stringify(quote),
  );
  const [linked] = await api(`/rest/v1/agreements?id=eq.${agId}&select=quote_id`);
  check("the proposal links to its quote", linked.quote_id === quoteId);

  // ---------------------------------------------------------------- an NDA the signer declines
  await A.go(`/agreements/new?client=${client.id}&kind=nda`);
  await A.tap("::-p-xpath(//button[.//div[normalize-space()='Mutual NDA']])");
  await A.button("Create draft");
  await admin.waitForFunction((prev) => /\/agreements\/[0-9a-f-]{36}$/.test(location.pathname) && !location.pathname.endsWith(prev), { timeout: 60000 }, agId);
  const ndaId = admin.url().match(/agreements\/([0-9a-f-]{36})/)[1];
  made.agreements.push(ndaId);
  const ndaSigners = await api(`/rest/v1/agreement_signers?agreement_id=eq.${ndaId}&select=party&order=position`);
  check("an NDA gets the client and a studio counter-signer", ndaSigners.map((s) => s.party).join(",") === "client,studio", JSON.stringify(ndaSigners));
  // keep this one away from real inboxes: make the studio signer a test address
  await api(`/rest/v1/agreement_signers?agreement_id=eq.${ndaId}&party=eq.studio`, { method: "PATCH", body: JSON.stringify({ email: `e2e-studio-${stamp}@example.com` }) });
  await A.go(`/agreements/${ndaId}`);
  await A.button("Send for signature");
  await A.confirm();
  await until(async () => (await api(`/rest/v1/agreements?id=eq.${ndaId}&select=status`))[0]?.status === "sent");
  const [ndaClient] = await api(`/rest/v1/agreement_signers?agreement_id=eq.${ndaId}&party=eq.client&select=token`);
  await P.go(`/s/${ndaClient.token}`);
  await P.button("I don't want to sign this");
  await (await pub.waitForSelector("textarea")).type("Our legal team uses its own template");
  await P.button("Decline");
  const declined = await until(async () => (await api(`/rest/v1/agreements?id=eq.${ndaId}&select=status`))[0]?.status === "declined");
  check("declining marks the agreement declined", !!declined);
  const ping = await until(async () => (await api(`/rest/v1/notifications?kind=eq.agreement_declined&link=eq.${encodeURIComponent(`/agreements/${ndaId}`)}&select=id`)).length);
  check("the studio is told about the decline", ping >= 1);

  // ---------------------------------------------------------------- lists and links
  await A.go("/agreements?status=signed");
  check("signed list shows the proposal", (await A.body()).includes(`E2E Proposal ${stamp}`));
  await A.go(`/clients/${client.id}`);
  check("the client page lists its agreements", (await A.body()).includes(`E2E Proposal ${stamp}`));
  const cron = await fetch(`${base}/api/cron/daily?dry=1`, { headers: { Authorization: `Bearer ${SECRET}` } }).then((r) => r.json());
  check(
    "the daily job reports agreement reminders and renewals",
    Array.isArray(cron.agreementReminders) && Array.isArray(cron.renewals) && Array.isArray(cron.agreementsExpired),
    JSON.stringify(Object.keys(cron)),
  );
} catch (e) {
  check("unexpected error", false, e.message.split("\n")[0]);
} finally {
  for (const id of made.agreements) {
    const [a] = (await api(`/rest/v1/agreements?id=eq.${id}&select=signed_pdf_path`)) ?? [];
    if (a?.signed_pdf_path) await api("/storage/v1/object/files", { method: "DELETE", body: JSON.stringify({ prefixes: [a.signed_pdf_path] }) });
    await api(`/rest/v1/agreements?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of made.documents) {
    await api(`/rest/v1/document_items?document_id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/documents?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  for (const id of made.clients) {
    await api(`/rest/v1/clients?id=eq.${id}`, { method: "DELETE" });
    await api(`/rest/v1/audit_events?entity_id=eq.${id}`, { method: "DELETE" });
  }
  await api(`/rest/v1/notifications?link=like.${encodeURIComponent("/agreements/")}*&title=like.*E2E*`, { method: "DELETE" });
  await browser.close();
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} checks passed`);
process.exit(passed === results.length ? 0 : 1);
