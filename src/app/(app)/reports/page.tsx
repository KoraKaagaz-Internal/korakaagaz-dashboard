import Link from "next/link";
import { Bullet, Columns, Frame, Funnel, HBars, Heatmap, Kpi, Lines, Waterfall } from "@/components/charts/Charts";
import { SERIES, compactInr, inrFull } from "@/lib/format";
import { Card, btn } from "@/components/ui";
import {
  accrualRevenue,
  billedVsCollected,
  cashPosition,
  cashRevenue,
  categoryMonths,
  cei,
  clientValue,
  cohorts,
  comparison,
  concentration,
  byService,
  delta,
  dsoSeries,
  expenseCosts,
  forecast13w,
  months,
  monthlyPnl,
  newVsRepeat,
  onTime,
  period,
  pnl,
  projectTable,
  quoteFunnel,
  receivablesAt,
  trailingMonths,
  utilisation,
  waterfall,
  type Preset,
} from "@/lib/analytics";
import { loadAnalytics, serviceLines } from "@/lib/analytics-data";
import { upcoming } from "@/lib/compliance";
import { leadFunnel, pipeline } from "@/lib/crm";
import { getSettings, requireMember } from "@/lib/data";
import { GSTR1_SECTIONS } from "@/lib/gstr1";
import { addDays, daysBetween, formatInvoiceDate, todayIso } from "@/lib/money";
import { displayName } from "@/lib/pm";
import { teamDirectory } from "@/lib/pm-data";
import { weekStart } from "@/lib/time";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "fy", label: "This FY" },
  { key: "last_fy", label: "Last FY" },
  { key: "custom", label: "Custom" },
];
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireMember();
  const sp = await searchParams;
  const today = todayIso();
  const preset = (PRESETS.some((p) => p.key === sp.p) ? sp.p : "fy") as Preset;
  const cur = period(preset, today, { from: sp.from, to: sp.to });
  const cmpMode = sp.cmp === "year" ? "year" : "previous";
  const prev = comparison(cur, cmpMode);
  const basis = sp.basis === "cash" ? "cash" : "accrual";
  const client = sp.client || "";
  const trail = trailingMonths(cur.to < today ? cur.to : today, 12);
  const since = [trail[0].from, prev.from].sort()[0];
  const weeks = Array.from({ length: 8 }, (_, i) => addDays(weekStart(today), -7 * (7 - i)));

  const [data, services, settings, people] = await Promise.all([
    loadAnalytics({
      since: addDays(since, -400),
      until: cur.to > today ? cur.to : today,
      weeksFrom: weeks[0],
    }),
    serviceLines(cur.from, cur.to),
    getSettings(),
    teamDirectory(),
  ]);

  // client filter: their documents, payments, and costs on their projects
  const clientIds = new Set(data.docs.map((d) => d.client_id).filter(Boolean) as string[]);
  const clientNames = [...new Map(data.docs.filter((d) => d.client_id).map((d) => [d.client_id!, d.client_name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const docs = client && clientIds.has(client) ? data.docs.filter((d) => d.client_id === client) : data.docs;
  const docIds = new Set(docs.map((d) => d.id));
  const pays = data.pays.filter((p) => docIds.has(p.document_id));
  const clientProjects = new Set(docs.map((d) => d.project_id).filter(Boolean));
  const exps = client ? data.exps.filter((e) => e.project_id && clientProjects.has(e.project_id)) : data.exps;

  const rev = basis === "cash" ? cashRevenue(docs, pays) : accrualRevenue(docs);
  const accrual = accrualRevenue(docs);
  const costEvents = expenseCosts(exps);
  const p = pnl(rev, costEvents, cur.from, cur.to);
  const pp = pnl(rev, costEvents, prev.from, prev.to);
  const monthly = monthlyPnl(rev, costEvents, trail);
  const cat = categoryMonths(costEvents, months(cur.from, cur.to).length > 1 ? months(cur.from, cur.to) : trail);
  const conc = concentration(rev, cur.from, cur.to);
  const concPrev = concentration(rev, prev.from, prev.to);
  const nvr = newVsRepeat(accrual, trail);
  const coh = cohorts(accrual, 6);
  const value = clientValue(accrual, docs, cur.from, cur.to);
  const bvc = billedVsCollected(docs, pays, trail);
  const dso = dsoSeries(docs, pays, trail);
  const ar = receivablesAt(docs, pays, today);
  const ceiNow = cei(docs, pays, cur.from, cur.to < today ? cur.to : today, today);
  const receipts = data.pays.map((x) => {
    const d = data.docs.find((y) => y.id === x.document_id);
    return {
      date: x.paid_on,
      amount: (d && d.currency !== "INR" ? d.fx_rate : 1) * x.amount,
    };
  });
  const cash = cashPosition(data.opening.amount, data.opening.date, receipts, data.payouts, today);
  const forecast = forecast13w({
    today,
    cash: cash.cash,
    docs: data.docs,
    exps: data.exps,
  });
  const projects = projectTable(client ? data.projects.filter((x) => clientProjects.has(x.id)) : data.projects, accrual, costEvents, data.projectMinutes).slice(0, 12);
  const team = people.filter((x) => x.role !== "viewer");
  const util = utilisation(
    data.time,
    team.map((x) => ({
      email: x.email,
      capacity: data.capacity.get(x.email) ?? 40,
    })),
    weeks,
    data.leave,
    data.holidays,
  );
  const utilAll = (() => {
    const w = util.flatMap((u) => u.weeks);
    const cap = w.reduce((s, x) => s + x.capacity, 0);
    return cap ? Math.round((w.reduce((s, x) => s + x.logged, 0) / cap) * 100) : null;
  })();
  const hoursLogged = Math.round(util.reduce((s, u) => s + u.weeks.reduce((t, w) => t + w.logged, 0), 0));
  const ot = onTime(data.tasks, cur.from, cur.to);
  const funnel = quoteFunnel(docs, cur.from, cur.to);
  const leadsF = leadFunnel(data.leads, cur.from, cur.to);
  const leadsPrev = leadFunnel(data.leads, prev.from, prev.to);
  const pipe = pipeline(data.leads);
  const funnelPrev = quoteFunnel(docs, prev.from, prev.to);
  const svc = byService(services);
  const monthsInPeriod = months(cur.from, cur.to).length;
  const budgets = [...data.budgets.entries()].map(([label, b]) => ({
    label,
    actual: cat.totals.find((t) => t.category === label)?.amount ?? 0,
    target: b * monthsInPeriod,
  }));
  const tdsReceived = pays.filter((x) => x.paid_on >= cur.from && x.paid_on <= cur.to).reduce((s, x) => s + x.tds_amount, 0);
  const tdsDeducted = exps.filter((e) => e.expense_date >= cur.from && e.expense_date <= cur.to).reduce((s, e) => s + e.tds_amount, 0);
  const dues = upcoming(today, 45, {
    gstFiling: settings.gst_filing ?? "monthly",
    stateCode: settings.state_code,
    tds: data.exps.some((e) => e.tds_amount > 0),
  });
  const aged = [0, 1, 2, 3, 4].map((i) => ({
    label: ["Not due yet", "1–30 days late", "31–60 days", "61–90 days", "90+ days"][i],
    value: 0,
    count: 0,
  }));
  for (const d of docs) {
    if (d.doc_type !== "invoice" || d.status !== "issued" || !d.balance || d.balance <= 0.005) continue;
    const late = daysBetween(d.due_date ?? d.issue_date, today);
    const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    aged[i].value += d.currency === "INR" ? d.balance : d.balance * d.fx_rate;
    aged[i].count++;
  }
  const cmpLabel = cmpMode === "year" ? "last year" : "previous period";
  const spark = (k: "revenue" | "profit" | "agi") => monthly.map((m) => m[k]);
  const exportQs = `from=${cur.from}&to=${cur.to}`;
  const names = (e: string) => displayName(e, people);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-neutral-500">
            {cur.label} · compared with the {cmpLabel} · {basis === "cash" ? "cash basis (money received)" : "accrual basis (invoices issued)"} · amounts in ₹ before GST
          </p>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 rounded-xl bg-white p-3 text-sm border border-line">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Period
          <select name="p" defaultValue={preset} className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
            {PRESETS.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          From (custom)
          <input type="date" name="from" defaultValue={sp.from ?? cur.from} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          To (custom)
          <input type="date" name="to" defaultValue={sp.to ?? cur.to} className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm text-neutral-900" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Compare with
          <select name="cmp" defaultValue={cmpMode} className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
            <option value="previous">Previous period</option>
            <option value="year">Same period last year</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Basis
          <select name="basis" defaultValue={basis} className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
            <option value="accrual">Invoiced</option>
            <option value="cash">Received</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Client
          <select name="client" defaultValue={client} className="max-w-48 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900">
            <option value="">All clients</option>
            {clientNames.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <button className={btn.primary}>Apply</button>
      </form>

      {/* ------------------------------------------------------------- health strip */}
      <section aria-label="Health" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Revenue" value={compactInr(p.revenue)} delta={delta(p.revenue, pp.revenue)} spark={spark("revenue")} compareLabel={cmpLabel} />
        <Kpi
          label="Gross income (revenue − project costs)"
          value={compactInr(p.agi)}
          delta={delta(p.agi, pp.agi)}
          spark={spark("agi")}
          sub={p.revenue ? `${pct((p.agi / p.revenue) * 100)} of revenue` : undefined}
        />
        <Kpi
          label="Net profit"
          value={compactInr(p.net)}
          delta={delta(p.net, pp.net)}
          spark={spark("profit")}
          sub={p.netMargin !== null ? `${pct(p.netMargin)} margin` : undefined}
        />
        <Kpi
          label="Cash in hand"
          value={data.opening.set ? compactInr(cash.cash) : "Set balances"}
          sub={
            data.opening.set
              ? cash.runwayMonths !== null
                ? `${cash.runwayMonths.toFixed(1)} months of spending`
                : "no spending recorded"
              : "Settings → bank accounts → opening balance"
          }
        />
        <Kpi label="Owed by clients" value={compactInr(ar)} sub={`DSO ${dso[dso.length - 1]?.dso ?? "—"} days · aim ≤ 45`} />
        <Kpi label="Team hours used (8 weeks)" value={pct(utilAll)} sub="hours logged ÷ hours available" />
        <Kpi
          label="Biggest client share"
          value={conc[0] ? pct(conc[0].share) : "—"}
          delta={conc[0] && concPrev[0] ? delta(conc[0].share, concPrev[0].share) : undefined}
          upIsGood={false}
          sub={conc[0] ? `${conc[0].client} · keep under 25%` : undefined}
        />
        <Kpi
          label="Quote win rate"
          value={pct(funnel.winRate)}
          delta={funnel.winRate !== null && funnelPrev.winRate !== null ? delta(funnel.winRate, funnelPrev.winRate) : undefined}
          sub={`${funnel.stages[0].count} quoted`}
        />
      </section>

      {/* ------------------------------------------------------------- P&L */}
      <h2 className="pt-2 text-lg font-semibold">Profit &amp; loss</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <Frame
          title="Revenue, costs and profit by month"
          subtitle="Last 12 months"
          legend={[
            { label: "Revenue", color: SERIES[0] },
            {
              label: "Costs",
              color: SERIES[1],
            },
            { label: "Profit", color: SERIES[2] },
          ]}
          table={{
            columns: ["Month", "Revenue", "Costs", "Profit"],
            rows: monthly.map((m) => [m.label, inrFull(m.revenue), inrFull(m.costs), inrFull(m.profit)]),
          }}
        >
          <Columns
            data={monthly}
            series={[
              { key: "revenue", label: "Revenue", color: SERIES[0] },
              { key: "costs", label: "Costs", color: SERIES[1] },
              { key: "profit", label: "Profit", color: SERIES[2] },
            ]}
            negative
          />
        </Frame>
        <Frame
          title={`Where the money went · ${cur.label}`}
          subtitle="Revenue → project costs → gross income → overheads (incl. salaries) → profit"
          table={{
            columns: ["Step", "Amount"],
            rows: waterfall(p).map((s) => [s.label, inrFull(s.value)]),
          }}
        >
          <Waterfall steps={waterfall(p)} />
        </Frame>
        <Frame
          title="Margin by month"
          subtitle="Net margin = profit ÷ gross income"
          legend={[{ label: "Net margin", color: SERIES[0], line: true }]}
          table={{
            columns: ["Month", "Net margin"],
            rows: monthly.map((m) => [m.label, pct(m.margin)]),
          }}
        >
          <Lines
            data={monthly.map((m) => ({ label: m.label, margin: m.margin }))}
            series={[{ key: "margin", label: "Net margin", color: SERIES[0] }]}
            format="pct"
            target={{ value: 20, label: "20% healthy" }}
            min0={false}
          />
        </Frame>
        <Frame
          title="Spend by category"
          subtitle={`Overheads are ${pct(p.overheadRatio)} of gross income (aim under 25%)`}
          legend={cat.series.map((s, i) => ({
            label: s,
            color: SERIES[i % SERIES.length],
          }))}
          table={{
            columns: ["Category", "Spent"],
            rows: cat.totals.map((t) => [t.category, inrFull(t.amount)]),
          }}
        >
          <Columns
            data={cat.rows}
            series={cat.series.map((s, i) => ({
              key: s,
              label: s,
              color: SERIES[i % SERIES.length],
            }))}
            stacked
          />
        </Frame>
        {budgets.length > 0 && (
          <Frame
            title="Budget vs actual"
            subtitle={`${cur.label} · monthly budgets × ${monthsInPeriod} month${monthsInPeriod === 1 ? "" : "s"}`}
            table={{
              columns: ["Category", "Spent", "Budget"],
              rows: budgets.map((b) => [b.label, inrFull(b.actual), inrFull(b.target)]),
            }}
          >
            <Bullet rows={budgets} />
          </Frame>
        )}
      </div>

      {/* ------------------------------------------------------------- clients */}
      <h2 className="pt-2 text-lg font-semibold">Clients &amp; services</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active clients" value={String(value.clients)} />
        <Kpi label="Average invoice" value={compactInr(value.avgInvoice)} sub={`${value.invoices} invoices`} />
        <Kpi label="Average project value" value={compactInr(value.avgProject)} />
        <Kpi label="Client lifetime value" value={compactInr(value.lifetimeValue)} sub="average total billed per client" />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Frame
          title="Top clients"
          subtitle="Share of revenue; the line marks 20%, where one client starts to be a risk"
          table={{
            columns: ["Client", "Revenue", "Share", "Cumulative"],
            rows: conc.map((c) => [c.client, inrFull(c.value), `${c.share}%`, `${c.cumulative}%`]),
          }}
        >
          {conc.length ? (
            <HBars
              rows={conc.slice(0, 8).map((c) => ({
                label: c.client,
                value: c.share,
                extra: `${compactInr(c.value)} · top ${c.cumulative}%`,
              }))}
              format="pct"
              reference={{ value: 20, label: "20% of revenue" }}
              max={100}
            />
          ) : (
            <p className="text-sm text-neutral-500">No revenue in this period.</p>
          )}
        </Frame>
        <Frame
          title="Revenue by service"
          subtitle="Invoice lines, after discounts"
          table={{
            columns: ["Service", "Revenue"],
            rows: svc.map((s) => [s.service, inrFull(s.value)]),
          }}
        >
          {svc.length ? (
            <HBars rows={svc.map((s) => ({ label: s.service, value: s.value }))} color={SERIES[2]} />
          ) : (
            <p className="text-sm text-neutral-500">No invoices in this period.</p>
          )}
        </Frame>
        <Frame
          title="New vs returning clients"
          subtitle="Revenue by month"
          legend={[
            { label: "New", color: SERIES[3] },
            { label: "Returning", color: SERIES[0] },
          ]}
          table={{
            columns: ["Month", "New", "Returning"],
            rows: nvr.map((m) => [m.label, inrFull(m.New), inrFull(m.Repeat)]),
          }}
        >
          <Columns
            data={nvr}
            series={[
              { key: "Repeat", label: "Returning", color: SERIES[0] },
              { key: "New", label: "New", color: SERIES[3] },
            ]}
            stacked
          />
        </Frame>
        <Frame
          title="Do clients come back?"
          subtitle="Clients grouped by the quarter they were first billed: % billed again in each later quarter"
          table={{
            columns: ["First billed", "Clients", ...Array.from({ length: 6 }, (_, i) => `+${i + 1}Q`)],
            rows: coh.map((c) => [c.cohort, c.clients, ...c.later.map((v) => `${v}%`)]),
          }}
        >
          {coh.length ? (
            <Heatmap
              columns={["Clients", ...Array.from({ length: Math.max(0, ...coh.map((c) => c.later.length)) }, (_, i) => `+${i + 1} qtr`)]}
              rows={coh.map((c) => ({
                label: c.cohort,
                cells: [
                  { value: null, title: `${c.clients} clients` },
                  ...c.later.map((v) => ({
                    value: v,
                    title: `${v}% billed again`,
                  })),
                ],
              }))}
            />
          ) : (
            <p className="text-sm text-neutral-500">Needs a few quarters of invoices.</p>
          )}
        </Frame>
      </div>

      {/* ------------------------------------------------------------- cash */}
      <h2 className="pt-2 text-lg font-semibold">Cash &amp; collections</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Collection effectiveness" value={ceiNow === null ? "—" : `${ceiNow}`} sub="100 = everything due was collected" />
        <Kpi label="TDS deducted by clients" value={compactInr(tdsReceived)} sub="match with Form 26AS" />
        <Kpi label="TDS you deducted from vendors" value={compactInr(tdsDeducted)} sub="deposit by the 7th" />
        <Kpi label="Overdue" value={compactInr(aged.slice(1).reduce((s, a) => s + a.value, 0))} sub={`${aged.slice(1).reduce((s, a) => s + a.count, 0)} invoices`} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Frame
          title="Billed vs collected"
          subtitle="Incl. GST, last 12 months"
          legend={[
            { label: "Billed", color: SERIES[0] },
            { label: "Collected", color: SERIES[2] },
          ]}
          table={{
            columns: ["Month", "Billed", "Collected"],
            rows: bvc.map((m) => [m.label, inrFull(m.Billed), inrFull(m.Collected)]),
          }}
        >
          <Columns
            data={bvc}
            series={[
              { key: "Billed", label: "Billed", color: SERIES[0] },
              { key: "Collected", label: "Collected", color: SERIES[2] },
            ]}
          />
        </Frame>
        <Frame
          title="Days to get paid (DSO)"
          subtitle="Receivables ÷ last 90 days' billing × 90. MSMEs must be paid within 45 days."
          table={{
            columns: ["Month", "DSO", "Owed"],
            rows: dso.map((m) => [m.label, m.dso ?? "—", inrFull(m.ar)]),
          }}
        >
          <Lines
            data={dso.map((m) => ({ label: m.label, dso: m.dso }))}
            series={[{ key: "dso", label: "DSO", color: SERIES[0] }]}
            format="days"
            target={{ value: 45, label: "45 days" }}
          />
        </Frame>
        <Frame
          title="Cash forecast, next 13 weeks"
          subtitle={
            data.opening.set ? "Starts from cash in hand; invoices by due date, bills, recurring costs, TDS" : "Add opening bank balances in Settings for a true starting point"
          }
          legend={[
            { label: "Money in", color: SERIES[2] },
            { label: "Money out", color: SERIES[1] },
          ]}
          table={{
            columns: ["Week of", "In", "Out", "Balance"],
            rows: forecast.map((w) => [w.label, inrFull(w.in), inrFull(w.out), inrFull(w.balance)]),
          }}
          note={
            data.opening.set && forecast.some((w) => w.balance < 0) ? (
              <span className="font-medium text-red-700">▼ The balance goes below zero in week of {forecast.find((w) => w.balance < 0)!.label}.</span>
            ) : undefined
          }
        >
          <Columns
            data={forecast.map((w) => ({
              key: w.week,
              label: w.label,
              In: w.in,
              Out: w.out,
            }))}
            series={[
              { key: "In", label: "Money in", color: SERIES[2] },
              { key: "Out", label: "Money out", color: SERIES[1] },
            ]}
            height={150}
          />
          <div className="mt-3">
            <Lines
              data={forecast.map((w) => ({
                label: w.label,
                balance: w.balance,
              }))}
              series={[{ key: "balance", label: "Expected balance", color: SERIES[0] }]}
              height={110}
              min0={false}
            />
          </div>
        </Frame>
        <Frame
          title="Who owes what, by age"
          subtitle="Unpaid invoice balances today"
          table={{
            columns: ["Age", "Amount", "Invoices"],
            rows: aged.map((a) => [a.label, inrFull(a.value), a.count]),
          }}
        >
          <HBars
            rows={aged.map((a, i) => ({
              label: a.label,
              value: a.value,
              extra: `${a.count}`,
              color: i === 0 ? SERIES[0] : i < 3 ? SERIES[3] : SERIES[7],
            }))}
          />
          <div className="mt-4 border-t border-neutral-100 pt-3">
            <div className="mb-1 text-xs font-medium text-neutral-500">Filing due soon</div>
            <ul className="space-y-1 text-sm">
              {dues.slice(0, 5).map((d) => (
                <li key={`${d.date}${d.title}`} className="flex justify-between gap-2">
                  <span>{d.title}</span>
                  <span className={daysBetween(today, d.date) <= 7 ? "font-medium text-red-700" : "text-neutral-500"}>{formatInvoiceDate(d.date).replace(/, \d{4}$/, "")}</span>
                </li>
              ))}
            </ul>
          </div>
        </Frame>
      </div>

      {/* ------------------------------------------------------------- projects & team */}
      <h2 className="pt-2 text-lg font-semibold">Projects &amp; team</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Tasks done on time" value={pct(ot.pct)} sub={`${ot.done} finished · ${ot.late} late`} />
        <Kpi label="Hours logged (8 weeks)" value={String(hoursLogged)} sub="across the team" />
        <Kpi label="Over-budget projects" value={String(projects.filter((x) => x.overBudget).length)} sub="hours past the estimate" upIsGood={false} />
        <Kpi label="Quotes accepted" value={`${funnel.stages[1].count} of ${funnel.stages[0].count}`} sub={compactInr(funnel.stages[1].value)} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <Frame
            title="Project profitability"
            subtitle="All time: revenue − project expenses. Hours are compared with each project's budget hours."
            table={{
              columns: ["Project", "Revenue", "Expenses", "Profit", "Margin", "Hours"],
              rows: projects.map((x) => [
                `${x.code} ${x.name}`,
                inrFull(x.revenue),
                inrFull(x.expenses),
                inrFull(x.profit),
                pct(x.margin),
                x.budget_hours ? `${x.hours} of ${x.budget_hours}` : x.hours,
              ]),
            }}
          >
            {projects.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-xs text-neutral-500">
                    <tr>
                      <th className="py-1 font-medium">Project</th>
                      <th className="text-right font-medium">Revenue</th>
                      <th className="text-right font-medium">Expenses</th>
                      <th className="text-right font-medium">Profit</th>
                      <th className="w-40 pl-3 font-medium">Margin</th>
                      <th className="text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {projects.map((x) => (
                      <tr key={x.id}>
                        <td className="py-1.5">
                          <Link href={`/projects/${x.id}?tab=time`} className="hover:text-navy">
                            <span className="font-mono text-xs text-neutral-400">{x.code}</span> {x.name}
                          </Link>
                          {x.overBudget && <span className="ml-1.5 text-xs text-red-700">▲ over hours</span>}
                        </td>
                        <td className="text-right tabular-nums">{compactInr(x.revenue)}</td>
                        <td className="text-right tabular-nums">{compactInr(x.expenses)}</td>
                        <td className={`text-right tabular-nums ${x.profit < 0 ? "text-red-700" : ""}`}>{compactInr(x.profit)}</td>
                        <td className="pl-3">
                          {x.margin !== null && (
                            <span className="flex items-center gap-2">
                              <span className="h-2 flex-1 rounded-full bg-neutral-100">
                                <span
                                  className="block h-2 rounded-full"
                                  style={{
                                    width: `${Math.max(0, Math.min(100, x.margin))}%`,
                                    background: x.margin < 20 ? "var(--color-danger)" : SERIES[2],
                                  }}
                                />
                              </span>
                              <span className="w-10 text-right text-xs tabular-nums">{pct(x.margin)}</span>
                            </span>
                          )}
                        </td>
                        <td className="text-right tabular-nums">
                          {x.hours}
                          {x.budget_hours ? <span className="text-neutral-400"> / {x.budget_hours}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Tag invoices, expenses and time to projects to see this.</p>
            )}
          </Frame>
        </div>
        <Frame
          title="Team hours by week"
          subtitle="Hours logged ÷ hours available (after leave and holidays). ▲ = over capacity."
          table={{
            columns: ["Person", ...weeks.map((w) => formatInvoiceDate(w).replace(/, \d{4}$/, ""))],
            rows: util.map((u) => [names(u.email), ...u.weeks.map((w) => (w.pct === null ? "—" : `${w.pct}%`))]),
          }}
        >
          <Heatmap
            columns={weeks.map((w) =>
              new Date(`${w}T00:00:00Z`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }),
            )}
            rows={util.map((u) => ({
              label: names(u.email),
              cells: u.weeks.map((w) => ({
                value: w.pct,
                title: `${w.logged} h logged of ${w.capacity} h available`,
              })),
            }))}
          />
          <p className="mt-2 text-xs text-neutral-500">
            Looking ahead?{" "}
            <Link href="/team/workload" className="text-navy underline">
              Workload
            </Link>{" "}
            shows booked hours for the next 6 weeks.
          </p>
        </Frame>
        <Frame
          title="Quote funnel"
          subtitle={`Quotes issued in ${cur.label}`}
          table={{
            columns: ["Stage", "Count", "Value"],
            rows: funnel.stages.map((s) => [s.stage, s.count, inrFull(s.value)]),
          }}
        >
          <Funnel stages={funnel.stages} />
          <p className="mt-3 text-xs text-neutral-500">
            Win rate counts decided quotes only (accepted ÷ accepted + declined + expired). Leads will join this funnel when the CRM arrives.
          </p>
        </Frame>
      </div>

      {/* ------------------------------------------------------------- pipeline */}
      <h2 className="pt-2 text-lg font-semibold">Pipeline &amp; leads</h2>
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="New enquiries" value={String(leadsF.stages[0].count)} delta={delta(leadsF.stages[0].count, leadsPrev.stages[0].count)} />
        <Kpi label="Lead win rate" value={pct(leadsF.winRate)} sub="won ÷ (won + lost)" />
        <Kpi label="Open pipeline" value={compactInr(pipe.openValue)} sub={`likely ${compactInr(pipe.weighted)}`} />
        <Kpi label="Days to win" value={leadsF.avgDaysToWin === null ? "—" : `${leadsF.avgDaysToWin}`} sub="enquiry to won, average" upIsGood={false} />
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <Frame
          title="Lead funnel"
          subtitle={`Leads that came in during ${cur.label}, by how far they got`}
          table={{ columns: ["Stage", "Leads"], rows: leadsF.stages.map((s) => [s.stage, s.count]) }}
        >
          <Funnel stages={leadsF.stages} />
        </Frame>
        <Frame
          title="Where leads come from"
          subtitle="Leads and wins by source"
          table={{
            columns: ["Source", "Leads", "Won", "Win rate", "Won value"],
            rows: leadsF.sources.map((s) => [s.source, s.leads, s.won, s.winRate === null ? "—" : `${s.winRate}%`, inrFull(s.value)]),
          }}
        >
          {leadsF.sources.length ? (
            <HBars
              rows={leadsF.sources.map((s) => ({ label: s.source, value: s.leads, extra: `${s.won} won${s.winRate !== null ? ` · ${s.winRate}%` : ""}` }))}
              format="num"
              color={SERIES[2]}
            />
          ) : (
            <p className="text-sm text-neutral-500">No leads in this period.</p>
          )}
        </Frame>
        <Frame
          title="Open pipeline by stage"
          subtitle="Today, at full value"
          table={{ columns: ["Stage", "Leads", "Value"], rows: pipe.by.filter((b) => b.stage !== "won" && b.stage !== "lost").map((b) => [b.label, b.count, inrFull(b.value)]) }}
        >
          <HBars rows={pipe.by.filter((b) => b.stage !== "won" && b.stage !== "lost").map((b) => ({ label: b.label, value: b.value, extra: `${b.count}` }))} />
        </Frame>
      </div>

      {/* ------------------------------------------------------------- exports */}
      <h2 className="pt-2 text-lg font-semibold">GST &amp; exports</h2>
      <Card title={`GSTR-1 (sales) · ${cur.label}`}>
        <p className="mb-3 text-sm text-neutral-500">CSV in the GST offline tool&apos;s columns, for your CA. Check before filing.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(GSTR1_SECTIONS).map(([key, label]) => (
            <li key={key} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 px-3 py-2 text-sm">
              <span>{label}</span>
              <a className={btn.ghost} href={`/api/export/gstr1?section=${key}&${exportQs}`}>
                CSV
              </a>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Other exports">
        <div className="flex flex-wrap gap-2">
          <a className={btn.secondary} href={`/api/export/documents?${exportQs}`}>
            All documents
          </a>
          <a className={btn.secondary} href={`/api/export/payments?${exportQs}`}>
            Payments received
          </a>
          <a className={btn.secondary} href={`/api/export/tds?${exportQs}`}>
            TDS deducted by clients
          </a>
          <a className={btn.secondary} href={`/api/export/purchases?${exportQs}`}>
            Purchase register (ITC)
          </a>
          <a className={btn.secondary} href={`/api/export/tds-payable?${exportQs}`}>
            TDS you deducted
          </a>
          <Link className={btn.ghost} href="/expenses/gst">
            GST on purchases →
          </Link>
        </div>
      </Card>
    </div>
  );
}
