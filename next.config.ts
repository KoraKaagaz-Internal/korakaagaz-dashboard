import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Chromium ships its own binaries; keep it out of the bundle.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer"],
  outputFileTracingIncludes: {
    "/api/invoices/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
