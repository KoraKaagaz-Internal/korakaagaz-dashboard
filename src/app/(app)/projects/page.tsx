import Link from "next/link";
import { AvatarStack } from "@/components/pm/Avatar";
import { HealthPill, ProgressBar } from "@/components/pm/Pills";
import { requireTeam } from "@/lib/data";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { PROJECT_STATUS_LABEL, progress, projectHealth } from "@/lib/pm";
import { listProjectCards, teamDirectory } from "@/lib/pm-data";
import { ButtonLink, EmptyState, Input, PageHeader, Segmented, button } from "@/components/ui";

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "done", label: "Done" },
  { key: "all", label: "All" },
] as const;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const { canEdit, email, isStaff } = await requireTeam();
  const { show = "open", q = "" } = await searchParams;
  const [cards, people] = await Promise.all([listProjectCards(), teamDirectory()]);
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
        subtitle={isStaff ? "Every job the studio is running." : "Projects you've been added to."}
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
          items={FILTERS.map((f) => ({ href: `/projects?show=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`, label: f.label, active: show === f.key }))}
        />
        <input type="hidden" name="show" value={show} />
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
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block h-full rounded-xl bg-white p-4 border border-line transition hover:ring-navy/30">
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
                  {p.finance && p.finance.budget > 0 && <div className="mt-1 text-xs text-neutral-400">Budget {formatMoney(p.finance.budget)}</div>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
