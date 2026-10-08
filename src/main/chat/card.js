// 角色卡：SillyTavern 格式 chara_card_v3，V1/V2 也能读
const fs = require("node:fs");
const { normalizeBook } = require("./lorebook");

const TEXT_FIELDS = ["name", "description", "personality", "scenario", "mes_example",
  "system_prompt", "post_history_instructions", "creator_notes"];

function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") throw new Error("角色卡必须是 JSON 对象");
  const data = raw.data && typeof raw.data === "object" ? raw.data : raw;
  const card = {};
  for (const key of TEXT_FIELDS) card[key] = typeof data[key] === "string" ? data[key] : "";
  if (!card.name.trim()) throw new Error("角色卡缺少 name");
  const depth = (data.extensions || {}).depth_prompt || {};
  card.depth_prompt = typeof depth === "object" && typeof depth.prompt === "string" ? depth.prompt : "";
  card.book = normalizeBook(data.character_book);
  return card;
}

function loadCard(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  return normalizeCard(JSON.parse(text));
}

// ---- 宏（SillyTavern 宏的子集），未知宏原样保留 ----
const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const TRIM = "\x00TRIM\x00";
const pad = (n) => String(n).padStart(2, "0");

function roll(spec) {
  const m = /^(\d*)d(\d+)$/i.exec(spec.trim()) || /^()(\d+)$/.exec(spec.trim());
  if (!m || !Number(m[2])) return null;
  const count = Math.min(Number(m[1] || 1), 100);
  let sum = 0;
  for (let i = 0; i < count; i++) sum += 1 + Math.floor(Math.random() * Number(m[2]));
  return String(sum);
}

function expandMacros(text, values, now = new Date()) {
  if (!text) return "";
  const builtins = {
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    date: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`,
    weekday: WEEKDAYS[now.getDay()],
    isodate: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    isotime: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    newline: "\n",
  };
  const table = { ...builtins };
  for (const [k, v] of Object.entries(values)) table[k.toLowerCase()] = v;

  const replace = (whole, inner) => {
    const raw = inner.trim();
    const key = raw.toLowerCase();
    if (key.startsWith("//")) return "";
    if (key === "trim") return TRIM;
    if (key in table) return String(table[key]);
    const idx = raw.indexOf(":");
    if (idx > 0) {
      const name = raw.slice(0, idx).trim().toLowerCase();
      const arg = raw.slice(idx + 1);
      if (name === "random" || name === "pick") {
        const opts = (arg.includes("::") ? arg.split("::") : arg.split(",")).map((s) => s.trim());
        return opts[Math.floor(Math.random() * opts.length)];
      }
      if (name === "roll") return roll(arg) || whole;
    }
    return whole;
  };

  let out = text.split("<USER>").join(String(table.user ?? "")).split("<BOT>").join(String(table.char ?? ""));
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = out.replace(/\{\{([^{}]*)\}\}/g, replace);
    if (out === before) break;
  }
  return out.replace(new RegExp(`\\s*${TRIM}\\s*`, "g"), "");
}

module.exports = { loadCard, normalizeCard, expandMacros };
