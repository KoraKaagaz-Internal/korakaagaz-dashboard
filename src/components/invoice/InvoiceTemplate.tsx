import "@/styles/invoice.css";
import { computeTotals, formatAmount, formatInvoiceDate, formatQty, lineAmount } from "@/lib/money";
import { paginate, payBlockHeight } from "@/lib/paginate";
import type { InvoiceDraft, PaymentSnapshot } from "@/lib/types";

export interface InvoiceTemplateProps {
  invoice: InvoiceDraft;
  payment: PaymentSnapshot;
  /** Optional logo image; falls back to the typeset wordmark. */
  logoSrc?: string;
}

const GST_LABEL = { cgst_sgst: "CGST + SGST", igst: "IGST", none: "" } as const;

export function InvoiceTemplate({ invoice, payment, logoSrc }: InvoiceTemplateProps) {
  const totals = computeTotals(invoice);
  const currency = invoice.currency || "INR";
  const money = (n: number) => formatAmount(n, currency);

  const totalsRows: { label: string; value: string }[] = [{ label: "Subtotal", value: money(totals.subtotal) }];
  if (totals.discount > 0) {
    const pct = invoice.discount_type === "percent" ? ` (${formatQty(invoice.discount_value)}%)` : "";
    totalsRows.push({ label: `Discount${pct}`, value: `− ${money(totals.discount)}` });
  }
  if (invoice.gst_mode === "cgst_sgst") {
    const half = formatQty(invoice.gst_rate / 2);
    totalsRows.push({ label: `CGST @ ${half}%`, value: money(totals.cgst) });
    totalsRows.push({ label: `SGST @ ${half}%`, value: money(totals.sgst) });
  } else if (invoice.gst_mode === "igst") {
    totalsRows.push({ label: `IGST @ ${formatQty(invoice.gst_rate)}%`, value: money(totals.igst) });
  }

  const items = invoice.items.length ? invoice.items : [{ title: "", description: "", qty: 0, unit_price: 0 }];
  const pages = paginate(items, totalsRows.length - 1);
  const businessName = payment.business_name || "Kora Kaagaz";
  const client = invoice.client;
  const clientExtra = [client.address, client.gstin ? `GSTIN: ${client.gstin}` : ""].filter(Boolean).join("\n");

  return (
    <div className="kk-invoice" data-gst-label={GST_LABEL[invoice.gst_mode]}>
      {pages.map((page, pageIndex) => (
        <section key={pageIndex} className={`kk-page${page.isFirst ? "" : " is-continued"}`}>
          {page.isFirst && (
            <>
              <h1 className="kk-logo" aria-label={businessName}>
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt={businessName} />
                ) : (
                  businessName.split(/\s+/).map((word, i) => <div key={i}>{word}</div>)
                )}
              </h1>

              <h2 className="kk-title">Invoice</h2>

              <div className="kk-billed">
                <div className="kk-label">Billed to</div>
                <div className={`kk-client-name${client.name.length > 16 ? " is-long" : ""}`}>{client.name || "—"}</div>
                {clientExtra && <div className="kk-client-extra">{clientExtra}</div>}
              </div>

              <div className="kk-meta-divider" />

              <div className="kk-meta c1">
                <div className="kk-label">Date</div>
                <div className="kk-value">{formatInvoiceDate(invoice.issue_date)}</div>
                {invoice.due_date && <div className="kk-sub">Due {formatInvoiceDate(invoice.due_date)}</div>}
              </div>
              <div className="kk-meta c2">
                <div className="kk-label">Currency</div>
                <div className="kk-value">{currency}</div>
              </div>
              <div className="kk-meta c1 r2">
                <div className="kk-label">Payment terms</div>
                <div className="kk-value">{invoice.payment_terms}</div>
              </div>
              <div className="kk-meta c2 r2">
                <div className="kk-label">Invoice no.</div>
                <div className="kk-value">{invoice.number}</div>
              </div>

              <div className="kk-photo" aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="kk-photo-top" src="/brand/fabric-blue.png" alt="" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="kk-photo-bottom" src="/brand/fabric-white.png" alt="" />
                <div className="kk-brackets">
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </>
          )}

          <div className="kk-body">
            <div className="kk-thead">
              <span />
              <span>Description</span>
              <span>Qty</span>
              <span className="kk-num">Unit price</span>
              <span className="kk-num">Amount</span>
            </div>

            <div className="kk-items">
              {page.items.map(({ item, index }) => (
                <div className="kk-row" key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <div className="kk-item-title">{item.title}</div>
                    {item.description && <div className="kk-item-desc">{item.description}</div>}
                  </div>
                  <span>{formatQty(item.qty)}</span>
                  <span className="kk-num">{money(item.unit_price)}</span>
                  <span className="kk-num">{money(lineAmount(item))}</span>
                </div>
              ))}
              {!page.isLast && <div className="kk-continued-note">Continued on next page</div>}
              {page.isLast && invoice.notes && <div className="kk-notes">{invoice.notes}</div>}
            </div>

            {page.isLast && (
              <>
                <div className="kk-totals">
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

                <div className="kk-pay" style={{ height: payBlockHeight(totalsRows.length - 1) }}>
                  <div>
                    <div className="kk-label">Payment details</div>
                    {payment.upi_id && (
                      <>
                        <h4>UPI ID</h4>
                        <div className="kk-value" style={{ fontSize: 12 }}>
                          {payment.upi_id}
                        </div>
                      </>
                    )}
                    <h4>BANK DETAILS</h4>
                    <dl className="kk-bank">
                      <dt>Account No</dt>
                      <dd>{payment.bank_account_no}</dd>
                      <dt>IFSC Code</dt>
                      <dd>{payment.bank_ifsc}</dd>
                      <dt>Address</dt>
                      <dd>{payment.bank_address}</dd>
                    </dl>
                    {payment.pan && <div className="kk-pan">Pan Number : {payment.pan}</div>}
                    {payment.gstin && (
                      <div className="kk-pan" style={{ marginTop: 4 }}>
                        GSTIN : {payment.gstin}
                      </div>
                    )}
                  </div>
                  <div className="kk-queries">
                    <div className="kk-label">For any queries</div>
                    <div className="kk-value">
                      {payment.query_email}
                      <br />
                      {payment.query_phone}
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
