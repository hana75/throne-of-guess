/**
 * Throne of Guess UI: input, autocomplete, guess rows, victory, and sharing.
 */

import {
  findCharacter,
  formatShareText,
  getCharacters,
  getPuzzleNumber,
  getSecretForDate,
  loadCharacters,
  scoreGuess,
  suggestCharacters,
  utcDateKey,
} from "./game.js";

const STORAGE_PREFIX = "throne-of-guess:";

const els = {
  form: document.querySelector("#guess-form"),
  input: document.querySelector("#guess-input"),
  suggestions: document.querySelector("#suggestions"),
  error: document.querySelector("#error"),
  attempts: document.querySelector("#attempts"),
  share: document.querySelector("#share-btn"),
  shareStatus: document.querySelector("#share-status"),
  list: document.querySelector("#guess-list"),
  victory: document.querySelector("#victory"),
};

const dateKey = utcDateKey();
const puzzleNumber = getPuzzleNumber(dateKey);

let secret = null;
/** @type {{ character: object, result: object }[]} newest first */
let guesses = [];
let won = false;
let activeSuggestion = -1;

init().catch((error) => {
  showError(error.message || "The game failed to load.");
});

async function init() {
  await loadCharacters();
  secret = getSecretForDate(dateKey);
  restore();
  render();
  bindEvents();
}

function bindEvents() {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitGuess(els.input.value);
  });

  els.input.addEventListener("input", () => {
    clearError();
    renderSuggestions(els.input.value);
  });

  els.input.addEventListener("keydown", (event) => {
    const options = [...els.suggestions.querySelectorAll("[role='option']")];
    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      activeSuggestion = Math.min(activeSuggestion + 1, options.length - 1);
      highlightSuggestion(options);
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      activeSuggestion = Math.max(activeSuggestion - 1, 0);
      highlightSuggestion(options);
    } else if (event.key === "Enter" && activeSuggestion >= 0 && options[activeSuggestion]) {
      event.preventDefault();
      fillSuggestion(options[activeSuggestion].dataset.name);
    } else if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  els.suggestions.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[role='option']");
    if (!option) return;
    event.preventDefault();
    fillSuggestion(option.dataset.name);
  });

  document.addEventListener("click", (event) => {
    if (!els.form.contains(event.target)) hideSuggestions();
  });

  els.share.addEventListener("click", shareScore);
}

function submitGuess(rawValue) {
  if (won) return;

  const character = findCharacter(rawValue);
  if (!character) {
    showError("That name is not in the character list. Try another spelling, or pick a suggestion.");
    return;
  }

  if (guesses.some((entry) => entry.character.id === character.id)) {
    showError("You already guessed that character.");
    return;
  }

  const result = scoreGuess(character, secret);
  guesses.unshift({ character, result });
  hideSuggestions();
  els.input.value = "";
  clearError();

  if (character.id === secret.id) {
    won = true;
  }

  persist();
  render({ celebrate: won });
}

function render({ celebrate = false } = {}) {
  els.attempts.textContent = `Attempts: ${guesses.length}`;
  els.share.disabled = guesses.length === 0;
  els.input.disabled = won;
  els.form.querySelector("button[type='submit']").disabled = won;

  els.list.replaceChildren();
  for (const [index, entry] of guesses.entries()) {
    const row = buildRow(entry);
    if (celebrate && index === 0 && won) {
      row.classList.add("guess-row--win");
    }
    els.list.append(row);
  }

  if (won) {
    renderVictory();
  } else {
    els.victory.hidden = true;
    els.victory.replaceChildren();
  }
}

function buildRow({ character, result }) {
  const row = document.createElement("article");
  row.className = "guess-row";
  row.setAttribute("aria-label", `Guess: ${character.name}`);

  row.append(buildPortrait(character));
  row.append(buildCell("Name", character.name, result.name));
  row.append(buildCell("Kingdom", character.kingdom.join(" / "), result.kingdom));
  row.append(buildCell("Gender", character.gender, result.gender));
  row.append(buildCell("Species", character.species.join(" / "), result.species));
  row.append(buildCell("1st Book", character.firstBook, result.firstBook));
  return row;
}

function buildPortrait(character) {
  const cell = document.createElement("div");
  cell.className = "cell cell--portrait";

  const frame = document.createElement("div");
  frame.className = "portrait";

  const initials = document.createElement("span");
  initials.className = "portrait__fallback";
  initials.textContent = initialsFor(character.name);
  frame.append(initials);

  const img = document.createElement("img");
  img.src = character.image;
  img.alt = character.name;
  img.loading = "lazy";
  img.addEventListener("error", () => {
    img.remove();
  });
  frame.append(img);

  cell.append(frame);
  return cell;
}

function buildCell(label, value, match) {
  const cell = document.createElement("div");
  cell.className = `cell cell--${match}`;
  cell.innerHTML = `<span class="cell__label">${label}</span><span class="cell__value">${escapeHtml(value)}</span>`;
  return cell;
}

function renderVictory() {
  els.victory.hidden = false;
  els.victory.innerHTML = `
    <div class="victory__portrait portrait portrait--large"></div>
    <div>
      <p class="victory__title">You found them.</p>
      <p class="victory__name">${escapeHtml(secret.name)}</p>
      <p class="victory__meta">${escapeHtml(secret.kingdom.join(" / "))} · ${escapeHtml(secret.gender)} · ${escapeHtml(secret.species.join(" / "))} · ${escapeHtml(secret.firstBook)}</p>
    </div>
  `;

  const frame = els.victory.querySelector(".victory__portrait");
  const initials = document.createElement("span");
  initials.className = "portrait__fallback";
  initials.textContent = initialsFor(secret.name);
  frame.append(initials);

  const img = document.createElement("img");
  img.src = secret.image;
  img.alt = secret.name;
  img.addEventListener("error", () => img.remove());
  frame.append(img);
}

function renderSuggestions(query) {
  const matches = suggestCharacters(query);
  activeSuggestion = -1;
  els.suggestions.replaceChildren();

  if (!query.trim() || matches.length === 0) {
    hideSuggestions();
    return;
  }

  els.suggestions.hidden = false;
  for (const character of matches) {
    const option = document.createElement("li");
    option.setAttribute("role", "option");
    option.dataset.name = character.name;
    option.textContent = character.name;
    els.suggestions.append(option);
  }
}

function highlightSuggestion(options) {
  options.forEach((option, index) => {
    option.setAttribute("aria-selected", String(index === activeSuggestion));
  });
}

function fillSuggestion(name) {
  els.input.value = name;
  hideSuggestions();
  els.input.focus();
}

function hideSuggestions() {
  activeSuggestion = -1;
  els.suggestions.hidden = true;
  els.suggestions.replaceChildren();
}

async function shareScore() {
  const chronological = [...guesses].reverse().map((entry) => entry.result);
  const text = formatShareText(chronological, {
    puzzleNumber,
    won,
    attempts: guesses.length,
  });

  const copied = await copyText(text);
  els.shareStatus.textContent = copied ? "Copied!" : "Could not copy. Select and copy the text yourself.";
  if (!copied) {
    window.prompt("Copy your score:", text);
  }
  window.setTimeout(() => {
    els.shareStatus.textContent = "";
  }, 2000);
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea fallback.
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.append(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  return ok;
}

function persist() {
  const payload = {
    dateKey,
    won,
    guessIds: guesses.map((entry) => entry.character.id).reverse(),
  };
  localStorage.setItem(STORAGE_PREFIX + dateKey, JSON.stringify(payload));
}

function restore() {
  const raw = localStorage.getItem(STORAGE_PREFIX + dateKey);
  if (!raw) return;

  try {
    const saved = JSON.parse(raw);
    if (saved.dateKey !== dateKey || !Array.isArray(saved.guessIds)) return;
    const characters = getCharacters();
    for (const id of saved.guessIds) {
      const character = characters.find((entry) => entry.id === id);
      if (!character) continue;
      guesses.unshift({ character, result: scoreGuess(character, secret) });
    }
    won = Boolean(saved.won) || guesses.some((entry) => entry.character.id === secret.id);
  } catch {
    localStorage.removeItem(STORAGE_PREFIX + dateKey);
  }
}

function showError(message) {
  els.error.textContent = message;
}

function clearError() {
  els.error.textContent = "";
}

function initialsFor(name) {
  return name
    .split(/\s+/)
    .filter((part) => !["of", "the"].includes(part.toLowerCase()))
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
