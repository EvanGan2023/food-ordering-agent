/**
 * Sound-alike matching for misheard speech. Speech-to-text gets words wrong by sound, not by spelling:
 * "terror" for "taro", "tie" for "Thai", "less eyes" for "less ice", "ships" for "chips".
 * `soundKey` turns words into a rough code of how they sound (a simplified Metaphone), so words
 * that sound alike get the same or a close code even when they're spelled differently.
 *
 * - Vowels only count at the start of a word ("oolong" and "oh long" both start with a vowel).
 * - Spellings of the same sound become one letter: ph/f/v → F, c/k/q/ck/g → K, ch/sh/tch → X, z/s/soft c → S.
 * - Voiced and unvoiced pairs are merged (b/p, d/t, g/k, v/f, z/s), because they're the easiest to mishear.
 * - Silent letters are dropped (h after a vowel, gh, kn, wr), and repeated codes collapse.
 */

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function wordKey(raw: string): string {
  const w = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!w) return "";
  if (/^\d+$/.test(w)) return w; // numbers stay as they are
  const out: string[] = [];
  const at = (i: number) => w[i] ?? "";
  const isVowel = (c: string) => VOWELS.has(c);

  let i = 0;
  // Silent first letters.
  if (/^(kn|gn|pn|wr)/.test(w)) i = 1;
  if (isVowel(at(i)) || (at(i) === "y" && !isVowel(at(i + 1)))) out.push("A");

  for (; i < w.length; i++) {
    const c = at(i);
    const next = at(i + 1);
    const prev = at(i - 1);
    if (isVowel(c)) continue;
    switch (c) {
      case "b":
      case "p":
        out.push(c === "p" && next === "h" ? "F" : "P");
        if (c === "p" && next === "h") i++;
        break;
      case "c":
        if (next === "h") {
          out.push("X");
          i++;
        } else if (next === "k") {
          out.push("K");
          i++;
        } else out.push("eiy".includes(next) && next !== "" ? "S" : "K");
        break;
      case "s":
        if (next === "h") {
          out.push("X");
          i++;
        } else if (next === "c" && at(i + 2) === "h") {
          out.push("SK");
          i += 2;
        } else out.push("S");
        break;
      case "t":
        if (next === "c" && at(i + 2) === "h") {
          out.push("X");
          i += 2;
        } else if (next === "h") {
          out.push("T"); // "th" is heard as t or d
          i++;
        } else out.push("T");
        break;
      case "d":
        out.push(next === "g" && "eiy".includes(at(i + 2)) && at(i + 2) !== "" ? "J" : "T");
        if (next === "g" && "eiy".includes(at(i + 2)) && at(i + 2) !== "") i++;
        break;
      case "g":
        if (next === "h") {
          // "gh" is silent inside a word ("light") and a hard g at the start ("ghost").
          if (i === 0) out.push("K");
          i++;
        } else out.push("eiy".includes(next) && next !== "" ? "J" : "K");
        break;
      case "j":
        out.push("J");
        break;
      case "k":
      case "q":
        out.push("K");
        break;
      case "x":
        out.push("KS");
        break;
      case "z":
        out.push("S");
        break;
      case "f":
      case "v":
        out.push("F");
        break;
      case "h":
        // Only sounded at the start of a syllable, before a vowel.
        if (isVowel(next) && (i === 0 || !isVowel(prev))) out.push("H");
        break;
      case "w":
      case "y":
        // Consonants only before a vowel and not after one ("wonton", "yam"); otherwise part of a vowel ("eyes", "slaw").
        if (isVowel(next) && (i === 0 || !isVowel(prev))) out.push(c.toUpperCase());
        break;
      default:
        out.push(c.toUpperCase()); // l, m, n, r
    }
  }
  // Collapse repeats ("terror" → TR, "pudding" → PTNK).
  return out.join("").replace(/(.)\1+/g, "$1");
}

/** The sound code of a whole phrase, ignoring how it's split into words ("cheese burger" = "cheeseburger"). */
export function soundKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9']+/)
    .map((w) => wordKey(w.replace(/'s$/, "s")))
    .join("")
    .replace(/(.)\1+/g, "$1");
}

function editDistance(a: string, b: string): number {
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

/** 0–1: how alike two phrases sound. Very short codes can't be told apart, so they score lower. */
export function soundSimilarity(a: string, b: string): number {
  const x = soundKey(a);
  const y = soundKey(b);
  if (!x || !y) return 0;
  const score = 1 - editDistance(x, y) / Math.max(x.length, y.length);
  // A two-sound code ("TR") matches too much by chance; trust it less.
  return Math.min(x.length, y.length) <= 2 ? score * 0.85 : score;
}
