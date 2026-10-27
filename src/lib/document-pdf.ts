import "server-only";
import { cookies, headers } from "next/headers";
import { renderPdf } from "./pdf";

async function origin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
}

/** PDF of a document as the signed-in member sees it (forwards their session cookies). */
export async function documentPdf(id: string): Promise<Uint8Array> {
  return renderPdf(`${await origin()}/print/${id}`, (await cookies()).getAll());
}

/** PDF for a public share link (no cookies; the print page reads the document by token). */
export async function sharedPdf(token: string): Promise<Uint8Array> {
  return renderPdf(`${await origin()}/print/share/${token}`, []);
}
