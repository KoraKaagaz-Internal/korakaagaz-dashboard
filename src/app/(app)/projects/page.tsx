import Link from "next/link";
import { AvatarStack } from "@/components/pm/Avatar";
import { HealthPill, ProgressBar } from "@/components/pm/Pills";
import { requireTeam } from "@/lib/data";
import { formatInvoiceDate, formatMoney, todayIso } from "@/lib/money";
import { PROJECT_STATUS_LABEL, progress, projectHealth } from "@/lib/pm";
import { listProjectCards, teamDirectory } from "@/lib/pm-data";

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-neutral-500">{isStaff ? "Every job the studio is running." : "Projects you've been added to."}</p>
        </div>
        {canEdit && (
          <Link href="/projects/new" className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white">
            New project
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-black/10" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/projects?show=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              aria-current={show === f.key ? "true" : undefined}
              className={`rounded-md px-3 py-1 text-sm ${show === f.key ? "bg-navy text-white" : "text-neutral-700 hover:bg-neutral-100"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <input type="hidden" name="show" value={show} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search projects  /"
          className="w-56 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy"
        />
      </form>

      {shown.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
          <p className="text-neutral-600">{cards.length ? "No projects match." : "No projects yet."}</p>
          {canEdit && !cards.length && (
            <Link href="/projects/new" className="mt-3 inline-block rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white">
              Start one from a template
            </Link>
          )}
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => {
            const prog = progress(p.tasks);
            const health = projectHealth(p, p.tasks, today);
            const open = p.tasks.filter((t) => t.status !== "done" && !t.parent_id).length;
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="block h-full rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 transition hover:ring-navy/30">
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
