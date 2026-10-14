/**
 * Core puzzle logic for Throne of Guess.
 * Handles the character roster, the daily secret, guess scoring, and share text.
 */

const CHARACTERS_URL = "data/characters.json";
const PUZZLE_EPOCH_UTC = Date.UTC(2026, 0, 1);
const COMMON_NAME_WORDS = new Set(["of", "the", "and", "de", "from"]);

/** Distinctive family / house tokens that can score a partial name match. */
const FAMILY_TOKENS = new Set([
  "ashryver",
  "galathynius",
  "whitethorn",
  "havilliard",
  "blackbeak",
  "yellowlegs",
  "blueblood",
  "lochan",
  "allsbrook",
  "westfall",
  "salvaterre",
  "ytger",
  "faliq",
  "rompier",
  "hamel",
]);

let roster = [];

/**
 * Load and freeze the character database. Call once at startup.
 * @returns {Promise<object[]>}
 */
export async function loadCharacters() {
  const response = await fetch(CHARACTERS_URL);
  if (!response.ok) {
    throw new Error("Could not load character data.");
  }
  const data = await response.json();
  roster = data.slice().sort((a, b) => a.id.localeCompare(b.id));
  return roster;
}

/** @returns {object[]} */
export function getCharacters() {
  return roster;
}

/** UTC calendar date as YYYY-MM-DD. */
export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/**
 * Days since the puzzle epoch (used as the public puzzle number).
 * @param {string} dateKey
 */
export function getPuzzleNumber(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  return Math.floor((utc - PUZZLE_EPOCH_UTC) / 86400000) + 1;
}

/**
 * Pick the secret character for a UTC date. Stable for every player that day.
 * @param {string} [dateKey]
 */
export function getSecretForDate(dateKey = utcDateKey()) {
  if (!roster.length) {
    throw new Error("Characters have not been loaded.");
  }
  const index = hashString(dateKey) % roster.length;
  return roster[index];
}

/**
 * Find a character by typed name or alias (case-insensitive, punctuation-insensitive).
 * @param {string} query
 * @returns {object | null}
 */
export function findCharacter(query) {
  const needle = normalize(query);
  if (!needle) return null;

  const exact = roster.find((character) => namesOf(character).some((name) => normalize(name) === needle));
  if (exact) return exact;

  const compactNeedle = needle.replace(/\s+/g, "");
  return (
    roster.find((character) => namesOf(character).some((name) => normalize(name).replace(/\s+/g, "") === compactNeedle)) ||
    null
  );
}

/**
 * Filter the roster for autocomplete suggestions.
 * @param {string} query
 * @param {number} [limit]
 */
export function suggestCharacters(query, limit = 8) {
  const needle = normalize(query);
  if (!needle) return [];

  const scored = [];
  for (const character of roster) {
    const labels = namesOf(character);
    const starts = labels.some((name) => normalize(name).startsWith(needle));
    const includes = labels.some((name) => normalize(name).includes(needle));
    if (!starts && !includes) continue;
    scored.push({ character, rank: starts ? 0 : 1, label: character.name });
  }

  scored.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map((entry) => entry.character);
}

/**
 * Score a guess against the secret character.
 * @returns {{ name: string, kingdom: string, gender: string, species: string, firstBook: string }}
 */
export function scoreGuess(guess, secret) {
  return {
    name: scoreName(guess, secret),
    kingdom: scoreList(guess.kingdom, secret.kingdom),
    gender: guess.gender === secret.gender ? "exact" : "none",
    species: scoreSpecies(guess.species, secret.species),
    firstBook: guess.firstBook === secret.firstBook ? "exact" : "none",
  };
}

/**
 * Build a Wordle-style share string. Guess rows are oldest → newest.
 * @param {object[]} scoredGuesses
 * @param {object} options
 */
export function formatShareText(scoredGuesses, { puzzleNumber, won, attempts }) {
  const lines = scoredGuesses.map((result) =>
    ["name", "kingdom", "gender", "species", "firstBook"].map((key) => emojiFor(result[key])).join("")
  );

  const header = won
    ? `Throne of Guess #${puzzleNumber}\n${attempts} attempt${attempts === 1 ? "" : "s"}`
    : `Throne of Guess #${puzzleNumber}\n${attempts} attempt${attempts === 1 ? "" : "s"}`;

  return [header, "", ...lines].join("\n");
}

function scoreName(guess, secret) {
  if (guess.id === secret.id) return "exact";
  const guessTokens = nameTokens(guess);
  const secretTokens = nameTokens(secret);
  const overlap = [...guessTokens].some((token) => secretTokens.has(token));
  return overlap ? "partial" : "none";
}

function scoreList(guessValues, secretValues) {
  const guessSet = new Set(guessValues.map(normalize));
  const secretSet = new Set(secretValues.map(normalize));
  if (setsEqual(guessSet, secretSet)) return "exact";
  for (const value of guessSet) {
    if (secretSet.has(value)) return "partial";
  }
  return "none";
}

function scoreSpecies(guessValues, secretValues) {
  const listScore = scoreList(guessValues, secretValues);
  if (listScore !== "none") return listScore;

  const guessTokens = speciesTokens(guessValues);
  const secretTokens = speciesTokens(secretValues);
  for (const token of guessTokens) {
    if (secretTokens.has(token)) return "partial";
  }
  return "none";
}

function speciesTokens(values) {
  const tokens = new Set();
  for (const value of values) {
    const compact = normalize(value).replace(/-/g, " ");
    for (const part of compact.split(/\s+/)) {
      if (part) tokens.add(part);
    }
    tokens.add(compact.replace(/\s+/g, ""));
  }
  return tokens;
}

function nameTokens(character) {
  const tokens = new Set();
  for (const label of namesOf(character)) {
    for (const part of normalize(label).split(/\s+/)) {
      if (part.length < 4 || COMMON_NAME_WORDS.has(part)) continue;
      if (FAMILY_TOKENS.has(part) || part.length >= 5) {
        tokens.add(part);
      }
    }
  }
  return tokens;
}

function namesOf(character) {
  return [character.name, ...(character.aliases || [])];
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

function emojiFor(result) {
  if (result === "exact") return "🟩";
  if (result === "partial") return "🟧";
  return "🟥";
}
