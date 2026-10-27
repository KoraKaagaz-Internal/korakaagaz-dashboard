import { NextResponse } from "next/server";
import { sharedPdf } from "@/lib/document-pdf";
import { pdfFileName } from "@/lib/pdf";
import { loadShared } from "@/lib/shared";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const shared = await loadShared(token, false);
  if (!shared) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const pdf = await sharedPdf(token);
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName(shared.doc.number)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
