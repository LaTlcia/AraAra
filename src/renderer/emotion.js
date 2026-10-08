// 情绪：解析 AI 回复里的 [标签]，驱动表情、jobspine 动作、Q 版动作和漫符

// ---- 流式标签解析：[smug]哎呀♪[shy]…… → 段落序列 ----
export class TagStream {
  constructor(emotions) {
    this.lookup = new Map();
    for (const [k, v] of Object.entries(emotions)) {
      if (k.startsWith("_")) continue;
      this.lookup.set(k, k);
      (v.aliases || []).forEach((a) => this.lookup.set(a, k));
    }
    this.buf = "";
  }

  // 返回 [{type:"text", text} | {type:"tag", name}]
  push(chunk, final = false) {
    this.buf += chunk;
    const out = [];
    let text = "";
    const flush = () => { if (text) { out.push({ type: "text", text }); text = ""; } };
    let i = 0;
    while (i < this.buf.length) {
      const ch = this.buf[i];
      if (ch === "[" || ch === "【") {
        const close = this.buf.indexOf(ch === "[" ? "]" : "】", i + 1);
        if (close < 0) {
          // 标签可能被截断在 chunk 边界：短的先留着等下一段
          if (!final && this.buf.length - i < 16) break;
          text += ch;
          i++;
          continue;
        }
        const inner = this.buf.slice(i + 1, close).trim();
        const key = this.lookup.get(inner.toLowerCase()) || this.lookup.get(inner);
        if (key) {
          flush();
          out.push({ type: "tag", name: key });
          i = close + 1;
          continue;
        }
        if (/^\d{1,2}$/.test(inner)) { i = close + 1; continue; } // 联网搜索的引用角标 [1]
        text += ch;
        i++;
        continue;
      }
      text += ch;
      i++;
    }
    flush();
    this.buf = this.buf.slice(i);
    return out.map((seg) => (seg.type === "text" ? { ...seg, text: cleanText(seg.text) } : seg)).filter((s) => s.type === "tag" || s.text);
  }

  end() {
    return this.push("", true);
  }
}

function cleanText(t) {
  return t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*\*/g, "").replace(/^#{1,6}\s+/gm, "").replace(/```\w*/g, "");
}

// 把一段完整台词拆成段落（用于本地台词、/say 接口）
export function parseLine(text, emotions) {
  const ts = new TagStream(emotions);
  return [...ts.push(text), ...ts.end()];
}

// ---- 漫符 ----
const MANPU_SVG = {
  note: `<svg viewBox="0 0 32 32"><path fill="#ff5c9d" stroke="#fff" stroke-width="1.6" d="M12 6.5 25 3.5v17.2a4.4 3.6 -15 1 1-2.6-3.3V9.6l-7.8 1.8v12.3a4.4 3.6 -15 1 1-2.6-3.3z"/></svg>`,
  heart: `<svg viewBox="0 0 32 32"><path fill="#ff4f8f" stroke="#fff" stroke-width="1.8" d="M16 28S3.5 20.4 3.5 11.6A6.6 6.6 0 0 1 16 8.3a6.6 6.6 0 0 1 12.5 3.3C28.5 20.4 16 28 16 28z"/><path fill="#fff" opacity=".7" d="M8.4 10.3c.8-1.6 2.6-2.4 4-2"/></svg>`,
  anger: `<svg viewBox="0 0 32 32"><g fill="none" stroke="#e8203c" stroke-width="3.2" stroke-linecap="round"><path d="M5 12.5c4 .3 6.2-1.8 6.5-6.5"/><path d="M27 12.5c-4 .3-6.2-1.8-6.5-6.5"/><path d="M5 19.5c4-.3 6.2 1.8 6.5 6.5"/><path d="M27 19.5c-4-.3-6.2 1.8-6.5 6.5"/></g></svg>`,
  sweat: `<svg viewBox="0 0 32 32"><path fill="#7cc4ff" stroke="#fff" stroke-width="1.6" d="M16 3.5c4.6 7 8 11.4 8 15.6a8 8 0 0 1-16 0c0-4.2 3.4-8.6 8-15.6z"/><path fill="#fff" opacity=".75" d="M12.2 18.5c.2-2 1.3-4 2.4-5.4-.4 1.9-.6 3.6-.3 5.6z"/></svg>`,
  exclaim: `<svg viewBox="0 0 32 32"><path fill="#ff9f1c" stroke="#fff" stroke-width="1.6" d="M12.6 3.5h6.8l-1.6 17h-3.6zM16 22.5a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6z"/></svg>`,
  question: `<svg viewBox="0 0 32 32"><path fill="#8f7cff" stroke="#fff" stroke-width="1.6" d="M9 11.2C9 6.6 12.2 3.5 16.4 3.5c4.3 0 7.4 2.8 7.4 6.6 0 3-1.8 4.6-3.9 6-1.7 1.1-2.2 1.9-2.2 3.6v.8h-4.9v-1.3c0-2.6.9-4 3-5.4 1.6-1.1 2.5-1.9 2.5-3.4 0-1.6-1.3-2.7-3-2.7-1.9 0-3.2 1.3-3.4 3.5zM15.3 23.6a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/></svg>`,
  dots: `<svg viewBox="0 0 32 32"><g fill="#9b8a93"><circle cx="7" cy="18" r="2.6"/><circle cx="16" cy="18" r="2.6"/><circle cx="25" cy="18" r="2.6"/></g></svg>`,
  zzz: `<svg viewBox="0 0 32 32"><g fill="#7f9cff" stroke="#fff" stroke-width="1.2" font-family="Arial Black,Arial" font-weight="900"><text x="2" y="28" font-size="14">Z</text><text x="12" y="19" font-size="11">z</text><text x="21" y="11" font-size="9">z</text></g></svg>`,
  sparkle: `<svg viewBox="0 0 32 32"><path fill="#ffc83d" stroke="#fff" stroke-width="1.4" d="M16 2.5l2.8 10.7L29.5 16l-10.7 2.8L16 29.5l-2.8-10.7L2.5 16l10.7-2.8z"/><path fill="#ffe08a" d="M26 3.5l.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1-3.1-.9 3.1-.9z"/></svg>`,
};

export class Manpu {
  constructor(layer) {
    this.layer = layer;
    this.el = null;
    this.timer = null;
  }

  show(kind, point, duration = 2600) {
    this.hide();
    if (!kind || !MANPU_SVG[kind]) return;
    const el = document.createElement("div");
    el.className = `manpu ${kind}`;
    el.innerHTML = MANPU_SVG[kind];
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    this.layer.appendChild(el);
    this.el = el;
    this.timer = setTimeout(() => this.hide(), duration);
  }

  hide() {
    clearTimeout(this.timer);
    const el = this.el;
    if (!el) return;
    this.el = null;
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 300);
  }
}
