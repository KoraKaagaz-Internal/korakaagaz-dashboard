import Link from "next/link";
import { Badge, Section } from "@/components/ui";
import { listAgreements } from "@/lib/agreement-data";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/agreements";
import { formatShortDate } from "@/lib/money";

const TONE = { draft: "neutral", sent: "warn", signed: "ok", declined: "danger", expired: "neutral", void: "neutral" } as const;

/** Agreements for one client, project or lead, with a "New" link prefilled for it. */
export async function AgreementList({
  filter,
  newHref,
  canEdit,
  title = "Agreements",
}: {
  filter: { client?: string; project?: string; lead?: string };
  newHref: string;
  canEdit: boolean;
  title?: string;
}) {
  const rows = await listAgreements(filter);
  return (
    <Section
      title={rows.length ? `${title} · ${rows.length}` : title}
      actions={
        canEdit ? (
          <Link href={newHref} className="text-sm text-navy hover:underline">
            New agreement
          </Link>
        ) : undefined
      }
    >
      {rows.length ? (
        <ul className="divide-y divide-line text-sm">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/agreements/${a.id}`} className="flex items-center gap-3 py-2 hover:text-navy">
                <span className="w-20 shrink-0 font-mono text-xs text-neutral-500">{a.number}</span>
                <span className="min-w-0 flex-1 truncate">
                  {a.title} <span className="text-neutral-500">· {KIND_LABEL[a.kind]}</span>
                </span>
                <span className="hidden text-xs text-neutral-500 sm:inline">{formatShortDate((a.completed_at ?? a.sent_at ?? a.created_at).slice(0, 10))}</span>
                <Badge tone={TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500">No proposals or contracts yet.</p>
      )}
    </Section>
  );
}
