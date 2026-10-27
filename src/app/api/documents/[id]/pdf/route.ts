import { NextResponse, type NextRequest } from "next/server";
import { documentPdf } from "@/lib/document-pdf";
import { pdfFileName } from "@/lib/pdf";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: doc } = await supabase.from("documents").select("id, number, status").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pdf = await documentPdf(id);

  // Keep the latest PDF of issued documents in Storage.
  if (doc.number) {
    const path = `documents/${pdfFileName(doc.number)}`;
    const { error } = await supabase.storage.from("invoices").upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (!error) await supabase.from("documents").update({ pdf_path: path }).eq("id", id);
  }

  const inline = request.nextUrl.searchParams.get("inline") === "1";
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${pdfFileName(doc.number)}"`,
      "Cache-Control": "no-store",
    },
  });
}
