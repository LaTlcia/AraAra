// 世界书（character_book）：常驻条目 + 关键词触发条目
const POSITIONS = ["before_char", "after_char", "near_message"];
const ST_POSITIONS = { 0: "before_char", 1: "after_char", 2: "near_message", 3: "near_message",
  4: "near_message", 5: "before_char", 6: "after_char" };
const AND_ANY = 0, NOT_ALL = 1, NOT_ANY = 2, AND_ALL = 3;

function position(entry, ext) {
  let value = ext.position ?? entry.position ?? "after_char";
  if (typeof value === "number") return ST_POSITIONS[value] || "after_char";
  if (value === "at_depth") value = "near_message";
  return POSITIONS.includes(value) ? value : "after_char";
}

function keys(value) {
  if (typeof value === "string") return value.split(",").map((k) => k.trim()).filter(Boolean);
  return (value || []).map(String).filter((k) => k.trim());
}

function normalizeEntry(e, index) {
  const ext = e.extensions || {};
  return {
    id: e.id ?? e.uid ?? index,
    name: e.name || e.comment || "",
    keys: keys(e.keys ?? e.key),
    secondary_keys: keys(e.secondary_keys ?? e.keysecondary),
    selective_logic: Number(ext.selectiveLogic ?? e.selectiveLogic ?? AND_ANY),
    content: typeof e.content === "string" ? e.content : "",
    enabled: (e.enabled ?? !e.disable) !== false,
    constant: e.constant === true,
    position: position(e, ext),
    insertion_order: Number(e.insertion_order ?? e.order ?? 100),
    case_sensitive: Boolean(e.case_sensitive ?? ext.case_sensitive ?? false),
    whole_words: Boolean(ext.match_whole_words ?? e.matchWholeWords ?? false),
    probability: Number(ext.probability ?? e.probability ?? 100),
  };
}

function normalizeBook(book) {
  if (!book || typeof book !== "object") return { name: "", recursive_scanning: false, entries: [] };
  let entries = book.entries || [];
  if (!Array.isArray(entries)) entries = Object.values(entries);
  return {
    name: book.name || "",
    recursive_scanning: book.recursive_scanning === true,
    entries: entries.filter((e) => e && typeof e === "object").map(normalizeEntry),
  };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function matcher(key, caseSensitive, wholeWords) {
  const regex = /^\/(.+)\/([a-z]*)$/s.exec(key);
  if (regex) {
    try {
      const flags = regex[2].replace(/[^ism]/g, "");
      const re = new RegExp(regex[1], flags);
      return (text) => re.test(text);
    } catch {
      return () => false;
    }
  }
  const needle = key.trim();
  if (!needle) return () => false;
  if (wholeWords && /^[A-Za-z0-9_\s'-]+$/.test(needle)) {
    const re = new RegExp(`(?:^|[^A-Za-z0-9_])${escapeRe(needle)}(?:$|[^A-Za-z0-9_])`, caseSensitive ? "" : "i");
    return (text) => re.test(text);
  }
  if (caseSensitive) return (text) => text.includes(needle);
  const lower = needle.toLowerCase();
  return (text) => text.toLowerCase().includes(lower);
}

function matches(entry, text) {
  const match = (key) => matcher(key, entry.case_sensitive, entry.whole_words)(text);
  if (!entry.keys.some(match)) return false;
  if (!entry.secondary_keys.length) return true;
  const hits = entry.secondary_keys.map(match);
  switch (entry.selective_logic) {
    case NOT_ALL: return !hits.every(Boolean);
    case NOT_ANY: return !hits.some(Boolean);
    case AND_ALL: return hits.every(Boolean);
    default: return hits.some(Boolean);
  }
}

function activateEntries(book, scanText, budgetChars = 6000) {
  const entries = (book.entries || []).filter((e) => e.enabled && e.content.trim());
  const active = new Map();
  entries.forEach((entry, i) => {
    if (entry.constant) active.set(i, "constant");
    else if (entry.keys.length && matches(entry, scanText)) active.set(i, "keyword");
  });
  if (book.recursive_scanning) {
    for (let depth = 0; depth < 3; depth++) {
      const source = [...active.keys()].map((i) => entries[i].content).join("\n");
      const added = entries.map((e, i) => i).filter((i) => !active.has(i) && entries[i].keys.length && matches(entries[i], source));
      if (!added.length) break;
      added.forEach((i) => active.set(i, "recursive"));
    }
  }
  const passed = [...active.entries()].filter(([i]) => entries[i].probability >= 100 || Math.random() * 100 < entries[i].probability);
  passed.sort((a, b) => entries[b[0]].insertion_order - entries[a[0]].insertion_order);
  const kept = [];
  let used = 0;
  for (const [i, reason] of passed) {
    const len = entries[i].content.length;
    if (kept.length && used + len > budgetChars) continue;
    used += len;
    kept.push([i, reason]);
  }
  kept.sort((a, b) => entries[a[0]].insertion_order - entries[b[0]].insertion_order);
  return {
    constant: kept.filter(([, r]) => r === "constant").map(([i]) => entries[i]),
    triggered: kept.filter(([, r]) => r !== "constant").map(([i]) => entries[i]),
  };
}

module.exports = { normalizeBook, activateEntries };
