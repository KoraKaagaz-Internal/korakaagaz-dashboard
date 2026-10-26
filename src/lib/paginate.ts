import type { LineItem } from "./types";

/**
 * The invoice is a fixed-size page (see invoice.css), so items are packed into
 * pages ahead of time using an estimate of each row's height. The numbers here
 * mirror the CSS: keep them in sync when the template changes.
 */
export const LAYOUT = {
  titleCharsPerLine: 26, // 14px Inter in a 196px column
  descCharsPerLine: 31, // 11px Inter in a 186px column
  titleLine: 16,
  descLine: 13.4,
  rowPadding: 15 + 18 + 4, // top + bottom + gap between title and description
  /** Items area when everything fits on one page (rule at 597 to rule at 804). */
  singlePage: 207,
  /** Each extra totals row (discount, CGST, SGST, IGST) takes space from the items area. */
  totalsRow: 30,
  /** Empty space under the payment details (content ends ~70px above the footer); extra totals rows use it first. */
  paySlack: 70,
  /** Page 1 when totals move to a later page: items run down to the footer. */
  firstOfMany: 590,
  /** Continuation page with no totals. */
  middle: 1070,
  /** Continuation page that also carries totals + payment details. */
  last: 650,
};

export function wrapLines(text: string, charsPerLine: number): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  let lines = 0;
  for (const paragraph of trimmed.split(/\n/)) {
    let current = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const len = word.length;
      if (current === 0) {
        current = len;
        // a single very long word wraps by itself
        while (current > charsPerLine) {
          lines += 1;
          current -= charsPerLine;
        }
      } else if (current + 1 + len <= charsPerLine) {
        current += 1 + len;
      } else {
        lines += 1;
        current = len;
      }
    }
  }
  return lines;
}

export function estimateRowHeight(item: Pick<LineItem, "title" | "description">): number {
  const titleLines = Math.max(1, wrapLines(item.title, LAYOUT.titleCharsPerLine));
  const descLines = wrapLines(item.description, LAYOUT.descCharsPerLine);
  return LAYOUT.rowPadding + titleLines * LAYOUT.titleLine + descLines * LAYOUT.descLine;
}

/** Pixels the items area loses to extra totals rows, after using the slack under the payment details. */
export function totalsSqueeze(extraTotalsRows: number): number {
  return Math.max(0, extraTotalsRows * LAYOUT.totalsRow - LAYOUT.paySlack);
}

/** Height of the payment block: shrinks into its slack when there are extra totals rows. */
export function payBlockHeight(extraTotalsRows: number): number {
  return 305 - Math.min(extraTotalsRows * LAYOUT.totalsRow, LAYOUT.paySlack);
}

export interface PagePlan<T> {
  items: { item: T; index: number }[];
  isFirst: boolean;
  isLast: boolean;
}

/** Splits items into pages. Totals + payment details are always on the last page. */
export function paginate<T extends Pick<LineItem, "title" | "description">>(
  items: T[],
  extraTotalsRows = 0,
): PagePlan<T>[] {
  const indexed = items.map((item, index) => ({ item, index, h: estimateRowHeight(item) }));
  const totalHeight = indexed.reduce((s, r) => s + r.h, 0);
  const squeeze = totalsSqueeze(extraTotalsRows);
  const singleCapacity = LAYOUT.singlePage - squeeze;

  if (totalHeight <= singleCapacity) {
    return [{ items: indexed.map(({ item, index }) => ({ item, index })), isFirst: true, isLast: true }];
  }

  const pages: { item: T; index: number; h: number }[][] = [[]];
  let used = 0;
  let capacity = LAYOUT.firstOfMany;
  for (const row of indexed) {
    if (used + row.h > capacity && pages[pages.length - 1].length > 0) {
      pages.push([]);
      used = 0;
      capacity = LAYOUT.middle;
    }
    pages[pages.length - 1].push(row);
    used += row.h;
  }

  // The final page must leave room for totals + payment details.
  const lastCapacity = LAYOUT.last - squeeze;
  if (pages.length === 1 || used > lastCapacity) {
    // Move trailing rows onto the totals page so it never stands empty.
    const prev = pages[pages.length - 1];
    const carried: typeof prev = [];
    let carriedH = 0;
    while (prev.length > 1 && carriedH + prev[prev.length - 1].h <= lastCapacity) {
      const row = prev.pop()!;
      carried.unshift(row);
      carriedH += row.h;
    }
    pages.push(carried);
  }

  return pages.map((rows, i) => ({
    items: rows.map(({ item, index }) => ({ item, index })),
    isFirst: i === 0,
    isLast: i === pages.length - 1,
  }));
}
