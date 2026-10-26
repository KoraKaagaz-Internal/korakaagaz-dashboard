import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { renderPdf } from "@/lib/pdf";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: invoice } = await supabase.from("invoices").select("id, number").eq("id", id).maybeSingle();
  if (!invoice) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const pdf = await renderPdf(`${origin}/print/${id}`, (await cookies()).getAll());

  // Keep a copy of the latest PDF in Storage alongside the invoice record.
  const path = `${user.id}/${invoice.number}.pdf`;
  const { error } = await supabase.storage.from("invoices").upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (!error) await supabase.from("invoices").update({ pdf_path: path }).eq("id", id);

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.number}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
