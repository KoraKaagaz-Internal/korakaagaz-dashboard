"use client";

import { useRouter } from "next/navigation";
import { deletePayment } from "@/app/actions/payments";
import { deleteProjectPayment, paymentFileUrl } from "@/app/actions/projects";
import { ConfirmButton, btn } from "@/components/ui";
import { toast } from "@/components/ui/Toaster";
import { navigate } from "@/lib/navigate";

/** Open the attached invoice; remove the payment (a correction: the audit log keeps what it was). */
export function PaymentActions({ id, projectId, invoiceId, fileName }: { id: string; projectId: string | null; invoiceId: string | null; fileName: string }) {
  const router = useRouter();
  return (
    <>
      {fileName && (
        <button
          className={btn.secondary}
          onClick={async () => {
            const tab = window.open("", "_blank"); // before the await, so pop-up blockers allow it
            const r = await paymentFileUrl(id);
            if (r.ok && tab) tab.location.href = r.url;
            else {
              tab?.close();
              toast.error(r.ok ? "Allow pop-ups to open the invoice" : r.message);
            }
          }}
        >
          📎 Invoice
        </button>
      )}
      <ConfirmButton
        confirm="Remove this payment? Use this to fix a mistake. The change stays in the activity log."
        confirmLabel="Remove payment"
        onConfirm={async () => {
          const r = invoiceId ? await deletePayment(id, invoiceId) : await deleteProjectPayment(id, projectId ?? "");
          if (!r.ok) return toast.error(r.message);
          toast.success("Payment removed");
          navigate(router, "/payments?tab=history");
        }}
      >
        Remove
      </ConfirmButton>
    </>
  );
}
