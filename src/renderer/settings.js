// 设置窗口
const api = window.pet || (await import("./dev-shim.js")).default;
const init = await api.init();
const { data: DATA, emotions: EMOTIONS } = init;
let settings = await api.getSettings();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ---- 标签页 ----
function showTab(name) {
  if (!document.getElementById(`tab-${name}`)) name = "chat";
  $$(".tab").forEach((t) => t.classList.toggle("on", t.id === `tab-${name}`));
  $$("nav a").forEach((a) => a.classList.toggle("on", a.dataset.tab === name));
  if (name === "history") renderHistory();
}
addEventListener("hashchange", () => showTab(location.hash.slice(1)));
api.onSettingsTab((tab) => { location.hash = tab; });
showTab(location.hash.slice(1) || "chat");

// ---- 表单 ----
const costumeSel = document.querySelector('[name="costume"]');
for (const c of DATA.costumes) {
  const o = document.createElement("option");
  o.value = c.id;
  o.textContent = `${c.nameZh}（${c.name}）`;
  costumeSel.appendChild(o);
}

const ACTIVITY = ["", "安静", "普通", "活泼", "超活泼"];
const API_HINT = "地址填到 /chat/completions 之前，一般以 /v1 结尾。";
// 支持 "chibiActions.walk" 这种嵌套字段
const getField = (k) => k.split(".").reduce((o, p) => (o == null ? undefined : o[p]), settings);
function patchFor(k, v) {
  const [top, sub] = k.split(".");
  return sub ? { [top]: { ...(settings[top] || {}), [sub]: v } } : { [k]: v };
}

function fill() {
  for (const el of $$("[name]")) {
    const k = el.name;
    if (k === "apiKey") {
      el.placeholder = settings.hasApiKey ? "已保存（留空则不修改）" : "本地模型（Ollama 等）可以不填";
      continue;
    }
    const v = getField(k);
    if (el.type === "checkbox") el.checked = Boolean(v);
    else if (el.type === "radio") el.checked = String(v) === el.value;
    else if (document.activeElement !== el) el.value = v ?? "";
  }
  for (const box of $$("[data-show]")) {
    const [k, v] = box.dataset.show.split("=");
    box.hidden = String(getField(k)) !== v;
  }
  $("#api-hint").textContent = API_HINT;
  $("#scale-value").textContent = `${Math.round(settings.scale * 100)}%`;
  $("#activity-value").textContent = ACTIVITY[settings.chibiActivity] || "";
}
fill();

let savedTimer;
async function save(patch) {
  settings = await api.setSettings(patch);
  fill();
  $("#saved").classList.add("show");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => $("#saved").classList.remove("show"), 1200);
}

const NUMBER = new Set(["replyMaxChars", "historyTurns", "idleTalkMinutes", "apiPort", "costume", "chibiIdleSeconds", "chibiActivity", "chatAutoClose"]);
document.querySelector('[name="chibiActivity"]').addEventListener("input", (e) => {
  $("#activity-value").textContent = ACTIVITY[Number(e.target.value)];
});

// 大小滑块：拖动时实时生效（节流）
const scaleEl = document.querySelector('[name="scale"]');
let scaleTimer = null, scalePending = null;
scaleEl.addEventListener("input", () => {
  const v = Number(scaleEl.value);
  $("#scale-value").textContent = `${Math.round(v * 100)}%`;
  scalePending = v;
  if (scaleTimer) return;
  scaleTimer = setTimeout(() => { scaleTimer = null; save({ scale: scalePending }); }, 120);
});

for (const el of $$("[name]")) {
  if (el === scaleEl) continue;
  const evt = el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio"].includes(el.type)) ? "change" : "input";
  el.addEventListener(evt, () => {
    const k = el.name;
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "radio") { if (!el.checked) return; v = el.value; }
    else v = el.value;
    if (NUMBER.has(k)) v = Number(v);
    if (k === "apiKey") {
      if (!v.trim()) return;
      v = v.trim();
      el.value = "";
    }
    save(patchFor(k, v));
  });
}

$("#test").addEventListener("click", async () => {
  const btn = $("#test"), out = $("#test-result");
  btn.disabled = true;
  out.className = "hint";
  out.textContent = "连接中…";
  const r = await api.testApi();
  btn.disabled = false;
  if (r.ok) {
    out.className = "ok";
    out.textContent = `✓ ${r.text.replace(/\[[a-z]+\]/g, "").slice(0, 60)}`;
  } else {
    out.className = "bad";
    out.textContent = `✗ ${r.error.slice(0, 160)}`;
  }
});

$("#reset").addEventListener("click", async () => {
  if (!confirm("清空和亚罗椰的对话记忆？")) return;
  await api.chatReset();
  renderHistory();
});
$("#userdata").addEventListener("click", () => api.openUserData());

api.onSettings((s) => { settings = s; fill(); renderApi(); });

// ---- 情绪接口说明 ----
function renderApi() {
  const port = settings.apiPort || 47210;
  $("#api-examples").textContent = [
    "# 做表情（可带台词）",
    `curl -X POST http://127.0.0.1:${port}/emote -H "Content-Type: application/json" \\`,
    `     -d '{"emotion":"shy","text":"……别一直盯着我看嘛。"}'`,
    "",
    "# 说一段话，台词里可以夹情绪标签",
    `curl -X POST http://127.0.0.1:${port}/say -H "Content-Type: application/json" \\`,
    `     -d '{"text":"[smug]哎呀，被我抓到了♪[shy]……才没有害羞。"}'`,
    "",
    "# 当作主人说的话交给 AI，返回她的回复",
    `curl -X POST http://127.0.0.1:${port}/chat -H "Content-Type: application/json" \\`,
    `     -d '{"message":"今天也辛苦了"}'`,
  ].join("\n");
  const tbody = $("#emo-table");
  tbody.innerHTML = "";
  for (const [k, v] of Object.entries(EMOTIONS)) {
    if (k.startsWith("_")) continue;
    const tr = document.createElement("tr");
    for (const cell of [k, v.label, v.face, v.motion, v.chibi]) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}
renderApi();

// ---- 对话记录 ----
async function renderHistory() {
  const box = $("#history");
  const history = await api.chatHistory();
  box.innerHTML = "";
  if (!history.length) {
    box.innerHTML = `<div class="empty">还没有聊过天。双击亚罗椰开始对话吧。</div>`;
    return;
  }
  for (const m of history) {
    const div = document.createElement("div");
    div.className = `msg ${m.role}`;
    if (m.role === "user") {
      const msg = /<message[^>]*>\n?([\s\S]*?)\n?<\/message>/.exec(m.content)?.[1] ?? m.content;
      const ev = /<events>\n?([\s\S]*?)\n?<\/events>/.exec(m.content)?.[1];
      if (ev) {
        const e = document.createElement("span");
        e.className = "ev";
        e.textContent = `（${ev.split("\n").join("；")}）`;
        div.appendChild(e);
      }
      div.appendChild(document.createTextNode(msg));
    } else {
      for (const part of m.content.split(/(\[[a-z]+\])/)) {
        if (/^\[[a-z]+\]$/.test(part) && EMOTIONS[part.slice(1, -1)]) {
          const t = document.createElement("span");
          t.className = "tag";
          t.textContent = EMOTIONS[part.slice(1, -1)].label;
          div.appendChild(t);
        } else if (part) {
          div.appendChild(document.createTextNode(part));
        }
      }
    }
    box.appendChild(div);
  }
  box.scrollTop = box.scrollHeight;
}
