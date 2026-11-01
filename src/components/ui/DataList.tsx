import Link from "next/link";
import type { ReactNode } from "react";

export interface Column {
  key: string;
  label: ReactNode;
  align?: "left" | "right";
  /** Shown big on phone cards (one column). */
  primary?: boolean;
  /** Hidden on phone cards. */
  hideOnMobile?: boolean;
  className?: string;
}
export interface DataRow {
  id: string;
  href?: string;
  cells: Record<string, ReactNode>;
}

/** A table on desktop that becomes stacked cards on phones. Rows can link somewhere. */
export function DataList({ columns, rows, footer, label }: { columns: Column[]; rows: DataRow[]; footer?: ReactNode; label?: string }) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <>
      <div className="hidden sm:block">
        <table className="w-full text-sm" aria-label={label}>
          <thead>
            <tr className="border-b border-line text-left text-xs text-neutral-500">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`py-2 pr-3 font-medium last:pr-0 ${c.align === "right" ? "text-right" : ""} ${c.className ?? ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className={r.href ? "group relative hover:bg-subtle/60" : ""}>
                {columns.map((c, i) => (
                  <td key={c.key} className={`py-2.5 pr-3 align-middle last:pr-0 ${c.align === "right" ? "text-right tabular-nums" : ""} ${c.className ?? ""}`}>
                    {i === columns.indexOf(primary) && r.href ? (
                      <Link href={r.href} className="font-medium text-ink after:absolute after:inset-0 group-hover:text-navy">
                        {r.cells[c.key]}
                      </Link>
                    ) : (
                      <span className="relative">{r.cells[c.key]}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer && <tfoot className="border-t border-line text-sm font-medium">{footer}</tfoot>}
        </table>
      </div>
      <ul className="divide-y divide-line border-y border-line sm:hidden" aria-label={label}>
        {rows.map((r) => {
          const body = (
            <>
              <div className="font-medium text-ink">{r.cells[primary.key]}</div>
              <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
                {rest.map((c) => (
                  <div key={c.key} className="flex min-w-0 flex-col">
                    <dt className="text-[11px] text-neutral-500">{c.label}</dt>
                    <dd className="min-w-0 truncate">{r.cells[c.key]}</dd>
                  </div>
                ))}
              </dl>
            </>
          );
          return (
            <li key={r.id} className="relative py-3">
              {r.href ? (
                <Link href={r.href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
