/** Shown instantly while a page's data loads, so navigation never feels stuck. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded-md bg-neutral-200/80" />
      <div className="h-4 w-80 max-w-full rounded bg-neutral-200/60" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-white shadow-sm ring-1 ring-black/5" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-white shadow-sm ring-1 ring-black/5" />
    </div>
  );
}
