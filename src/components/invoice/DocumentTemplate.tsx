import "@/styles/invoice.css";
import { EXPORT_IGST_ENDORSEMENT, LUT_ENDORSEMENT, OUTSIDE_INDIA, stateLabel } from "@/lib/gst";
import { clientAddressLines, fitClientName } from "@/lib/invoice-layout";
import { amountInWords, computeTotals, formatAmount, formatInvoiceDate, formatMoney, formatQty, lineAmount } from "@/lib/money";
import { estimateNotesHeight, paginate, payBlockHeight } from "@/lib/paginate";
import { qrPath, upiUri } from "@/lib/upi";
import { DOC_LABELS, type DocStatus, type DocumentDraft, type SupplierSnapshot } from "@/lib/types";

export interface DocumentTemplateProps {
  doc: DocumentDraft;
  supplier: SupplierSnapshot;
  status?: DocStatus;
  /** Original invoice for credit notes / converted documents. */
  reference?: { label: string; number: string; date: string } | null;
}

// "Invoice" sets the hero size; longer titles shrink so they keep the same width.
const TITLE_SIZE: Record<DocumentDraft["doc_type"], number> = {
  invoice: 150,
  quote: 118,
  proforma: 128,
  receipt: 150,
  credit_note: 104,
};
const TITLE_TEXT: Record<DocumentDraft["doc_type"], string> = {
  invoice: "Invoice",
  quote: "Quotation",
  proforma: "Proforma",
  receipt: "Receipt",
  credit_note: "Credit Note",
};

export function DocumentTemplate({ doc, supplier, status = "draft", reference }: DocumentTemplateProps) {
  const totals = computeTotals(doc);
  const currency = doc.currency || "INR";
  const money = (n: number) => formatAmount(n, currency);
  const isExport = doc.place_of_supply === OUTSIDE_INDIA || doc.export_type !== "none";
  const label = DOC_LABELS[doc.doc_type];

  const totalsRows: { label: string; value: string }[] = [{ label: "Subtotal", value: money(totals.subtotal) }];
  if (totals.discount > 0) {
    const pct = doc.discount_type === "percent" ? ` (${formatQty(doc.discount_value)}%)` : "";
    totalsRows.push({ label: `Discount${pct}`, value: `− ${money(totals.discount)}` });
  }
  if (doc.gst_mode === "cgst_sgst") {
    const half = formatQty(doc.gst_rate / 2);
    totalsRows.push({ label: `CGST @ ${half}%`, value: money(totals.cgst) });
    totalsRows.push({ label: `SGST @ ${half}%`, value: money(totals.sgst) });
  } else if (doc.gst_mode === "igst") {
    totalsRows.push({ label: `IGST @ ${formatQty(doc.gst_rate)}%`, value: money(totals.igst) });
  }
  if (totals.roundOff !== 0) totalsRows.push({ label: "Round off", value: `${totals.roundOff > 0 ? "+" : "−"} ${money(Math.abs(totals.roundOff))}` });

  const customLine = doc.custom_fields.filter((f) => f.label && f.value).map((f) => `${f.label}: ${f.value}`).join("   ·   ");
  const notes = [
    doc.doc_type === "credit_note" && reference ? `Against invoice ${reference.number} dated ${formatInvoiceDate(reference.date)}.` : "",
    customLine,
    doc.export_type === "lut" ? `${LUT_ENDORSEMENT}${supplier.lut_number ? ` (LUT ${supplier.lut_number})` : ""}` : "",
    doc.export_type === "igst" ? EXPORT_IGST_ENDORSEMENT : "",
    doc.notes,
    doc.terms ? `Terms: ${doc.terms}` : "",
  ].filter(Boolean);

  const items = doc.items.length ? doc.items : [{ title: "", description: "", sac: "", qty: 0, unit_price: 0 }];
  const notesHeight = estimateNotesHeight(notes);
  const pages = paginate(items, totalsRows.length - 1, notesHeight);
  const businessName = supplier.business_name || "Kora Kaagaz";
  const client = doc.client;

  const clientLines = clientAddressLines(client);
  const nameFit = fitClientName(client.name || "—");

  const bank = supplier.bank;
  const showQr = !!bank?.upi_id && currency === "INR" && ["invoice", "proforma"].includes(doc.doc_type) && totals.total > 0 && status !== "cancelled";
  const qr = showQr ? qrPath(upiUri({ vpa: bank!.upi_id, name: businessName, amount: totals.total, note: doc.number ?? undefined })) : null;

  const second =
    doc.doc_type === "quote"
      ? { label: "Valid until", value: formatInvoiceDate(doc.valid_until) }
      : doc.doc_type === "receipt" || doc.doc_type === "credit_note"
        ? { label: "Currency", value: currency }
        : { label: "Due date", value: doc.due_date ? formatInvoiceDate(doc.due_date) : doc.payment_terms || "On receipt" };
  const fourth = {
    label: "Place of supply",
    value: isExport ? "Outside India" : stateLabel(doc.place_of_supply),
    sub: isExport && client.country && client.country !== "India" ? `Country: ${client.country}` : `Reverse charge: ${doc.reverse_charge ? "Yes" : "No"}`,
  };
  const numberLabel = doc.doc_type === "credit_note" ? "Note no." : `${label.short} no.`;

  return (
    <div className="kk-invoice">
      {pages.map((page, pageIndex) => (
        <section key={pageIndex} className={`kk-page${page.isFirst ? "" : " is-continued"}`}>
          {(status === "draft" || status === "awaiting_approval" || status === "cancelled") && (
            <div className="kk-watermark" aria-hidden>
              {status === "cancelled" ? "Cancelled" : "Draft"}
            </div>
          )}

          {page.isFirst && (
            <>
              <h1 className="kk-logo" aria-label={businessName}>
                {businessName.split(/\s+/).map((word, i) => (
                  <div key={i}>{word}</div>
                ))}
              </h1>

              <div className="kk-supplier">
                {supplier.legal_name && supplier.legal_name !== businessName && <div className="kk-supplier-name">{supplier.legal_name}</div>}
                {supplier.address && <div className="kk-supplier-addr">{supplier.address}</div>}
                {supplier.state_code && <div>{stateLabel(supplier.state_code)}</div>}
                {supplier.gstin && <div className="kk-supplier-tax">GSTIN {supplier.gstin}</div>}
              </div>

              <h2 className="kk-title" style={{ fontSize: TITLE_SIZE[doc.doc_type] }}>
                {TITLE_TEXT[doc.doc_type]}
              </h2>

              <div className="kk-billed">
                <div className="kk-label">{doc.doc_type === "quote" ? "Prepared for" : doc.doc_type === "receipt" ? "Received from" : "Billed to"}</div>
                <div className={`kk-client-name${nameFit.wrap ? " is-wrapped" : ""}`} style={{ fontSize: nameFit.size }}>
                  {client.name || "—"}
                </div>
                {clientLines.length > 0 && <div className="kk-client-extra">{clientLines.join("\n")}</div>}
              </div>

              <div className="kk-meta-divider" />

              <div className="kk-meta c1">
                <div className="kk-label">Date</div>
                <div className="kk-value">{formatInvoiceDate(doc.issue_date)}</div>
              </div>
              <div className="kk-meta c2">
                <div className="kk-label">{numberLabel}</div>
                <div className="kk-value">{doc.number || "Draft"}</div>
                {reference && <div className="kk-sub">Ref. {reference.number}</div>}
              </div>
              <div className="kk-meta c1 r2">
                <div className="kk-label">{fourth.label}</div>
                <div className="kk-value">{fourth.value || "—"}</div>
                <div className="kk-sub">{fourth.sub}</div>
              </div>
              <div className="kk-meta c2 r2">
                <div className="kk-label">{second.label}</div>
                <div className="kk-value">{second.value || "—"}</div>
                {doc.doc_type === "invoice" && doc.due_date && doc.payment_terms && <div className="kk-sub">{doc.payment_terms}</div>}
              </div>

              <div className="kk-photo" aria-hidden>
                {/* Blue + grey panels with the corner brackets baked in. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/fabric-panel.jpg" alt="" />
              </div>
            </>
          )}

          <div className="kk-body">
            <div className="kk-thead">
              <span />
              <span>Description</span>
              <span>Qty</span>
              <span className="kk-num">Unit price</span>
              <span className="kk-num">Amount{currency !== "INR" ? ` (${currency})` : ""}</span>
            </div>

            <div className="kk-items">
              {page.items.map(({ item, index }) => (
                <div className="kk-row" key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="kk-item-title">{item.title}</div>
                    {item.description && <div className="kk-item-desc">{item.description}</div>}
                    {item.sac && <div className="kk-item-sac">SAC {item.sac}</div>}
                  </div>
                  <span>{formatQty(item.qty)}</span>
                  <span className="kk-num">{money(item.unit_price)}</span>
                  <span className="kk-num">{money(lineAmount(item))}</span>
                </div>
              ))}
              {!page.isLast && <div className="kk-continued-note">Continued on next page</div>}
              {page.isLast && notes.length > 0 && (
                <div className="kk-notes">
                  {notes.map((n, i) => (
                    <p key={i}>{n}</p>
                  ))}
                </div>
              )}
            </div>

            {page.isLast && (
              <>
                <div className="kk-totals">
                  <div className="kk-totals-left">
                    {qr && (
                      <div className="kk-qr">
                        <svg viewBox={`0 0 ${qr.size} ${qr.size}`} width={78} height={78} shapeRendering="crispEdges" aria-label="UPI QR code">
                          <path d={qr.d} fill="#1a1a2d" />
                        </svg>
                      </div>
                    )}
                    <div className="kk-words">
                      {qr && <div className="kk-scan">Scan with any UPI app to pay</div>}
                      <div className="kk-words-label">Amount in words</div>
                      {amountInWords(totals.total, currency)}
                      {isExport && currency !== "INR" && doc.fx_rate > 0 && (
                        <div className="kk-fx">
                          ≈ {formatMoney(totals.total * doc.fx_rate, "INR")} @ {formatQty(doc.fx_rate)} INR/{currency}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="kk-totals-rows">
                    {totalsRows.map((row) => (
                      <div className="kk-trow" key={row.label}>
                        <span>{row.label}</span>
                        <span>{row.value}</span>
                      </div>
                    ))}
                    <div className="kk-trow kk-trow-total">
                      <span>Total({currency})</span>
                      <span className="kk-big">{money(totals.total)}</span>
                    </div>
                  </div>
                </div>

                <div className="kk-pay" style={{ height: payBlockHeight(totalsRows.length - 1, notesHeight) }}>
                  <div>
                    <div className="kk-label">Payment details</div>
                    {bank?.upi_id && (
                      <>
                        <h4>UPI ID</h4>
                        <div className="kk-value" style={{ fontSize: 12 }}>
                          {bank.upi_id}
                        </div>
                      </>
                    )}
                    <h4>BANK DETAILS</h4>
                    <dl className="kk-bank">
                      {bank?.account_name && (
                        <>
                          <dt>Name</dt>
                          <dd>{bank.account_name}</dd>
                        </>
                      )}
                      <dt>Account No</dt>
                      <dd>{bank?.account_no}</dd>
                      <dt>IFSC Code</dt>
                      <dd>{bank?.ifsc}</dd>
                      {isExport && bank?.swift && (
                        <>
                          <dt>SWIFT</dt>
                          <dd>{bank.swift}</dd>
                        </>
                      )}
                      <dt>Address</dt>
                      <dd>{bank?.branch_address}</dd>
                    </dl>
                    {supplier.pan && <div className="kk-pan">Pan Number : {supplier.pan}</div>}
                  </div>
                  <div className="kk-queries">
                    <div className="kk-label">For any queries</div>
                    <div className="kk-value">
                      {supplier.query_email}
                      <br />
                      {supplier.query_phone}
                    </div>
                    <div className="kk-sign">
                      <div className="kk-sign-for">For {supplier.legal_name || businessName}</div>
                      {supplier.signature_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="kk-sign-img" src={supplier.signature_url} alt="Signature" />
                      ) : (
                        <div className="kk-sign-space" />
                      )}
                      <div className="kk-sign-name">{supplier.signatory_name || "Authorised Signatory"}</div>
                      {supplier.signatory_name && <div className="kk-sign-role">Authorised Signatory</div>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <footer className="kk-footer">
            {businessName}
            {pages.length > 1 && (
              <span className="kk-page-no">
                {pageIndex + 1} / {pages.length}
              </span>
            )}
          </footer>
        </section>
      ))}
    </div>
  );
}
