import { NextResponse } from "next/server";
import { loadByToken } from "@/lib/agreement-sign";

export const runtime = "nodejs";

/** The signed PDF, for a signer who has signed, once everyone has. */
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await loadByToken(token);
  if (!ctx || !ctx.signer.signed_at || ctx.agreement.status !== "signed" || !ctx.agreement.signed_pdf_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await ctx.supabase.storage.from("files").download(ctx.agreement.signed_pdf_path);
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${ctx.agreement.number}-signed.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
