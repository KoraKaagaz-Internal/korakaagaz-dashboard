import { NextResponse } from "next/server";
import { requireMember } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Staff download of a signed agreement. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireMember();
  const { id } = await params;
  const { data: a } = await supabase.from("agreements").select("number, signed_pdf_path").eq("id", id).maybeSingle();
  if (!a?.signed_pdf_path) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data } = await createAdminClient().storage.from("files").download(a.signed_pdf_path);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(await data.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${a.number}-signed.pdf"`, "Cache-Control": "no-store" },
  });
}
