"use client";

import { useRouter } from "next/navigation";
import { duplicateAgreement, finishSealing, quoteFromProposal, remindSigner, signerLink, voidAgreement } from "@/app/actions/agreements";
import { Button, ButtonLink, ConfirmButton } from "@/components/ui";
import { toast, useAction } from "@/components/ui/Toaster";
import type { AgreementKind, AgreementStatus } from "@/lib/agreements";
import { navigate } from "@/lib/navigate";

export function SentActions({
  id,
  status,
  hasPdf,
  allSigned,
  canQuote,
}: {
  id: string;
  status: AgreementStatus;
  kind: AgreementKind;
  hasPdf: boolean;
  allSigned: boolean;
  canQuote: boolean;
}) {
  const router = useRouter();
  const [voidIt] = useAction(voidAgreement, { success: "Voided" });
  const [seal, sealing] = useAction(finishSealing, { success: "Signed PDF ready and sent" });
  const [dup, duping] = useAction(duplicateAgreement, { refresh: false });
  const [quote, quoting] = useAction(quoteFromProposal, { refresh: false });
  return (
    <div className="flex flex-wrap gap-2">
      {hasPdf && (
        <ButtonLink href={`/api/agreements/${id}/pdf`} prefetch={false} variant="primary" size="sm">
          Download signed PDF
        </ButtonLink>
      )}
      {canQuote && (
        <Button
          size="sm"
          disabled={quoting}
          onClick={async () => {
            const r = await quote(id);
            if (r && r.ok) navigate(router, `/documents/${r.id}/edit`);
          }}
        >
          {quoting ? "Drafting…" : "Create quote from proposal"}
        </Button>
      )}
      {allSigned && !hasPdf && status !== "void" && (
        <Button size="sm" variant="primary" disabled={sealing} onClick={() => seal(id)}>
          {sealing ? "Sealing…" : "Finish the signed PDF"}
        </Button>
      )}
      <Button
        size="sm"
        disabled={duping}
        onClick={async () => {
          const r = await dup(id);
          if (r && r.ok) navigate(router, `/agreements/${r.id}`);
        }}
      >
        Duplicate as draft
      </Button>
      {(status === "sent" || status === "signed") && (
        <ConfirmButton
          size="sm"
          confirm="Void this agreement? Signers can no longer sign it, and it's marked void everywhere. The history is kept."
          confirmLabel="Void"
          onConfirm={() => voidIt(id, "")}
        >
          Void
        </ConfirmButton>
      )}
    </div>
  );
}

export function SignerActions({ signerId }: { signerId: string }) {
  const [remind, reminding] = useAction(remindSigner, { success: "Reminder sent" });
  return (
    <div className="mt-1 flex gap-1">
      <Button
        size="sm"
        variant="ghost"
        className="!h-7 !px-2 text-xs"
        onClick={async () => {
          const r = await signerLink(signerId);
          if (!r.ok) return void toast.error(r.message);
          await navigator.clipboard.writeText(r.url).catch(() => {});
          toast.success("Signing link copied. Share it only with this person.");
        }}
      >
        Copy link
      </Button>
      <Button size="sm" variant="ghost" className="!h-7 !px-2 text-xs" disabled={reminding} onClick={() => remind(signerId)}>
        {reminding ? "Sending…" : "Send reminder"}
      </Button>
    </div>
  );
}
