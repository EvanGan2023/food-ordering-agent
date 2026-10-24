import { soundSimilarity } from "./phonetic";
import type { Menu, MenuItem, ModifierGroup, ModifierOption } from "./schema";

/**
 * Did the customer say it? Items and options are only added without asking when the customer
 * used the menu's own words (an item's name or one of its aliases). Anything else is a guess,
 * and guesses are confirmed with the customer first.
 *
 * Words are compared after lower-casing, dropping punctuation and plural "s", and reading
 * "without"/"hold" as "no", so "Two cheeseburgers, without pickles" names "Cheeseburger" and "No pickles".
 */

const SYNONYMS: Record<string, string> = { without: "no", hold: "no", w: "with" };

/** Words in an option name that customers usually leave out ("Large meal" → "large"). */
const OPTION_FILLER = new Set(["meal", "add", "size", "milk"]);

function singular(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Lower-case words with punctuation, plurals and synonyms normalised. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => SYNONYMS[w] ?? singular(w));
}

/** True when `phrase` appears, word for word, somewhere in `said`. */
export function saysPhrase(said: string, phrase: string): boolean {
  const s = words(said);
  const p = words(phrase);
  if (p.length === 0) return false;
  for (let i = 0; i + p.length <= s.length; i++) {
    if (p.every((w, j) => s[i + j] === w)) return true;
  }
  return false;
}

/** The item's own name or one of its aliases is in what the customer said. */
export function namesItem(said: string, item: MenuItem): boolean {
  return [item.name, ...item.aliases].some((phrase) => saysPhrase(said, phrase));
}

/** How alike a longer name must be to make a short exact match doubtful. */
const LONGER_NAME_DOUBT = 0.9;
/** How alike the customer's neighbouring words must be to a longer name's extra words. */
const EXTRA_WORDS_LIKENESS = 0.6;

/**
 * The customer named this item exactly, and no longer menu name nearly matches the same words.
 * "spicy chikken burger" contains the alias "burger" (Classic Burger), but "Spicy Chicken Burger"
 * is nearly there too, so it isn't an exact Classic Burger; neither is "cheeseburger meal" a plain Cheeseburger.
 */
export function isExactItem(menu: Menu, said: string, item: MenuItem): boolean {
  const s = words(said);
  // Where the item's name or alias was said: [start, end) word positions.
  const spans: [number, number][] = [];
  for (const phrase of [item.name, ...item.aliases]) {
    const p = words(phrase);
    for (let i = 0; p.length && i + p.length <= s.length; i++) {
      if (p.every((w, j) => s[i + j] === w)) spans.push([i, i + p.length]);
    }
  }
  if (spans.length === 0) return false;

  // Doubtful if, around one of those spots, the words nearly spell a longer name of another item.
  const doubtful = ([start, end]: [number, number]) =>
    menu.items.some(
      (other) =>
        other.id !== item.id &&
        [other.name, ...other.aliases].some((phrase) => {
          const p = words(phrase);
          const n = p.length;
          if (n <= end - start) return false;
          // A longer name built around the same words ("double cheese burger" around "cheese burger"):
          // doubtful when its extra words sound like the customer's neighbouring words ("dubble").
          const said = s.slice(start, end);
          for (let k = 0; k + said.length <= n; k++) {
            if (!said.every((w, j) => p[k + j] === w)) continue;
            const before = p.slice(0, k);
            const after = p.slice(k + said.length);
            const heardBefore = s.slice(Math.max(0, start - before.length), start);
            const heardAfter = s.slice(end, end + after.length);
            const close = (want: string[], heard: string[]) =>
              want.length === 0 || (heard.length === want.length && likeness(heard.join(" "), want.join(" ")) >= EXTRA_WORDS_LIKENESS);
            if (close(before, heardBefore) && close(after, heardAfter)) return true;
          }
          for (let size = n - 1; size <= n + 1; size++) {
            for (let i = Math.max(0, end - size); i <= start && i + size <= s.length; i++) {
              // Spelling only: exact words aren't doubted just because another name sounds alike ("hotcakes", "hot cocoa").
              if (similarity(s.slice(i, i + size).join(" "), phrase) >= LONGER_NAME_DOUBT) return true;
            }
          }
          return false;
        }),
    );
  return spans.some((span) => !doubtful(span));
}

/** Words that may sit between the words of an option ("no pickles or onions" names "No onions"). */
const CONNECTORS = new Set(["and", "or", "with", "a", "an", "the", "please"]);

/**
 * The customer named this option: one of its aliases, or every meaningful word of its name in order
 * ("large" for "Large meal"). Between those words only connectors or words of the group's other options
 * may appear, so "no pickles or onions" names "No onions" but "no sugar, regular ice" doesn't name "No ice".
 */
export function namesOption(said: string, option: ModifierOption, group?: ModifierGroup): boolean {
  if (option.aliases.some((alias) => saysPhrase(said, alias))) return true;
  const key = words(option.name).filter((w) => !OPTION_FILLER.has(w));
  if (key.length === 0) return saysPhrase(said, option.name);
  const s = words(said);
  const siblings = new Set(
    (group?.options ?? []).filter((o) => o.id !== option.id).flatMap((o) => [o.name, ...o.aliases].flatMap(words)),
  );
  for (let start = 0; start < s.length; start++) {
    if (s[start] !== key[0]) continue;
    let k = 1;
    for (let i = start + 1; i < s.length && k < key.length; i++) {
      if (s[i] === key[k]) k++;
      else if (!CONNECTORS.has(s[i]!) && !siblings.has(s[i]!)) break;
    }
    if (k === key.length) return true;
  }
  return false;
}

/** Levenshtein distance between two strings. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j]!;
      prev[j] = Math.min(above + 1, prev[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length]!;
}

/** 0–1: how alike two strings are, ignoring spaces, so "cheese burgr" is close to "cheeseburger". */
export function similarity(a: string, b: string): number {
  const x = words(a).join("");
  const y = words(b).join("");
  if (!x || !y) return 0;
  return 1 - editDistance(x, y) / Math.max(x.length, y.length);
}

/** Sound-alike scores count slightly less than spelling, since codes are coarse. */
const SOUND_DISCOUNT = 0.1;

/**
 * 0–1: how likely `heard` is the menu phrase, by spelling or by sound, whichever is closer.
 * Speech-to-text mishears by sound ("terror milk tea" for "taro milk tea"), typing by spelling.
 */
export function likeness(heard: string, phrase: string): number {
  return Math.max(similarity(heard, phrase), soundSimilarity(heard, phrase) - SOUND_DISCOUNT);
}

/** Best likeness between a phrase and any run of the customer's words of about the same length. */
function bestWindow(said: string, phrase: string): number {
  const s = words(said);
  const n = words(phrase).length;
  let best = 0;
  for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
    for (let i = 0; i + size <= s.length; i++) {
      best = Math.max(best, likeness(s.slice(i, i + size).join(" "), phrase));
    }
  }
  return best;
}

export interface ItemMatch {
  item: MenuItem;
  /** 1 for an exact name or alias; otherwise a 0–1 likeness (spelling or sound), weighted towards longer names. */
  score: number;
  exact: boolean;
}

/** Menu items ranked by how closely the customer's words name them. Exact names first. */
export function rankItems(menu: Menu, said: string, limit = 3): ItemMatch[] {
  return menu.items
    .map((item): ItemMatch => {
      if (isExactItem(menu, said, item)) return { item, score: 1, exact: true };
      // A short alias that matches one word ("burger") shouldn't beat a near-miss on a full name.
      const scores = [item.name, ...item.aliases].map((phrase) => {
        const chars = words(phrase).join("").length;
        return { raw: bestWindow(said, phrase), weighted: bestWindow(said, phrase) * (chars / (chars + 3)) };
      });
      const best = scores.reduce((a, b) => (b.weighted > a.weighted ? b : a));
      return { item, score: best.raw >= 0.6 ? best.weighted : 0, exact: false };
    })
    .filter((m) => m.exact || m.score > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score || b.item.name.length - a.item.name.length)
    .slice(0, limit);
}

export interface OptionGuess {
  group: ModifierGroup;
  option: ModifierOption;
}

/**
 * Chosen options the customer didn't name. Defaults are fine unnamed, and so is an option the
 * customer picked from a list of choices (its name is then the whole message).
 */
export function unnamedOptions(menu: Menu, said: string, selections: Record<string, string[]>): OptionGuess[] {
  const guesses: OptionGuess[] = [];
  for (const [groupId, optionIds] of Object.entries(selections)) {
    const group = menu.modifierGroups.find((g) => g.id === groupId);
    if (!group) continue;
    for (const optionId of optionIds) {
      const option = group.options.find((o) => o.id === optionId);
      if (!option || option.default) continue;
      if (!namesOption(said, option, group)) guesses.push({ group, option });
    }
  }
  return guesses;
}

/** Words that carry no menu meaning, so a sound-alike match on them alone is ignored. */
const FILLER = new Set([
  "a", "an", "the", "and", "with", "please", "i", "can", "get", "me", "some", "of", "to", "for", "like",
  "would", "could", "just", "it", "that", "yeah", "yes", "um", "uh", "my", "is", "on", "in", "be", "thank", "thanks",
  "one", "two", "three", "four", "five", "six", "both", "another", "also", "too",
]);

/** Every phrase customers can use for the menu: item names and aliases, and option names and aliases. */
function menuPhrases(menu: Menu): { phrase: string[]; means: string; kind: "item" | "option" }[] {
  const items = menu.items.flatMap((item) =>
    [item.name, ...item.aliases].map((p) => ({ phrase: words(p), means: item.name, kind: "item" as const })),
  );
  const options = menu.modifierGroups.flatMap((group) =>
    group.options.flatMap((option) =>
      [option.name, ...option.aliases].map((p) => ({ phrase: words(p), means: `${option.name} (${group.name.toLowerCase()})`, kind: "option" as const })),
    ),
  );
  return [...items, ...options].filter((p) => p.phrase.length > 0);
}

/** Positions of the customer's words that are part of an exact menu phrase. */
function exactWords(menu: Menu, s: string[]): Set<number> {
  const covered = new Set<number>();
  for (const { phrase } of menuPhrases(menu)) {
    for (let i = 0; i + phrase.length <= s.length; i++) {
      if (phrase.every((w, j) => s[i + j] === w)) for (let j = 0; j < phrase.length; j++) covered.add(i + j);
    }
  }
  return covered;
}

/**
 * How well a transcript fits the menu: the number of its words that are exact menu words.
 * Used to pick between the speech recogniser's alternative transcripts.
 */
export function menuFit(menu: Menu, text: string): number {
  return exactWords(menu, words(text)).size;
}

export interface HeardAs {
  /** The customer's words, as transcribed. */
  heard: string;
  /** The menu item or option they sound or look like. */
  means: string;
  kind: "item" | "option";
  score: number;
}

/** How close words must be to be worth pointing out to the agent as a possible mishearing. */
const HEARD_AS_MIN = 0.77;

/**
 * Words in what the customer said that aren't on the menu but sound (or are spelled) like something
 * that is: "terror milk tea" → Taro Milk Tea, "have sugar" → 50% sugar. These are guesses for the
 * agent to confirm, never things to add without a yes.
 */
export function soundsLike(menu: Menu, said: string, limit = 6): HeardAs[] {
  const s = words(said);
  const exact = exactWords(menu, s);
  const best = new Map<string, HeardAs>();
  const saidExactly = new Set(
    menuPhrases(menu)
      .filter(({ phrase }) => s.some((_, i) => phrase.every((w, j) => s[i + j] === w)))
      .map((p) => p.means),
  );
  for (const { phrase, means, kind } of menuPhrases(menu)) {
    if (saidExactly.has(means)) continue; // already said exactly
    const n = phrase.length;
    for (let size = Math.max(1, n - 1); size <= n + 1; size++) {
      for (let i = 0; i + size <= s.length; i++) {
        const window = s.slice(i, i + size);
        // Only windows with a word that isn't already an exact menu word, and isn't filler.
        if (!window.some((w, j) => !exact.has(i + j) && !FILLER.has(w))) continue;
        if (FILLER.has(window[0]!) || FILLER.has(window.at(-1)!)) continue;
        // Part of the name with the telling word missing ("sugar" for "0% sugar") isn't a mishearing.
        if (size < n && window.every((w) => phrase.includes(w))) continue;
        const score = likeness(window.join(" "), phrase.join(" "));
        if (score < HEARD_AS_MIN) continue;
        const current = best.get(means);
        if (!current || score > current.score) best.set(means, { heard: window.join(" "), means, kind, score });
      }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
