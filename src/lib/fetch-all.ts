/**
 * Supabase stops at 1,000 rows without saying so. Pages through a query until it runs out.
 * `page` must build a fresh, ordered query each time, e.g. (a, b) => supabase.from("x").select("*").order("id").range(a, b).
 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = Infinity, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const to = Math.min(from + size, max) - 1;
    const { data, error } = await page(from, to);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  return out;
}
