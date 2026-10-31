"use client";

// Small SVG chart kit for Reports (no chart library). Rules from the dataviz guide: thin marks
// (≤24px columns, 2px lines), 4px rounded data ends on a single baseline, hairline solid grid,
// 2px surface gaps between touching fills, text in ink colours (never the series colour), a legend
// for 2+ series, a tooltip on hover/focus, and a "View as table" fallback on every chart.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SERIES, compactInr, fmt, inrFull, type Fmt } from "@/lib/format";

const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";
const MUTED = "#898781";
const SEQ = ["#e6effc", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

const useIso = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useIso(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const PAD = 10; // room above the plot for the top tick label

function Empty({ ref, height }: { ref: React.Ref<HTMLDivElement>; height: number }) {
  return (
    <div ref={ref} className="flex items-center justify-center rounded-lg bg-neutral-50 text-sm text-neutral-500" style={{ height: Math.min(height, 120) }}>
      Nothing to show for this period yet.
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

// ---------------------------------------------------------------------------
// Frame: title, legend, table toggle
// ---------------------------------------------------------------------------
export interface LegendItem {
  label: string;
  color: string;
  ghost?: boolean;
  line?: boolean;
}

export function Frame({
  title,
  subtitle,
  legend,
  table,
  children,
  note,
}: {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  note?: ReactNode;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className="m-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          {subtitle && <div className="text-xs text-neutral-500">{subtitle}</div>}
        </div>
        {table && (
          <button type="button" onClick={() => setAsTable(!asTable)} className="rounded-md px-2 py-0.5 text-xs text-neutral-600 hover:bg-neutral-100" aria-pressed={asTable}>
            {asTable ? "View as chart" : "View as table"}
          </button>
        )}
      </figcaption>
      {legend && legend.length > 1 && !asTable && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600" aria-label="Legend">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              {l.line ? (
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: l.color }} />
              ) : (
                <span className="inline-block size-2.5 rounded-sm" style={l.ghost ? { boxShadow: `inset 0 0 0 1.5px ${l.color}` } : { background: l.color }} />
              )}
              {l.label}
            </li>
          ))}
        </ul>
      )}
      {asTable && table ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white text-left text-neutral-500">
              <tr>
                {table.columns.map((c, i) => (
                  <th key={c} className={`py-1 pr-3 font-medium ${i ? "text-right" : ""}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`py-1 pr-3 ${j ? "text-right tabular-nums" : ""}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {note && <div className="mt-2 text-xs text-neutral-500">{note}</div>}
    </figure>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x - 80), width - 168);
  return (
    <div
      className="pointer-events-none absolute z-10 w-40 rounded-md bg-neutral-900 px-2 py-1.5 text-xs text-white shadow-lg"
      style={{ left, top: Math.max(0, y - 8), transform: "translateY(-100%)" }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Columns (grouped or stacked), optional ghost comparison series
// ---------------------------------------------------------------------------
export interface Series {
  key: string;
  label: string;
  color: string;
}

export function Columns({
  data,
  series,
  stacked,
  ghost,
  height = 200,
  format: kind = "inr",
  negative,
}: {
  data: Record<string, string | number | null>[];
  series: Series[];
  stacked?: boolean;
  ghost?: { key: string; label: string };
  height?: number;
  format?: Fmt;
  negative?: boolean;
}) {
  const format = (n: number) => fmt(kind, n);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 48;
  const bottom = 22;
  const plotW = width - left - 4;
  const val = (d: Record<string, unknown>, k: string) => Number(d[k] ?? 0) || 0;
  const tops = data.map((d) =>
    stacked ? series.reduce((s, x) => s + Math.max(0, val(d, x.key)), 0) : Math.max(0, ...series.map((x) => val(d, x.key)), ghost ? val(d, ghost.key) : 0),
  );
  const lows = negative ? data.map((d) => Math.min(0, ...series.map((x) => val(d, x.key)))) : [0];
  const max = niceMax(Math.max(...tops, 0));
  const min = negative ? -niceMax(-Math.min(...lows, 0)) : 0;
  const span = max - min || 1;
  const y = (v: number) => ((max - v) / span) * height;
  const band = plotW / Math.max(1, data.length);
  const groups = stacked ? 1 : series.length;
  const bar = Math.min(24, Math.max(4, (band * 0.7 - (groups - 1) * 2) / groups));
  const ticks = [max, max / 2, 0, ...(min < 0 ? [min] : [])];
  const empty = tops.every((t) => !t) && lows.every((l) => !l);

  if (empty) return <Empty ref={ref} height={height} />;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height + bottom + PAD} role="img" aria-label="Column chart" className="overflow-visible">
        <g transform={`translate(0 ${PAD})`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED} className="tabular-nums">
                {t === 0 ? "0" : format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = left + band * i + band / 2;
            const x0 = cx - (stacked ? bar / 2 : (groups * bar + (groups - 1) * 2) / 2);
            let acc = 0;
            return (
              <g
                key={String(d.key ?? i)}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                aria-label={`${d.label}: ${series.map((s) => `${s.label} ${format(val(d, s.key))}`).join(", ")}`}
              >
                <rect x={left + band * i} y={0} width={band} height={height} fill={hover === i ? "rgba(11,11,11,0.035)" : "transparent"} />
                {ghost && (
                  <rect
                    x={x0 - 3}
                    y={y(Math.max(0, val(d, ghost.key)))}
                    width={(stacked ? bar : groups * bar + (groups - 1) * 2) + 6}
                    height={Math.max(0, y(0) - y(Math.max(0, val(d, ghost.key))))}
                    fill="none"
                    stroke={MUTED}
                    strokeWidth={1}
                    rx={3}
                  />
                )}
                {series.map((s, j) => {
                  const v = val(d, s.key);
                  if (!v) return null;
                  if (stacked) {
                    const yTop = y(acc + v);
                    const h = y(acc) - yTop;
                    acc += v;
                    const isTop = j === series.length - 1 || series.slice(j + 1).every((n) => !val(d, n.key));
                    return <rect key={s.key} x={x0} y={yTop} width={bar} height={Math.max(0, h - 2)} fill={s.color} rx={isTop ? 4 : 0} />;
                  }
                  const x = x0 + j * (bar + 2);
                  const yTop = v >= 0 ? y(v) : y(0);
                  const h = Math.abs(y(v) - y(0));
                  return <path key={s.key} d={roundedBar(x, yTop, bar, Math.max(1, h), v >= 0)} fill={s.color} />;
                })}
                {(data.length <= 14 || i % Math.ceil(data.length / 12) === 0) && (
                  <text x={cx} y={height + 15} textAnchor="middle" fontSize={10} fill={MUTED}>
                    {String(d.label)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      {hover !== null && (
        <Tooltip x={left + band * hover + band / 2} y={y(tops[hover]) + PAD} width={width}>
          <div className="font-medium">{String(data[hover].label)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex justify-between gap-2">
              <span className="flex items-center gap-1">
                <span className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tabular-nums">{format(val(data[hover], s.key))}</span>
            </div>
          ))}
          {ghost && (
            <div className="flex justify-between gap-2 text-neutral-300">
              <span>{ghost.label}</span>
              <span className="tabular-nums">{format(val(data[hover], ghost.key))}</span>
            </div>
          )}
        </Tooltip>
      )}
    </div>
  );
}

function roundedBar(x: number, y: number, w: number, h: number, up: boolean) {
  const r = Math.min(4, w / 2, h);
  return up
    ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
    : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
}

// ---------------------------------------------------------------------------
// Lines (with an optional target/reference line), crosshair tooltip
// ---------------------------------------------------------------------------
export function Lines({
  data,
  series,
  height = 180,
  format: kind = "inr",
  target,
  min0 = true,
}: {
  data: Record<string, string | number | null>[];
  series: (Series & { dashed?: boolean })[];
  height?: number;
  format?: Fmt;
  target?: { value: number; label: string };
  min0?: boolean;
}) {
  const format = (n: number) => fmt(kind, n);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 48;
  const bottom = 22;
  const vals = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === "number");
  const max = niceMax(Math.max(...vals, target?.value ?? 0, 0));
  const lo = min0 ? 0 : Math.min(0, ...vals);
  const min = lo < 0 ? -niceMax(-lo) : 0;
  const y = (v: number) => ((max - v) / (max - min || 1)) * height;
  const step = (width - left - 12) / Math.max(1, data.length - 1);
  const x = (i: number) => left + 6 + i * step;
  if (!vals.some((v) => v !== 0)) return <Empty ref={ref} height={height} />;
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg
        width={width}
        height={height + bottom + PAD}
        role="img"
        aria-label="Line chart"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.round((e.clientX - r.left - left - 6) / step);
          setHover(i >= 0 && i < data.length ? i : null);
        }}
      >
        <g transform={`translate(0 ${PAD})`}>
          {[max, max / 2, 0, ...(min < 0 ? [min] : [])].map((t) => (
            <g key={t}>
              <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
              <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>
                {t === 0 ? "0" : format(t)}
              </text>
            </g>
          ))}
          {target && (
            <g>
              <line x1={left} x2={width} y1={y(target.value)} y2={y(target.value)} stroke="#52514e" strokeWidth={1} />
              <text x={width - 2} y={y(target.value) - 4} textAnchor="end" fontSize={10} fill="#52514e">
                {target.label}
              </text>
            </g>
          )}
          {series.map((s) => {
            let d = "";
            let pen = false;
            data.forEach((row, i) => {
              const v = row[s.key];
              if (typeof v !== "number") {
                pen = false;
                return;
              }
              d += `${pen ? "L" : "M"}${x(i)},${y(v)}`;
              pen = true;
            });
            return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={s.dashed ? 0.45 : 1} />;
          })}
          {series.map((s) => {
            let lastI = -1;
            data.forEach((r, i) => typeof r[s.key] === "number" && (lastI = i));
            if (lastI < 0 || s.dashed) return null;
            return <circle key={s.key} cx={x(lastI)} cy={y(data[lastI][s.key] as number)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />;
          })}
          {data.map((d, i) =>
            data.length <= 14 || i % Math.ceil(data.length / 12) === 0 ? (
              <text key={i} x={x(i)} y={height + 15} textAnchor="middle" fontSize={10} fill={MUTED}>
                {String(d.label)}
              </text>
            ) : null,
          )}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke={AXIS} />}
          {hover !== null &&
            series.map((s) =>
              typeof data[hover][s.key] === "number" ? (
                <circle key={s.key} cx={x(hover)} cy={y(data[hover][s.key] as number)} r={4} fill={s.color} stroke="#fff" strokeWidth={2} />
              ) : null,
            )}
        </g>
      </svg>
      {hover !== null && (
        <Tooltip x={x(hover)} y={20} width={width}>
          <div className="font-medium">{String(data[hover].label)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex justify-between gap-2">
              <span className="flex items-center gap-1">
                <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tabular-nums">{typeof data[hover][s.key] === "number" ? format(data[hover][s.key] as number) : "—"}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Waterfall (P&L)
// ---------------------------------------------------------------------------
export function Waterfall({ steps, height = 220 }: { steps: { label: string; value: number; kind: "total" | "down" | "up" }[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 48;
  const bottom = 34;
  let run = 0;
  const bars = steps.map((s) => {
    if (s.kind === "total") {
      run = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = run;
    run += s.value;
    return { ...s, from, to: run };
  });
  const max = niceMax(Math.max(...bars.flatMap((b) => [b.from, b.to]), 0));
  const minV = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]));
  const min = minV < 0 ? -niceMax(-minV) : 0;
  const y = (v: number) => ((max - v) / (max - min || 1)) * height;
  const band = (width - left - 4) / steps.length;
  const w = Math.min(48, band * 0.6);
  return (
    <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height + bottom} role="img" aria-label="Profit and loss waterfall">
        {[max, max / 2, 0, ...(min < 0 ? [min] : [])].map((t) => (
          <g key={t}>
            <line x1={left} x2={width} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
            <text x={left - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={MUTED}>
              {t === 0 ? "0" : compactInr(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const cx = left + band * i + band / 2;
          const top = y(Math.max(b.from, b.to));
          const h = Math.max(1, Math.abs(y(b.from) - y(b.to)));
          const color = b.kind === "total" ? (b.value < 0 ? SERIES[7] : SERIES[0]) : SERIES[1];
          return (
            <g key={b.label} onMouseEnter={() => setHover(i)} tabIndex={0} onFocus={() => setHover(i)} aria-label={`${b.label}: ${inrFull(b.value)}`}>
              <rect x={left + band * i} y={0} width={band} height={height} fill={hover === i ? "rgba(11,11,11,0.035)" : "transparent"} />
              <rect x={cx - w / 2} y={top} width={w} height={h} fill={color} rx={3} />
              {i < bars.length - 1 && <line x1={cx + w / 2} x2={cx + band - w / 2} y1={y(b.to)} y2={y(b.to)} stroke={AXIS} />}
              <text x={cx} y={top - 5} textAnchor="middle" fontSize={10} fill="#0b0b0b" className="tabular-nums">
                {b.kind === "down" ? `−${compactInr(-b.value)}` : compactInr(b.value)}
              </text>
              <text x={cx} y={height + 14} textAnchor="middle" fontSize={10} fill="#52514e">
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={left + band * hover + band / 2} y={y(Math.max(bars[hover].from, bars[hover].to))} width={width}>
          <div className="font-medium">{bars[hover].label}</div>
          <div className="tabular-nums">{inrFull(bars[hover].value)}</div>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bars (ranked lists, Pareto share with a reference band)
// ---------------------------------------------------------------------------
export function HBars({
  rows,
  format: kind = "inr",
  color = SERIES[0],
  reference,
  max: fixedMax,
}: {
  rows: { label: string; value: number; extra?: string; color?: string }[];
  format?: Fmt;
  color?: string;
  reference?: { value: number; label: string };
  max?: number;
}) {
  const format = (n: number) => fmt(kind, n);
  const max = fixedMax ?? Math.max(1, ...rows.map((r) => r.value), reference?.value ?? 0);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-3 text-sm"
          title={`${r.label}: ${format(r.value)}${r.extra ? ` · ${r.extra}` : ""}`}
        >
          <span className="truncate text-neutral-700">{r.label}</span>
          <span className="relative h-3">
            {reference && <span className="absolute inset-y-[-3px] w-px bg-neutral-500" style={{ left: `${(reference.value / max) * 100}%` }} aria-hidden="true" />}
            <span
              className="absolute inset-y-0 left-0 rounded-r-[4px]"
              style={{
                width: `${Math.max(0, (r.value / max) * 100)}%`,
                minWidth: r.value > 0 ? 3 : 0,
                background: r.color ?? color,
              }}
            />
          </span>
          <span className="text-right text-neutral-900 tabular-nums">
            {format(r.value)}
            {r.extra && <span className="ml-1.5 text-xs text-neutral-500">{r.extra}</span>}
          </span>
        </li>
      ))}
      {reference && (
        <li className="text-xs text-neutral-500">
          <span className="mr-1 inline-block h-3 w-px bg-neutral-500 align-middle" /> {reference.label}
        </li>
      )}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Heatmap / cohort grid (sequential blue; over-limit cells flagged with text)
// ---------------------------------------------------------------------------
export function Heatmap({
  columns,
  rows,
  format: kind = "pct",
  limit = 100,
  overLabel = "over",
}: {
  columns: string[];
  rows: { label: string; cells: { value: number | null; title?: string }[] }[];
  format?: Fmt;
  limit?: number;
  overLabel?: string;
}) {
  const format = (n: number) => fmt(kind, n);
  const step = (v: number) => SEQ[Math.min(SEQ.length - 1, Math.max(0, Math.floor((Math.min(v, limit) / limit) * (SEQ.length - 1))))];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
        <thead>
          <tr className="text-neutral-500">
            <th className="text-left font-medium" />
            {columns.map((c) => (
              <th key={c} className="px-1 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th className="max-w-36 truncate pr-2 text-left font-normal text-neutral-700" scope="row">
                {r.label}
              </th>
              {r.cells.map((c, i) => {
                const over = c.value !== null && c.value > limit;
                const bg = c.value === null ? "#f6f6f4" : step(c.value);
                const dark = c.value !== null && SEQ.indexOf(bg) >= 4;
                return (
                  <td
                    key={i}
                    title={c.title}
                    className="h-8 min-w-12 rounded text-center tabular-nums"
                    style={{
                      background: bg,
                      color: dark ? "#fff" : "#0b0b0b",
                      boxShadow: over ? "inset 0 0 0 2px #d03b3b" : undefined,
                    }}
                  >
                    {c.value === null ? "" : format(c.value)}
                    {over && <span className="sr-only"> {overLabel}</span>}
                    {over && <span aria-hidden="true"> ▲</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel, bullet, KPI tile + sparkline
// ---------------------------------------------------------------------------
export function Funnel({ stages, format: kind = "inr" }: { stages: { stage: string; count: number; value: number }[]; format?: Fmt }) {
  const format = (n: number) => fmt(kind, n);
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => (
        <li key={s.stage} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 text-sm">
          <span className="text-neutral-700">{s.stage}</span>
          <span className="relative h-6">
            <span
              className="absolute inset-y-0 left-0 rounded-[4px]"
              style={{
                width: `${(s.count / max) * 100}%`,
                minWidth: s.count ? 4 : 0,
                background: SEQ[6 - i * 2] ?? SEQ[2],
              }}
            />
          </span>
          <span className="text-right tabular-nums">
            {s.count} · {format(s.value)}
            {i > 0 && stages[i - 1].count > 0 && <span className="ml-1.5 text-xs text-neutral-500">{Math.round((s.count / stages[i - 1].count) * 100)}%</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function Bullet({ rows }: { rows: { label: string; actual: number; target: number }[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.actual, r.target * 1.2]));
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const over = r.target > 0 && r.actual > r.target;
        return (
          <li key={r.label} className="grid grid-cols-[minmax(80px,30%)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate text-neutral-700">{r.label}</span>
            <span className="relative h-4 rounded bg-neutral-100">
              <span
                className="absolute inset-y-1 left-0 rounded-r-[3px]"
                style={{
                  width: `${(r.actual / max) * 100}%`,
                  minWidth: r.actual ? 3 : 0,
                  background: over ? "#d03b3b" : SERIES[0],
                }}
              />
              {r.target > 0 && <span className="absolute -inset-y-0.5 w-0.5 bg-neutral-900" style={{ left: `${(r.target / max) * 100}%` }} aria-hidden="true" />}
            </span>
            <span className={`text-right tabular-nums ${over ? "font-medium text-red-700" : ""}`}>
              {compactInr(r.actual)} / {compactInr(r.target)}
              {over && <span className="ml-1 text-xs">▲ over</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Sparkline({ values, color = SERIES[0] }: { values: (number | null)[]; color?: string }) {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(0, ...nums);
  const w = 96;
  const h = 26;
  const pts = values
    .map((v, i) => (typeof v === "number" ? `${(i / (values.length - 1)) * (w - 4) + 2},${h - 2 - ((v - min) / (max - min || 1)) * (h - 4)}` : null))
    .filter(Boolean);
  const last = pts[pts.length - 1]!.split(",").map(Number);
  return (
    <svg width={w} height={h} aria-hidden="true">
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </svg>
  );
}

export function Kpi({
  label,
  value,
  sub,
  delta,
  upIsGood = true,
  spark,
  compareLabel,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number | null;
  upIsGood?: boolean;
  spark?: (number | null)[];
  compareLabel?: string;
}) {
  const good = delta === null || delta === undefined || delta === 0 ? null : delta > 0 === upIsGood;
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 flex items-end justify-between gap-2">
        <span className="text-xl font-semibold text-neutral-900">{value}</span>
        {spark && <Sparkline values={spark} />}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs">
        {delta !== undefined && delta !== null && (
          <span className={good === null ? "text-neutral-500" : good ? "text-[#006300]" : "text-red-700"}>
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta).toFixed(Math.abs(delta) < 10 ? 1 : 0)}%{compareLabel ? ` vs ${compareLabel}` : ""}
          </span>
        )}
        {sub && <span className="text-neutral-500">{sub}</span>}
      </div>
    </div>
  );
}
