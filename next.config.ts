import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Chromium ships its own binaries; keep it out of the bundle.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer"],
  // Every route that renders a PDF needs the Chromium binary: downloads, share links, and the
  // document page (its "Email" action attaches the PDF).
  outputFileTracingIncludes: {
    "/api/documents/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/share/[token]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/documents/[id]": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
