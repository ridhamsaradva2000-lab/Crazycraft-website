/**
 * Turns a buyer's search text into the structured plan that
 * public.search_products() understands.
 *
 * Everything here is deliberately table-driven. There is NO generic word
 * joining, NO generic singularizer or pluralizer, and NO stemmer: a joined
 * spelling ("bedsheet"), a plural ("bags") or a synonym only exists if it is
 * written out in one of the curated tables below. Words that are not in a
 * table are searched exactly as typed.
 *
 * The database does the ranking and applies the visibility rules; this file
 * only decides which units the search is made of:
 *   - type units     (role "a"): the kind of product wanted ("tray", "pen holder")
 *   - modifier units (role "m"): optional context ("hotel", "serving")
 *   - material gates (role "m" + gate): a recognized material the product must
 *                    really be made of (proved by name or base_material)
 *
 * Pure functions only: no I/O, no environment access, no randomness.
 */

export const MAX_SEARCH_LENGTH = 100;

const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 24;
const MAX_ALTS_PER_UNIT = 12;
const MAX_UNITS = 8;

export type SearchAlt = { k: "d" | "h" | "e"; t: string };
export type SearchGate = { terms: string[]; excl: string | null };
export type SearchUnit = {
  no: number;
  role: "a" | "m";
  alts: SearchAlt[];
  gate?: SearchGate;
};
export type SearchPlan = { phrase: string; units: SearchUnit[] };

// ---------------------------------------------------------------------------
// Normalization (mirrors the normalization the database applies to product text)
// ---------------------------------------------------------------------------

// Fixed accent map (27 characters). Anything else that is not a-z / 0-9
// becomes a word break.
const ACCENT_FROM =
  "\u00e0\u00e1\u00e2\u00e3\u00e4\u00e5\u00e7\u00e8\u00e9\u00ea\u00eb\u00ec\u00ed\u00ee\u00ef\u00f1\u00f2\u00f3\u00f4\u00f5\u00f6\u00f9\u00fa\u00fb\u00fc\u00fd\u00ff";
const ACCENT_TO = "aaaaaaceeeeiiiinooooouuuuyy";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function normalizeSearchText(raw: string): string {
  const text = raw.slice(0, MAX_SEARCH_LENGTH).toLowerCase();
  let out = "";
  for (const ch of text) {
    const accentIndex = ACCENT_FROM.indexOf(ch);
    if (accentIndex >= 0) {
      out += ACCENT_TO.charAt(accentIndex);
    } else if (ch === "'" || ch === "\u2019" || ch === "\u2018") {
      // apostrophes are dropped, not turned into a word break
    } else if ((ch >= "a" && ch <= "z") || (ch >= "0" && ch <= "9")) {
      out += ch;
    } else {
      out += " ";
    }
  }
  return out.replace(/ +/g, " ").trim();
}

function tokenize(normalized: string): string[] {
  const tokens: string[] = [];
  for (const piece of normalized.split(" ")) {
    if (piece.length < 2) continue;
    if (STOP_WORDS.has(piece)) continue;
    tokens.push(piece.slice(0, MAX_TOKEN_LENGTH));
    if (tokens.length === MAX_TOKENS) break;
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Curated vocabulary
// ---------------------------------------------------------------------------

// Material vocabulary. "gate" lists every word that PROVES the material when it
// appears in a product's NAME or BASE_MATERIAL (never category or description).
// Wood is a family for gate purposes only: any family member satisfies a typed
// "wood" / "wooden" / "timber", but a typed species word ("teak", "sheesham")
// gates on itself only, and rosewood is NOT equivalent to sheesham.
// Quartz, glass frit, glaze and similar ingredient words are deliberately not
// vocabulary: they never prove a ceramic or glass product.
const WOOD_FAMILY = ["wood", "hardwood", "sheesham", "shisham", "rosewood", "teak", "beech", "kadam", "timber"];
const RESIN_FAMILY = ["resin", "epoxy"];
const CERAMIC_FAMILY = ["ceramic", "pottery", "blue pottery"];

type MaterialEntry = {
  typed: string;
  direct: string[];
  equiv: string[];
  gate: string[];
  excl: string | null;
};

const MATERIAL_ENTRIES: MaterialEntry[] = [
  { typed: "wooden", direct: ["wooden"], equiv: ["wood"], gate: WOOD_FAMILY, excl: null },
  { typed: "wood", direct: ["wood"], equiv: [], gate: WOOD_FAMILY, excl: null },
  { typed: "timber", direct: ["timber"], equiv: ["wood"], gate: WOOD_FAMILY, excl: null },
  { typed: "mango wood", direct: ["mango wood"], equiv: [], gate: ["mango wood"], excl: null },
  { typed: "sheesham", direct: ["sheesham", "shisham"], equiv: [], gate: ["sheesham", "shisham"], excl: null },
  { typed: "shisham", direct: ["shisham", "sheesham"], equiv: [], gate: ["sheesham", "shisham"], excl: null },
  { typed: "rosewood", direct: ["rosewood"], equiv: [], gate: ["rosewood"], excl: null },
  { typed: "hardwood", direct: ["hardwood"], equiv: [], gate: ["hardwood"], excl: null },
  { typed: "teak", direct: ["teak"], equiv: [], gate: ["teak"], excl: null },
  { typed: "beech", direct: ["beech"], equiv: [], gate: ["beech"], excl: null },
  { typed: "kadam", direct: ["kadam"], equiv: [], gate: ["kadam"], excl: null },
  { typed: "cotton", direct: ["cotton"], equiv: [], gate: ["cotton"], excl: null },
  { typed: "brass", direct: ["brass"], equiv: [], gate: ["brass"], excl: null },
  { typed: "bamboo", direct: ["bamboo"], equiv: [], gate: ["bamboo"], excl: null },
  // "glass frit" in a base_material is an ingredient, not a glass product.
  { typed: "glass", direct: ["glass"], equiv: [], gate: ["glass"], excl: "glass frit" },
  { typed: "resin", direct: ["resin"], equiv: ["epoxy"], gate: RESIN_FAMILY, excl: null },
  { typed: "epoxy", direct: ["epoxy"], equiv: ["resin"], gate: RESIN_FAMILY, excl: null },
  { typed: "epoxy resin", direct: ["epoxy resin"], equiv: ["resin", "epoxy"], gate: RESIN_FAMILY, excl: null },
  { typed: "ceramic", direct: ["ceramic"], equiv: ["pottery"], gate: CERAMIC_FAMILY, excl: null },
  { typed: "pottery", direct: ["pottery"], equiv: ["ceramic"], gate: CERAMIC_FAMILY, excl: null },
  { typed: "blue pottery", direct: ["blue pottery"], equiv: [], gate: CERAMIC_FAMILY, excl: null },
];

// Family nouns: words that name a kind of product on their own. A type unit
// built from one of these is anchored (the product NAME must contain it).
// Every accepted spelling, including plurals, is written out explicitly.
type TypeNoun = { forms: string[]; equiv: string[] };

const TYPE_NOUNS: Record<string, TypeNoun> = {
  bedspread: { forms: ["bedspread", "bedspreads", "bed spread", "bed spreads"], equiv: [] },
  bowl: { forms: ["bowl", "bowls"], equiv: [] },
  bag: { forms: ["bag", "bags"], equiv: [] },
  platter: { forms: ["platter", "platters"], equiv: [] },
  tray: { forms: ["tray", "trays"], equiv: [] },
  vase: { forms: ["vase", "vases"], equiv: [] },
  runner: { forms: ["runner", "runners"], equiv: [] },
  tapestry: { forms: ["tapestry", "tapestries"], equiv: [] },
  basket: { forms: ["basket", "baskets"], equiv: [] },
  plate: { forms: ["plate", "plates"], equiv: [] },
  planter: { forms: ["planter", "planters"], equiv: [] },
  cushion: { forms: ["cushion", "cushions"], equiv: [] },
  pouf: { forms: ["pouf", "poufs", "pouffe", "pouffes"], equiv: ["ottoman", "ottomans"] },
  ottoman: { forms: ["ottoman", "ottomans"], equiv: ["pouf", "poufs", "pouffe", "pouffes"] },
  pouch: { forms: ["pouch", "pouches"], equiv: [] },
};

// Generic nouns are never broadened. With a preceding word they form a phrase
// ("pen holder") that must match as a phrase; on their own they are literal.
const GENERIC_NOUNS: Record<string, string[]> = {
  holder: ["holder", "holders"],
  box: ["box", "boxes"],
  stand: ["stand", "stands"],
  bank: ["bank", "banks"],
  jar: ["jar", "jars"],
  hanger: ["hanger", "hangers"],
  dish: ["dish", "dishes"],
  cabinet: ["cabinet", "cabinets"],
  burner: ["burner", "burners"],
  board: ["board", "boards"],
  sheet: ["sheet", "sheets"],
  cover: ["cover", "covers"],
};

// Concepts: complete product phrases with their explicit spelling / compound
// forms and, where approved, their synonym concepts. Forms are full weight;
// equivalents rank lower. "head" lets the phrase's family noun act as a lower
// tier fallback (a plain "tray" for "serving tray") without equating board,
// tray and platter.
type Concept = {
  forms: string[];
  equivalents: string[];
  head: { noun: string; modifier: string } | null;
};

const CONCEPTS: Record<string, Concept> = {
  bed_sheet: { forms: ["bed sheet", "bed sheets", "bedsheet", "bedsheets"], equivalents: [], head: null },
  pen_holder: { forms: ["pen holder", "pen holders", "penholder"], equivalents: [], head: null },
  key_hanger: { forms: ["key hanger", "key hangers", "keyhanger"], equivalents: ["key_holder"], head: null },
  key_holder: { forms: ["key holder", "key holders", "keyholder"], equivalents: ["key_hanger"], head: null },
  money_bank: { forms: ["money bank", "money banks", "moneybank"], equivalents: ["piggy_bank"], head: null },
  piggy_bank: { forms: ["piggy bank", "piggy banks", "piggybank"], equivalents: ["money_bank"], head: null },
  soap_dish: { forms: ["soap dish", "soap dishes", "soapdish"], equivalents: ["soap_holder"], head: null },
  soap_holder: { forms: ["soap holder", "soap holders"], equivalents: ["soap_dish"], head: null },
  incense_holder: {
    forms: ["incense holder", "incense holders"],
    equivalents: ["incense_burner", "agarbatti_stand"],
    head: null,
  },
  incense_burner: {
    forms: ["incense burner", "incense burners", "incenseburner"],
    equivalents: ["incense_holder", "agarbatti_stand"],
    head: null,
  },
  agarbatti_stand: {
    forms: ["agarbatti stand", "agarbatti stands", "agarbattistand"],
    equivalents: ["incense_holder", "incense_burner"],
    head: null,
  },
  storage_jar: { forms: ["storage jar", "storage jars"], equivalents: ["canister"], head: null },
  canister: { forms: ["canister", "canisters"], equivalents: ["storage_jar"], head: null },
  spectacle_holder: { forms: ["spectacle holder", "spectacle holders"], equivalents: ["eyeglass_holder"], head: null },
  eyeglass_holder: { forms: ["eyeglass holder", "eyeglass holders"], equivalents: ["spectacle_holder"], head: null },
  serving_platter: {
    forms: ["serving platter", "serving platters"],
    equivalents: ["serving_tray"],
    head: { noun: "platter", modifier: "serving" },
  },
  serving_tray: {
    forms: ["serving tray", "serving trays"],
    equivalents: ["serving_platter"],
    head: { noun: "tray", modifier: "serving" },
  },
};

// Single-word spelling pairs that behave as the buyer's own wording.
const WORD_SPELLINGS: string[][] = [
  ["jewellery", "jewelry"],
  ["duffle", "duffel"],
  ["tealight", "tea light"],
];

// ---------------------------------------------------------------------------
// Lookup index (built once)
// ---------------------------------------------------------------------------

type Term =
  | { kind: "plain" }
  | { kind: "material"; entry: MaterialEntry }
  | { kind: "type"; key: string }
  | { kind: "generic"; key: string }
  | { kind: "concept"; key: string }
  | { kind: "spelling"; variants: string[] };

const INDEX = new Map<string, Term>();

function register(form: string, term: Term): void {
  if (!INDEX.has(form)) INDEX.set(form, term);
}

for (const key of Object.keys(CONCEPTS)) {
  const concept = CONCEPTS[key];
  if (concept === undefined) continue;
  for (const form of concept.forms) register(form, { kind: "concept", key });
}
for (const entry of MATERIAL_ENTRIES) register(entry.typed, { kind: "material", entry });
for (const key of Object.keys(TYPE_NOUNS)) {
  const noun = TYPE_NOUNS[key];
  if (noun === undefined) continue;
  for (const form of noun.forms) register(form, { kind: "type", key });
}
for (const key of Object.keys(GENERIC_NOUNS)) {
  const forms = GENERIC_NOUNS[key];
  if (forms === undefined) continue;
  for (const form of forms) register(form, { kind: "generic", key });
}
for (const variants of WORD_SPELLINGS) {
  for (const variant of variants) register(variant, { kind: "spelling", variants });
}

// ---------------------------------------------------------------------------
// Plan building
// ---------------------------------------------------------------------------

type Parsed = { term: Term; text: string; consumed: boolean; pairedModifier: number };

function parseTerms(tokens: string[]): Parsed[] {
  const out: Parsed[] = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let n = Math.min(3, tokens.length - i); n >= 1; n -= 1) {
      const text = tokens.slice(i, i + n).join(" ");
      const term = INDEX.get(text);
      if (term !== undefined) {
        out.push({ term, text, consumed: false, pairedModifier: -1 });
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out.push({ term: { kind: "plain" }, text: tokens[i] ?? "", consumed: false, pairedModifier: -1 });
      i += 1;
    }
  }
  return out;
}

function finalizeAlts(direct: string[], head: string[], equiv: string[]): SearchAlt[] {
  const seen = new Set<string>();
  const alts: SearchAlt[] = [];
  const add = (k: SearchAlt["k"], list: string[]): void => {
    for (const t of list) {
      if (seen.has(t)) continue;
      seen.add(t);
      alts.push({ k, t });
    }
  };
  add("d", direct);
  add("h", head);
  add("e", equiv);
  return alts.slice(0, MAX_ALTS_PER_UNIT);
}

function conceptForms(keys: string[]): string[] {
  const forms: string[] = [];
  for (const key of keys) {
    const concept = CONCEPTS[key];
    if (concept !== undefined) forms.push(...concept.forms);
  }
  return forms;
}

/**
 * Returns the plan for a search text, or null when no usable term is left
 * (empty, punctuation only, or only stop words). null means "a legitimate zero
 * result" - the caller must not fall back to the old search for it.
 */
export function buildSearchPlan(raw: string): SearchPlan | null {
  const phrase = normalizeSearchText(raw);
  const tokens = tokenize(phrase);
  if (tokens.length === 0) return null;

  const parsed = parseTerms(tokens);

  // A generic noun pairs with the nearest preceding plain/spelling word,
  // looking through any material words ("wooden desk holder" -> "desk holder").
  for (let i = 0; i < parsed.length; i += 1) {
    const current = parsed[i];
    if (current === undefined || current.term.kind !== "generic") continue;
    let j = i - 1;
    while (j >= 0 && parsed[j]?.term.kind === "material") j -= 1;
    const candidate = j >= 0 ? parsed[j] : undefined;
    if (candidate === undefined || candidate.consumed) continue;
    if (candidate.term.kind === "plain" || candidate.term.kind === "spelling") {
      current.pairedModifier = j;
      candidate.consumed = true;
    }
  }

  const units: SearchUnit[] = [];

  for (const item of parsed) {
    if (item.consumed) continue;
    const term = item.term;

    if (term.kind === "plain") {
      units.push({ no: 0, role: "m", alts: finalizeAlts([item.text], [], []) });
    } else if (term.kind === "spelling") {
      units.push({ no: 0, role: "m", alts: finalizeAlts(term.variants, [], []) });
    } else if (term.kind === "material") {
      units.push({
        no: 0,
        role: "m",
        alts: finalizeAlts(term.entry.direct, [], term.entry.equiv),
        gate: { terms: term.entry.gate, excl: term.entry.excl },
      });
    } else if (term.kind === "type") {
      const noun = TYPE_NOUNS[term.key];
      if (noun === undefined) continue;
      units.push({ no: 0, role: "a", alts: finalizeAlts(noun.forms, [], noun.equiv) });
    } else if (term.kind === "generic") {
      const forms = GENERIC_NOUNS[term.key] ?? [item.text];
      const modifier = item.pairedModifier >= 0 ? parsed[item.pairedModifier] : undefined;
      if (modifier === undefined) {
        // A bare generic noun is literal: an optional modifier-style unit.
        units.push({ no: 0, role: "m", alts: finalizeAlts(forms, [], []) });
      } else {
        const modifierForms = modifier.term.kind === "spelling" ? modifier.term.variants : [modifier.text];
        const phrases: string[] = [];
        for (const m of modifierForms) {
          for (const f of forms) phrases.push(m + " " + f);
        }
        units.push({ no: 0, role: "a", alts: finalizeAlts(phrases, [], []) });
      }
    } else if (term.kind === "concept") {
      const concept = CONCEPTS[term.key];
      if (concept === undefined) continue;
      const headForms = concept.head === null ? [] : (TYPE_NOUNS[concept.head.noun]?.forms ?? []);
      units.push({
        no: 0,
        role: "a",
        alts: finalizeAlts(concept.forms, headForms, conceptForms(concept.equivalents)),
      });
      if (concept.head !== null) {
        units.push({ no: 0, role: "m", alts: finalizeAlts([concept.head.modifier], [], []) });
      }
    }
  }

  const limited = units.slice(0, MAX_UNITS);
  limited.forEach((unit, index) => {
    unit.no = index + 1;
  });
  if (limited.length === 0) return null;

  return { phrase, units: limited };
}
