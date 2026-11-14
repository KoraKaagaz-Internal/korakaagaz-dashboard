import Link from "next/link";
import { AvatarStack } from "@/components/pm/Avatar";
import { HealthPill, ProgressBar } from "@/components/pm/Pills";
import { requireTeam } from "@/lib/data";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { PROJECT_STATUS_LABEL, progress, projectHealth } from "@/lib/pm";
import { listProjectCards, teamDirectory } from "@/lib/pm-data";
import { projectFee } from "@/lib/projects";
import { inr } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, EmptyState, Input, PageHeader, Segmented, button } from "@/components/ui";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string; pay?: string }> }) {
  const { canEdit, email, isStaff, isAdmin } = await requireTeam();
  const { show = "open", q = "", pay } = await searchParams;
  // "+ New → Payment received / Team payout" lands here to pick the project
  const picking = isAdmin && pay === "1";
  const [cards, people, { data: pays }] = await Promise.all([
    listProjectCards(),
    teamDirectory(),
    isAdmin
      ? (await createClient()).from("payments").select("project_id, amount, tds_amount, documents(currency, fx_rate)").not("project_id", "is", null)
      : Promise.resolve({ data: [] }),
  ]);
  const received = new Map<string, number>();
  for (const x of (pays ?? []) as unknown as { project_id: string; amount: number; tds_amount: number; documents: { currency: string; fx_rate: number } | null }[]) {
    const v = inr(x.documents ?? { currency: "INR", fx_rate: 1 }, Number(x.amount) + Number(x.tds_amount));
    received.set(x.project_id, (received.get(x.project_id) ?? 0) + v);
  }
  const today = todayIso();
  const term = q.trim().toLowerCase();
  const shown = cards.filter((p) => {
    const closed = p.status === "done" || p.status === "cancelled";
    if (show === "open" && closed) return false;
    if (show === "done" && !closed) return false;
    if (show === "mine" && (closed || !(p.owner_email === email || p.members.includes(email)))) return false;
    return !term || `${p.code} ${p.name} ${p.client_name} ${p.type}`.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        subtitle={picking ? "Pick the project to record a payment or pay the team." : isStaff ? "Every job the studio is running." : "Projects you've been added to."}
        actions={
          <>
            {canEdit && (
              <Link href="/projects/new" className={button("primary", "sm")}>
                New project
              </Link>
            )}
          </>
        }
      />

      <form className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Show"
          items={FILTERS.map((f) => ({ href: `/projects?show=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}${picking ? "&pay=1" : ""}`, label: f.label, active: show === f.key }))}
        />
        <input type="hidden" name="show" value={show} />
        {picking && <input type="hidden" name="pay" value="1" />}
        <Input name="q" type="search" defaultValue={q} aria-label="Search projects" placeholder="Search projects" className="!h-8 !w-56 !py-1" />
      </form>

      {shown.length === 0 ? (
        <EmptyState
          title={cards.length ? "No projects match" : "No projects yet"}
          filtered={!!cards.length}
          hint={cards.length ? undefined : "Start one from a template: phases, tasks and deliverables are set up for you."}
          action={
            canEdit && !cards.length ? (
              <ButtonLink href="/projects/new" variant="primary" size="sm">
                New project
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const prog = progress(p.tasks);
            const health = projectHealth(p, p.tasks, today);
            const open = p.tasks.filter((t) => t.status !== "done" && !t.parent_id).length;
            const fee = projectFee(p.finance, p, today);
            const pending = Math.max(0, fee - (received.get(p.id) ?? 0));
            return (
              <li key={p.id}>
                <Link href={picking ? `/projects/${p.id}?tab=money` : `/projects/${p.id}`} prefetch={false} className="block h-full rounded-xl bg-white p-4 border border-line transition hover:ring-navy/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-neutral-400">{p.code}</div>
                      <div className="truncate font-semibold text-neutral-900">{p.name}</div>
                      <div className="truncate text-sm text-neutral-500">{p.client_name || "Internal"}</div>
                    </div>
                    <HealthPill health={health} />
                  </div>
                  <div className="mt-3">
                    <ProgressBar pct={prog.pct} label={`${prog.done} of ${prog.total} tasks done`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                    <span>
                      {PROJECT_STATUS_LABEL[p.status]} · {open} open task{open === 1 ? "" : "s"}
                      {p.due_date ? ` · due ${formatInvoiceDate(p.due_date)}` : ""}
                    </span>
                    <AvatarStack emails={p.members} people={people} />
                  </div>
                  {isAdmin && fee > 0 && (
                    <div className="mt-1 text-xs text-neutral-500">
                      Fee {formatMoney(fee)} · {pending > 0.5 ? <span className="text-warn">{formatMoney(pending)} pending</span> : <span className="text-ok">fully received</span>}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
