import type { CardCategory } from "./sagun-card.view.js";

export const CARD_LAYOUTS = [1, 2, 4] as const;
export type CardLayout = (typeof CARD_LAYOUTS)[number];
export const BOOKLET_GROUPINGS = ["SEPARATE", "TOGETHER"] as const;
export type BookletGrouping = (typeof BOOKLET_GROUPINGS)[number];
export const INDEX_ROWS_PER_PAGE = 30;

export interface PlannedCard {
  profileId: string;
  category: CardCategory;
}
export interface BookletOptions {
  layout: CardLayout;
  grouping: BookletGrouping;
  includeCover: boolean;
  includeIndex: boolean;
  includeClosing: boolean;
}
export type PlannedPage<T extends PlannedCard> =
  | { kind: "cover"; number: number }
  | { kind: "index"; number: number; entries: IndexEntry<T>[]; part: number; parts: number }
  | { kind: "cards"; number: number; section: SectionKey; cards: T[] }
  | { kind: "closing"; number: number };
export type SectionKey = "GROOM" | "BRIDE" | "ALL";
export interface IndexEntry<T> {
  serial: number;
  card: T;
  section: SectionKey;
  page: number;
}

export const SECTION_TITLES: Record<SectionKey, { hi: string; en: string }> = {
  GROOM: { hi: "युवक परिचय", en: "Grooms" },
  BRIDE: { hi: "युवती परिचय", en: "Brides" },
  ALL: { hi: "वैवाहिक परिचय", en: "Profiles" },
};

const chunk = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));

// Lays the booklet out before drawing anything, so the index can print the page each card lands on.
// Order: cover, index, grooms then brides (or everyone together), closing page. A card never spans two pages;
// each section starts on a new page.
export function planBooklet<T extends PlannedCard>(cards: T[], options: BookletOptions): PlannedPage<T>[] {
  const sections: { key: SectionKey; cards: T[] }[] =
    options.grouping === "SEPARATE"
      ? (["GROOM", "BRIDE"] as const).map((key) => ({ key, cards: cards.filter((card) => card.category === key) })).filter((section) => section.cards.length)
      : [{ key: "ALL", cards }];
  const indexParts = options.includeIndex && cards.length ? Math.ceil(cards.length / INDEX_ROWS_PER_PAGE) : 0;
  let number = 0;
  const pages: PlannedPage<T>[] = [];
  if (options.includeCover) pages.push({ kind: "cover", number: ++number });
  const indexPages = Array.from({ length: indexParts }, (_, part) => ({
    kind: "index" as const,
    number: ++number,
    entries: [] as IndexEntry<T>[],
    part: part + 1,
    parts: indexParts,
  }));
  pages.push(...indexPages);
  const entries: IndexEntry<T>[] = [];
  for (const section of sections) {
    for (const group of chunk(section.cards, options.layout)) {
      const page = { kind: "cards" as const, number: ++number, section: section.key, cards: group };
      pages.push(page);
      for (const card of group) entries.push({ serial: entries.length + 1, card, section: section.key, page: page.number });
    }
  }
  chunk(entries, INDEX_ROWS_PER_PAGE).forEach((part, index) => {
    if (indexPages[index]) indexPages[index].entries = part;
  });
  if (options.includeClosing) pages.push({ kind: "closing", number: ++number });
  return pages;
}
