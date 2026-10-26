// Screenshots /dev/sample and diffs it against a reference PNG of the design.
// Usage: node scripts/visual-diff.mjs [reference.png] [baseUrl]
// Writes .visual/actual.png, .visual/diff.png, .visual/side-by-side.png
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const reference = process.argv[2] ?? "public/dev-reference.png";
const baseUrl = process.argv[3] ?? "http://localhost:3000";
const outDir = ".visual";
fs.mkdirSync(outDir, { recursive: true });

const ref = PNG.sync.read(fs.readFileSync(reference));
const browser = await puppeteer.launch();
const page = await browser.newPage();
// The reference screenshot has a ~1-2px frame; render at the same size.
await page.setViewport({ width: ref.width, height: ref.height, deviceScaleFactor: 1 });
await page.goto(`${baseUrl}/dev/sample`, { waitUntil: "load", timeout: 90000 });
await page.evaluateHandle("document.fonts.ready");
await page.addStyleTag({ content: "body{margin:0;background:#1e1e1e} body>div{margin:2px 0 0 1px!important}" });
const shot = await page.screenshot({ clip: { x: 0, y: 0, width: ref.width, height: ref.height } });
await browser.close();

const actual = PNG.sync.read(Buffer.from(shot));
fs.writeFileSync(path.join(outDir, "actual.png"), PNG.sync.write(actual));

const diff = new PNG({ width: ref.width, height: ref.height });
const mismatched = pixelmatch(ref.data, actual.data, diff.data, ref.width, ref.height, { threshold: 0.1 });
fs.writeFileSync(path.join(outDir, "diff.png"), PNG.sync.write(diff));

const side = new PNG({ width: ref.width * 2, height: ref.height });
PNG.bitblt(ref, side, 0, 0, ref.width, ref.height, 0, 0);
PNG.bitblt(actual, side, 0, 0, ref.width, ref.height, ref.width, 0);
fs.writeFileSync(path.join(outDir, "side-by-side.png"), PNG.sync.write(side));

const pct = ((mismatched / (ref.width * ref.height)) * 100).toFixed(2);
console.log(`mismatched pixels: ${mismatched} (${pct}%) -> ${outDir}/diff.png`);
