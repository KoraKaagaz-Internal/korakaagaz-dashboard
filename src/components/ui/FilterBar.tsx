import Link from "next/link";
import { useId, type ReactNode } from "react";
import { button } from "./Button";

/**
 * One filter row: fields + Apply + Clear (a GET form, no JS needed).
 * On phones the fields fold behind a "Filters" toggle.
 */
export function FilterBar({ action, children, active, clearHref, search }: { action: string; children: ReactNode; active: number; clearHref: string; search?: ReactNode }) {
  const id = useId();
  return (
    <form action={action} className="mb-4 flex flex-wrap items-end gap-2">
      {search && <div className="min-w-0 flex-1 sm:max-w-xs">{search}</div>}
      <input type="checkbox" id={id} className="peer sr-only" />
      <label htmlFor={id} className={`${button("secondary", "sm")} cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-navy sm:hidden`}>
        Filters{active ? ` · ${active}` : ""}
      </label>
      <div className="hidden w-full flex-wrap items-end gap-2 peer-checked:flex sm:flex sm:w-auto">
        {children}
        <button className={button("secondary", "sm")}>Apply</button>
        {active > 0 && (
          <Link href={clearHref} className={button("ghost", "sm")}>
            Clear
          </Link>
        )}
      </div>
    </form>
  );
}
