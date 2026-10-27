import "server-only";
import type { Browser } from "puppeteer-core";

/** Launches Chromium: the serverless build on Vercel, full Puppeteer locally. */
async function launch(): Promise<Browser> {
  if (process.env.VERCEL) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  const puppeteer = await import("puppeteer");
  return (await puppeteer.launch({ headless: true })) as unknown as Browser;
}

/** Renders a URL of this app to a PDF at the invoice's page size, forwarding the user's auth cookies. */
export async function renderPdf(url: string, cookies: { name: string; value: string }[]): Promise<Uint8Array> {
  const browser = await launch();
  try {
    const target = new URL(url);
    await browser.setCookie(
      ...cookies.map((c) => ({ name: c.name, value: c.value, domain: target.hostname, path: "/", secure: target.protocol === "https:" })),
    );
    const page = await browser.newPage();
    await page.setViewport({ width: 852, height: 1278, deviceScaleFactor: 2 });
    const res = await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
    if (!res || !res.ok()) throw new Error(`Print page returned ${res?.status()}`);
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({ width: "852px", height: "1278px", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

/** File name for a document PDF: "KK-26-27-001.pdf" (slashes aren't allowed in file names). */
export function pdfFileName(number: string | null, fallback = "draft"): string {
  return `${(number || fallback).replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
}
