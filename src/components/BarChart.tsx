"use client";

import { useState } from "react";

export interface Bar {
  key: string;
  label: string;
  value: number;
  detail?: string;
}

/** Rupees in short form for axis ticks and tooltips: ₹4.2L, ₹1.1Cr, ₹850. */
export function compactInr(n: number): string {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  const body = a >= 10000000 ? `${(a / 10000000).toFixed(1)}Cr` : a >= 100000 ? `${(a / 100000).toFixed(1)}L` : a >= 1000 ? `${Math.round(a / 1000)}k` : `${Math.round(a)}`;
  return `${sign}₹${body}`;
}

/**
 * Single-series column chart: thin bars, 4px rounded tops on a baseline, recessive grid,
 * hover tooltip per bar, labels in ink (not the series colour). Table fallback for screen readers.
 */
export function BarChart({ bars, title, height = 180 }: { bars: Bar[]; title: string; height?: number }) {
  const format = compactInr;
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => Math.abs(b.value)));
  const ticks = [0, 0.5, 1].map((t) => t * max);
  return (
    <figure className="m-0">
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-neutral-200/70" style={{ bottom: `${(t / max) * 100}%` }}>
            <span className="absolute -top-2 right-full mr-1 text-[10px] text-neutral-400 tabular-nums">{t ? format(t) : ""}</span>
          </div>
        ))}
        <div className="absolute inset-0 ml-0 flex items-end gap-[2px]">
          {bars.map((b, i) => (
            <div
              key={b.key}
              className="relative flex h-full flex-1 cursor-default items-end justify-center"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${b.label}: ${format(b.value)}`}
            >
              <div
                className="w-full max-w-[28px] rounded-t-[4px]"
                style={{
                  height: `${(Math.max(b.value, 0) / max) * 100}%`,
                  minHeight: b.value > 0 ? 2 : 0,
                  background: hover === null || hover === i ? "#3846b4" : "#3846b4aa",
                }}
              />
              {hover === i && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-md bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow">
                  <div className="font-medium">{b.label}</div>
                  <div className="tabular-nums">{format(b.value)}</div>
                  {b.detail && <div className="text-neutral-300">{b.detail}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-neutral-500">
        {bars.map((b) => (
          <div key={b.key} className="flex-1 truncate text-center">
            {b.label}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>
          {bars.map((b) => (
            <tr key={b.key}>
              <th>{b.label}</th>
              <td>{format(b.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
