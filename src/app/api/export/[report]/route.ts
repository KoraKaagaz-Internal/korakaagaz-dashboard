import { NextResponse, type NextRequest } from "next/server";
import { getSettings, listDocuments, requireMember } from "@/lib/data";
import { GSTR1_SECTIONS, gstr1Section, toCsv, type Gstr1Section, type Row } from "@/lib/gstr1";
import { listExpenses, listVendors } from "@/lib/expense-data";
import { tdsNature } from "@/lib/expenses";
import { buildLedger } from "@/lib/ledger";
import { formatInvoiceDate } from "@/lib/money";
import { DOC_LABELS, DOC_TYPES, type DocType } from "@/lib/types";

export const runtime = "nodejs";

/** CSV exports: documents, payments, tds, ledger (?client=), gstr1 (?section=). Filters: from, to, type, status, client. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { supabase } = await requireMember();
  const { report } = await params;
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const type = DOC_TYPES.includes(sp.get("type") as DocType) ? (sp.get("type") as DocType) : "";
  let rows: Row[] = [];
  let name = report;

  if (report === "documents") {
    const docs = await listDocuments({ type, from, to, status: sp.get("status") ?? undefined, client: sp.get("client") ?? undefined, q: sp.get("q") ?? undefined });
    rows = docs.map((d) => ({
      Type: DOC_LABELS[d.doc_type].short,
      Number: d.number ?? "",
      Status: d.status,
      Date: d.issue_date,
      "Due / valid until": d.doc_type === "quote" ? (d.valid_until ?? "") : (d.due_date ?? ""),
      Client: d.client.name,
      "Client GSTIN": d.client.gstin,
      "Place of supply": d.place_of_supply,
      Currency: d.currency,
      "FX rate": d.fx_rate,
      "Taxable value": d.taxable,
      CGST: d.cgst,
      SGST: d.sgst,
      IGST: d.igst,
      Total: d.total,
      Received: d.balance?.paid ?? "",
      TDS: d.balance?.tds ?? "",
      Balance: d.balance?.balance ?? "",
      "Payment status": d.balance?.payment_status ?? "",
    }));
  } else if (report === "payments" || report === "tds") {
    let q = supabase.from("payments").select("*, documents(number, currency, client_snapshot)").order("paid_on");
    if (from) q = q.gte("paid_on", from);
    if (to) q = q.lte("paid_on", to);
    if (report === "tds") q = q.gt("tds_amount", 0);
    const { data } = await q;
    rows = (data ?? []).map((p) => ({
      Date: p.paid_on,
      Invoice: p.documents?.number ?? "",
      Client: p.documents?.client_snapshot?.name ?? "",
      "Client GSTIN": p.documents?.client_snapshot?.gstin ?? "",
      Currency: p.documents?.currency ?? "INR",
      Amount: Number(p.amount),
      "TDS amount": Number(p.tds_amount),
      "TDS section": p.tds_section,
      Mode: p.mode,
      Reference: p.reference,
      Note: p.note,
    }));
  } else if (report === "ledger") {
    const client = sp.get("client");
    if (!client) return NextResponse.json({ error: "client required" }, { status: 400 });
    const docs = await listDocuments({ client });
    const { data: pays } = await supabase.from("payments").select("*, documents!inner(client_id)").eq("documents.client_id", client);
    const ledger = buildLedger(docs, pays ?? [], from, to);
    rows = [
      ...(ledger.opening ? [{ Date: from ?? "", Particulars: "Opening balance", Debit: "", Credit: "", Balance: ledger.opening }] : []),
      ...ledger.rows.map((r) => ({ Date: formatInvoiceDate(r.date), Particulars: r.particulars, Debit: r.debit || "", Credit: r.credit || "", Balance: r.balance })),
    ];
    name = `statement-${docs[0]?.client.name.replace(/\W+/g, "-").toLowerCase() ?? client}`;
  } else if (report === "gstr1") {
    const section = sp.get("section") as Gstr1Section;
    if (!(section in GSTR1_SECTIONS)) return NextResponse.json({ error: "unknown section" }, { status: 400 });
    const [settings, docs] = await Promise.all([getSettings(), listDocuments({ from, to })]);
    const full = docs.filter((d) => d.status !== "draft");
    // Items are needed for the HSN summary.
    if (section.startsWith("hsn")) {
      const { data: items } = await supabase
        .from("document_items")
        .select("*")
        .in(
          "document_id",
          full.map((d) => d.id),
        );
      const byDoc = new Map<string, Record<string, unknown>[]>();
      for (const i of items ?? []) byDoc.set(i.document_id, [...(byDoc.get(i.document_id) ?? []), i]);
      for (const d of full)
        d.items = (byDoc.get(d.id) ?? []).map((i) => ({
          title: String(i.title),
          description: String(i.description),
          sac: String(i.sac),
          qty: Number(i.qty),
          unit_price: Number(i.unit_price),
        }));
    }
    rows = gstr1Section(section, full, settings.state_code);
    name = `gstr1-${section}`;
  } else if (report === "purchases" || report === "tds-payable") {
    const all = await listExpenses({ from, to }, 5000);
    const list = report === "tds-payable" ? all.filter((e) => e.tds_amount > 0) : all.filter((e) => !e.is_draft && e.approval !== "rejected");
    const vendors = new Map((await listVendors()).map((v) => [v.id, v]));
    rows = list.map((e): Row => {
      const v = e.vendor_id ? vendors.get(e.vendor_id) : undefined;
      return report === "tds-payable"
        ? {
            Date: e.expense_date,
            Deductee: e.vendor,
            PAN: v?.pan ?? "",
            "Deductee type": v?.is_company ? "Company/firm" : "Individual/HUF",
            Nature: tdsNature(e.tds_nature).label,
            "Amount paid/credited": e.taxable,
            "TDS rate %": e.tds_rate,
            "TDS amount": e.tds_amount,
            "Bill no.": e.bill_no,
            Deposited: e.tds_challan_id ? "Yes" : "No",
          }
        : {
            Date: e.expense_date,
            Type: e.kind === "claim" ? "Team claim" : e.kind === "bill" ? "Bill" : "Paid",
            "Bill no.": e.bill_no,
            Vendor: e.vendor,
            "Vendor GSTIN": v?.gstin ?? "",
            "Vendor state": v?.state_code ?? "",
            Category: e.category,
            Description: e.description,
            Project: e.project_code,
            Currency: e.currency,
            "Taxable value": e.taxable,
            "GST rate %": e.gst_rate,
            CGST: e.cgst,
            SGST: e.sgst,
            IGST: e.igst,
            "Reverse charge": e.rcm ? "Y" : "N",
            Total: e.total,
            "Input credit": e.itc_status,
            "GSTR-2B": e.gstr2b.replace("_", " "),
            TDS: e.tds_amount,
            Paid: e.paid,
            Balance: e.balance,
          };
    });
    name = report;
  } else {
    return NextResponse.json({ error: "unknown report" }, { status: 404 });
  }

  const suffix = [from, to].filter(Boolean).join("_to_");
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}${suffix ? `-${suffix}` : ""}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
