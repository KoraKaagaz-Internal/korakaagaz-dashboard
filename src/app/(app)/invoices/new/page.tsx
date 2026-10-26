import { getSettings, listClients, paymentSnapshot } from "@/lib/data";
import { todayIso } from "@/lib/money";
import { InvoiceEditor } from "../InvoiceEditor";

export default async function NewInvoicePage() {
  const [settings, clients] = await Promise.all([getSettings(), listClients()]);
  const preview = `${settings.invoice_prefix}-${new Date().getFullYear()}-${String(settings.next_number).padStart(3, "0")}`;
  return (
    <InvoiceEditor
      clients={clients}
      payment={paymentSnapshot(settings)}
      numberPlaceholder={preview}
      initial={{
        number: "",
        client_id: null,
        client: { name: "", address: "", gstin: "", email: "", phone: "" },
        issue_date: todayIso(),
        due_date: null,
        currency: settings.default_currency,
        payment_terms: settings.default_payment_terms,
        discount_type: "none",
        discount_value: 0,
        gst_mode: settings.default_gst_mode,
        gst_rate: settings.default_gst_rate,
        notes: "",
        items: [{ title: "", description: "", qty: 1, unit_price: 0 }],
      }}
    />
  );
}
