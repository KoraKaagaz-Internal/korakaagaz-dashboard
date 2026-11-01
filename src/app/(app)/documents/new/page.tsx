import { requireMember } from "@/lib/data";
import { addDays, todayIso } from "@/lib/money";
import { DOC_TYPES, type DocType, type DocumentDraft } from "@/lib/types";
import { DocumentEditor } from "../DocumentEditor";
import { editorData } from "../editor-data";

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string; client?: string; project?: string }> }) {
  await requireMember("member");
  const params = await searchParams;
  const docType: DocType = DOC_TYPES.includes(params.type as DocType) ? (params.type as DocType) : "invoice";
  const today = todayIso();
  const data = await editorData(docType, today, null);
  const s = data.settings;
  const project = data.projects.find((p) => p.id === params.project);
  const client = data.clients.find((c) => c.id === (params.client ?? project?.client_id));

  const initial: DocumentDraft = {
    doc_type: docType,
    number: null,
    client_id: null,
    client: { name: "", email: "", phone: "", address: "", city: "", pin: "", state_code: "", country: "India", gstin: "" },
    bank_account_id: null,
    project_id: null,
    source_id: null,
    source_relation: null,
    issue_date: today,
    due_date: docType === "invoice" || docType === "proforma" ? addDays(today, s.default_due_days) : null,
    valid_until: docType === "quote" ? addDays(today, 15) : null,
    currency: s.default_currency,
    fx_rate: 1,
    place_of_supply: s.state_code,
    reverse_charge: false,
    export_type: "none",
    gst_mode: "cgst_sgst",
    gst_rate: s.default_gst_rate,
    discount_type: "none",
    discount_value: 0,
    round_off: true,
    notes: "",
    terms: s.terms[docType] ?? "",
    payment_terms: s.default_due_days === 0 ? "Due on receipt" : `Net ${s.default_due_days}`,
    custom_fields: [],
    reminders_enabled: true,
    recurring: null,
    items: [{ title: "", description: "", sac: s.default_sac, qty: 1, unit_price: 0 }],
  };
  if (client) {
    const abroad = client.country !== "India";
    Object.assign(initial, {
      client_id: client.id,
      client: {
        name: client.name,
        email: client.email,
        phone: client.phone,
        address: client.address,
        city: client.city,
        pin: client.pin,
        state_code: client.state_code,
        country: client.country,
        gstin: client.gstin,
      },
      place_of_supply: abroad ? "96" : client.state_code || s.state_code,
      export_type: abroad ? (s.lut_number ? "lut" : "igst") : "none",
      currency: abroad ? "USD" : "INR",
    });
  }

  if (project && (!project.client_id || project.client_id === initial.client_id)) initial.project_id = project.id;

  return (
    <DocumentEditor
      initial={initial}
      clients={data.clients}
      items={data.items}
      projects={data.projects}
      banks={data.banks}
      supplier={data.supplier}
      defaultSac={s.default_sac}
      numberPreview={data.numberPreview}
    />
  );
}
