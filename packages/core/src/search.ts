import type { Menu, MenuItem } from "./schema";

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "with", "please", "i", "id", "want", "can", "get", "have",
  "me", "some", "of", "to", "for", "like", "would", "could", "just", "one",
]);

const normalize = (text: string): string =>
  text.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (text: string): string[] => normalize(text).split(" ").filter((t) => t && !STOP_WORDS.has(t));

export interface SearchHit {
  item: MenuItem;
  score: number;
}

/**
 * Finds menu items matching what a customer said, by name, alias, tag or category.
 * Longer phrase matches win, so "10 nuggets" beats the plain "nuggets" alias.
 */
export function findItems(menu: Menu, query: string, limit = 5): SearchHit[] {
  const q = normalize(query);
  if (!q) return [];
  const queryTokens = tokens(query);

  const hits = menu.items.map((item): SearchHit => {
    const phrases = [item.name, ...item.aliases].map(normalize);
    let phraseScore = 0;
    for (const phrase of phrases) {
      if (phrase === q) phraseScore = Math.max(phraseScore, 100);
      else if (phrase.includes(q)) phraseScore = Math.max(phraseScore, 50 + q.length);
      else if (phrase.length >= 3 && q.includes(phrase)) phraseScore = Math.max(phraseScore, 50 + phrase.length);
    }

    const category = menu.categories.find((c) => c.id === item.categoryId)?.name ?? "";
    const haystack = new Set(tokens([...phrases, ...item.tags, category].join(" ")));
    const overlap = queryTokens.filter((t) => haystack.has(t)).length;

    return { item, score: phraseScore + overlap * 10 };
  });

  return hits
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit);
}
