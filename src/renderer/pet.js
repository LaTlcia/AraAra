// 亚罗椰桌宠 · 渲染进程
import { createApp, JobPet, ChibiPet } from "./stage.js";
import { TagStream, parseLine, Manpu } from "./emotion.js";
import * as R from "./reactions.js";
import { ChibiBrain } from "./chibi-brain.js";
import { Bed } from "./bed.js";
import { SleepFx } from "./sleep-fx.js";

const ASSETS = "../../assets";
const api = window.pet || (await import("./dev-shim.js")).default;

const $ = (sel) => document.querySelector(sel);
const stageEl = $("#stage");
const bubbleEl = $("#bubble");
const toolsEl = $("#tools");
const chatbar = $("#chatbar");
const chatInput = $("#chat-input");
const wardrobeEl = $("#wardrobe");

const init = await api.init();
let settings = init.settings;
const DATA = init.data;
const EMOTIONS = init.emotions;
const LAYOUT = init.layout;
let ui = 1;                 // 界面缩放（气泡、按钮、输入框），随大小变化但幅度更小

const app = createApp(stageEl);
const manpu = new Manpu($("#manpu"));
const bed = new Bed(app);            // Q 版睡觉用的小床
const sleepFx = new SleepFx($("#manpu"));
let pet = null;
let anchor = null;          // 角色在窗口里的位置（布局时计算）
let lastInteraction = Date.now();
let pendingEvents = [];     // 还没告诉 AI 的互动

const costumeOf = (id) => DATA.costumes.find((c) => c.id === id) || DATA.costumes[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// 布局
// ============================================================
function layout() {
  const W = innerWidth, H = innerHeight;
  const L = LAYOUT[settings.mode] || LAYOUT.job;
  ui = Math.min(LAYOUT.uiMax, Math.max(LAYOUT.uiMin, Math.sqrt(settings.scale)));
  document.documentElement.style.setProperty("--ui", ui.toFixed(3));
  document.documentElement.style.setProperty("--stage-h", `${Math.max(40, H - L.topReserve * ui)}px`);
  app.resize();
  if (!pet?.spine) return;
  pet.layout();
  const stageTop = stageEl.offsetTop;
  const b = pet.spine.getBounds();
  anchor = {
    stageTop,
    top: stageTop + b.top,
    left: b.left,
    right: b.right,
    centerX: b.left + b.width / 2,
  };
  const gap = 8 * ui;
  bubbleEl.style.setProperty("--bubble-bottom", `${H - anchor.top + gap}px`);
  bubbleEl.style.setProperty("--bubble-max-h", `${Math.max(60, anchor.top - 40 * ui)}px`);
  // 悬浮按钮放在头部高度、身体右侧
  const head = toWindow(pet.headPoint());
  const charH = stageEl.clientHeight;
  const x = settings.mode === "job" ? head.x + charH * 0.2 : head.x + charH * 0.28;
  toolsEl.style.left = `${Math.min(W - 34 * ui, x)}px`;
  toolsEl.style.top = `${Math.max(4, head.y - 30 * ui)}px`;
}
const toWindow = (p) => ({ x: p.x, y: p.y + (anchor?.stageTop ?? stageEl.offsetTop) });
addEventListener("resize", () => layout());

// ============================================================
// 角色
// ============================================================
async function loadPet() {
  const costume = costumeOf(settings.costume);
  const Kind = settings.mode === "chibi" && costume.chibi ? ChibiPet : JobPet;
  if (!pet || !(pet instanceof Kind)) {
    if (pet) {
      pet.destroy();
      if (pet.spine) { app.stage.removeChild(pet.spine); pet.spine.destroy({ children: true }); }
    }
    pet = new Kind(app);
  }
  await pet.load(costume, ASSETS);
  if (pet.kind === "chibi") bed.attach(pet.spine);
  else bed.detach();
  layout();
  if (pet.kind === "chibi") brain.reset();
  else brain.interrupt();
}

// ============================================================
// 情绪表演
// ============================================================
let currentEmotion = "normal";
let restTimer = null;

function manpuPoint() {
  const h = toWindow(pet.headPoint());
  const charH = stageEl.clientHeight;
  return settings.mode === "job"
    ? { x: h.x + charH * 0.1, y: h.y - charH * 0.16 }
    : { x: h.x + charH * 0.12, y: h.y - charH * 0.3 };
}

function perform(tag, { speaking = false, hold = 0 } = {}) {
  const e = EMOTIONS[tag];
  if (!e || !pet?.spine) return;
  // 睡着时「困倦」（梦话）不会吵醒她；其它情绪会（立绘先惊醒再做动作，Q 版先起床）
  if (tag === "sleepy" && inSleepMode()) return;
  currentEmotion = tag;
  clearTimeout(restTimer);
  pet.setFace(e.face);
  if (pet.kind === "job") {
    if (e.motion !== "Base" || pet.motionName !== "Base") pet.playMotion(e.motion, { loopSeconds: hold || 2.6 });
    if (speaking) pet.holdMotion();
  } else if (!drag) {
    // 被鼠标拎着的时候只换表情：情绪动作会让她自己跳起来、落地，和拖动抢窗口位置
    brain.emote(e.chibi);
  }
  manpu.show(e.manpu, manpuPoint(), speaking ? 3200 : 2400);
  if (!speaking) scheduleRest(hold ? hold * 1000 + 3000 : 6000);
}

function scheduleRest(ms) {
  clearTimeout(restTimer);
  restTimer = setTimeout(() => {
    if (speaker.active && !speaker.el.hidden && speaker.typingTimer) return scheduleRest(2000);
    if (sleepingNow()) return;
    currentEmotion = "normal";
    pet?.setFace(R.isNight() ? "HalfEye_Normal" : "Normal");
  }, ms);
}

// ============================================================
// 气泡 / 打字机
// ============================================================
class Speaker {
  constructor(el) {
    this.el = el;
    this.textEl = el.querySelector(".bubble-text");
    this.bodyEl = el.querySelector(".bubble-body");
    this.queue = [];
    this.active = false;     // 正在显示一段台词
    this.streamDone = true;
    this.typingTimer = null;
    this.hideTimer = null;
    this.hovered = false;
    el.addEventListener("mouseenter", () => { this.hovered = true; clearTimeout(this.hideTimer); });
    el.addEventListener("mouseleave", () => { this.hovered = false; if (this.active && this.streamDone && !this.queue.length) this.hideLater(); });
    el.addEventListener("click", () => this.skip());
  }

  show() {
    clearTimeout(this.hideTimer);
    this.el.hidden = false;
    this.el.classList.remove("leaving", "error");
  }

  // 开始一段新台词；thinking = 等 AI 时的省略号
  begin({ thinking = false } = {}) {
    clearTimeout(this.typingTimer);
    this.typingTimer = null;
    this.queue = [];
    this.textEl.textContent = "";
    this.active = true;
    this.performedAny = false;
    this.streamDone = false;
    this.show();
    this.el.classList.toggle("thinking", thinking);
    this.el.classList.toggle("typing", !thinking);
  }

  feed(segments) {
    if (!segments.length) return;
    this.queue.push(...segments);
    this.el.classList.remove("thinking");
    this.el.classList.add("typing");
    if (!this.typingTimer) this.step();
  }

  finish() {
    this.streamDone = true;
    if (!this.typingTimer && !this.queue.length) this.done();
  }

  say(text) {
    this.begin();
    this.feed(parseLine(text, EMOTIONS));
    this.finish();
  }

  error(message) {
    this.begin();
    this.el.classList.remove("typing", "thinking");
    this.el.classList.add("error");
    this.textEl.textContent = `⚠ ${message}`;
    this.streamDone = true;
    this.done(6000);
  }

  step() {
    this.typingTimer = null;
    const seg = this.queue[0];
    if (!seg) {
      pet?.setTalking(false);
      if (this.streamDone) this.done();
      return;
    }
    if (seg.type === "tag") {
      this.queue.shift();
      this.performedAny = true;
      perform(seg.name, { speaking: true });
      this.typingTimer = setTimeout(() => this.step(), 60);
      return;
    }
    if (!this.textEl.textContent && !this.performedAny) perform("normal", { speaking: true });
    const ch = seg.text[0];
    seg.text = seg.text.slice(1);
    if (!seg.text) this.queue.shift();
    if (!(this.textEl.textContent === "" && /\s/.test(ch))) this.textEl.textContent += ch;
    this.bodyEl.scrollTop = this.bodyEl.scrollHeight;
    pet?.setTalking(!/[\s…。！？!?，,、]/.test(ch));
    const delay = /[。！？!?\n]/.test(ch) ? 260 : /[，,、；;：:…—]/.test(ch) ? 140 : /[a-zA-Z0-9]/.test(ch) ? 24 : 42;
    this.typingTimer = setTimeout(() => this.step(), delay);
  }

  skip() {
    if (this.queue.length) {
      for (const seg of this.queue) {
        if (seg.type === "tag") perform(seg.name, { speaking: true });
        else this.textEl.textContent += seg.text;
      }
      this.queue = [];
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
      if (this.streamDone) this.done();
    } else if (this.streamDone) {
      this.hide();
    }
  }

  done(ms) {
    this.el.classList.remove("typing");
    pet?.setTalking(false);
    if (pet?.kind === "job") pet.releaseMotion(1.4);
    scheduleRest(5000);
    const len = this.textEl.textContent.length;
    this.hideLater(ms ?? Math.min(16000, 3000 + len * 130));
  }

  hideLater(ms = 3000) {
    clearTimeout(this.hideTimer);
    if (this.hovered) return;
    this.hideTimer = setTimeout(() => this.hide(), ms);
  }

  hide() {
    clearTimeout(this.hideTimer);
    this.active = false;
    scheduleRest(1200);
    if (this.el.hidden) return;
    this.el.classList.add("leaving");
    setTimeout(() => { if (this.el.classList.contains("leaving")) this.el.hidden = true; }, 180);
  }
}
const speaker = new Speaker(bubbleEl);

// 本地台词：AI 正在回复时不插嘴，只做表情
function say(text, { force = false } = {}) {
  if (!text) return;
  if (!force && (chatState.busy || (speaker.active && !speaker.streamDone))) {
    const first = parseLine(text, EMOTIONS).find((s) => s.type === "tag");
    if (first && !chatState.busy) perform(first.name);
    return;
  }
  speaker.say(text);
}

// ============================================================
// 对话
// ============================================================
let chatState = { id: 0, stream: null, busy: false };

function desktopLines(extra = []) {
  const now = new Date();
  const wd = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const c = costumeOf(settings.costume);
  return [
    `当前时间：${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()} 星期${wd} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    `你现在穿着：${c.nameZh}（${c.name}）`,
    `你现在的样子：${settings.mode === "job" ? "立绘" : "Q 版小人（在桌面底部走来走去）"}`,
    ...(pet?.kind === "chibi" && brain.action ? [`你刚才在做的事：${R.CHIBI_ACTION_NAMES[brain.action.replace(/^emote:/, "")] || "活动"}`] : []),
    ...(nap.wokeAt && Date.now() - nap.wokeAt < 180000
      ? [nap.wokeBy === "user" ? "你刚才在睡觉，被主人叫醒了" : "你刚刚睡醒"] : []),
    `你刚才的情绪：${EMOTIONS[currentEmotion]?.label || "平静"}`,
    ...extra,
  ];
}

function takeEvents() {
  const ev = pendingEvents;
  pendingEvents = [];
  // 合并相同的连续事件：摸了摸你的头 ×3
  const merged = [];
  for (const e of ev) {
    const last = merged[merged.length - 1];
    if (last && last.text === e) last.n++;
    else merged.push({ text: e, n: 1 });
  }
  return merged.map((m) => (m.n > 1 ? `${m.text}（${m.n} 次）` : m.text));
}

async function sendChat(text, { extraDesktop = [] } = {}) {
  if (!settings.chatReady) {
    say(R.line("noKey"), { force: true });
    return { error: "还没有填写接口地址和模型" };
  }
  lastInteraction = Date.now();
  chatState.stream = new TagStream(EMOTIONS);
  chatState.busy = true;
  chatbar.classList.add("busy");
  speaker.begin({ thinking: true });
  if (pet?.kind === "job") { pet.setFace("Normal"); pet.playMotion("Think", { loopSeconds: 30 }); pet.holdMotion(); }
  const result = await api.chatSend({ text, events: takeEvents(), desktop: desktopLines(extraDesktop) });
  chatState.busy = false;
  chatbar.classList.remove("busy");
  return result;
}

api.onChatEvent((ev) => {
  if (ev.type === "start") { chatState.id = ev.id; return; }
  if (ev.id !== chatState.id || !chatState.stream) return;
  switch (ev.type) {
    case "delta":
      speaker.feed(chatState.stream.push(ev.delta));
      break;
    case "done":
      speaker.feed(chatState.stream.end());
      speaker.finish();
      if (!ev.reply) speaker.error("没有收到回复");
      touchChat();
      break;
    case "aborted":
      speaker.feed(chatState.stream.end());
      speaker.finish();
      touchChat();
      break;
    case "error":
      if (pet?.kind === "job") pet.releaseMotion(0.2);
      perform("trouble");
      speaker.error(ev.error.length > 120 ? `${ev.error.slice(0, 120)}…` : ev.error);
      touchChat();
      break;
  }
});

// ---- 输入框 ----
// 一段时间没有对话就自动收起（设置里的 chatAutoClose 秒，0 = 不自动关闭）；没发出去的字会保留
let chatIdleTimer = null;
let lastTypingAt = 0;
function touchChat() {
  clearTimeout(chatIdleTimer);
  const sec = Number(settings.chatAutoClose) || 0;
  if (chatbar.hidden || !sec) return;
  chatIdleTimer = setTimeout(() => {
    // AI 还在回复、气泡还在打字时顺延
    if (chatState.busy || speaker.typingTimer || (speaker.active && !speaker.streamDone)) return touchChat();
    closeChat();
  }, sec * 1000);
}
// 正在打字（最近几秒按过键，或者框里有没发出去的字）时，Q 版不自己乱跑
const chatTyping = () => !chatbar.hidden && (chatInput.value.trim() !== "" || Date.now() - lastTypingAt < 8000);

function openChat() {
  wardrobeEl.hidden = true;
  chatbar.hidden = false;
  lastInteraction = Date.now();
  wakeUp("chat");
  if (pet?.kind === "chibi") brain.interrupt();
  api.ensureVisible();
  setInteractive(true);
  api.focus();
  setTimeout(() => chatInput.focus(), 30);
  touchChat();
}
function closeChat() {
  clearTimeout(chatIdleTimer);
  chatbar.hidden = true;
  chatInput.blur();
}
$("#chat-close").addEventListener("click", () => closeChat());
chatbar.addEventListener("submit", (e) => {
  e.preventDefault();
  if (chatState.busy) { api.chatAbort(); return; }
  const text = chatInput.value.trim();
  if (!text) return;
  chatInput.value = "";
  touchChat();
  if (text === "/reset") { api.chatReset().then(() => say("[smug]……刚才的事我就当没听过好了♪")); return; }
  sendChat(text);
});
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") return closeChat();
  lastTypingAt = Date.now();
  lastInteraction = Date.now();
  touchChat();
});
api.onOpenChat(() => openChat());

// 外部程序通过情绪接口发来的消息
api.onExternalChat(async (message) => {
  const res = await sendChat(message);
  api.externalChatDone(res.error ? { error: res.error } : { reply: res.reply });
});
api.onEmote(({ emotion, text, duration }) => {
  lastInteraction = Date.now();
  if (text) say(`[${emotion}]${text}`, { force: true });
  else perform(emotion, { hold: duration || 0 });
});
api.onSay(({ text }) => { lastInteraction = Date.now(); say(/^\s*[[【]/.test(text) ? text : `[normal]${text}`, { force: true }); });

// ============================================================
// 互动：点击区域、摸头、拖动
// ============================================================
function regionAt(x, y) {
  const sk = pet.spine.skeleton;
  const gy = (name) => {
    const b = sk.findBone(name);
    return b ? toWindow(pet.spine.toGlobal(new PIXI.Point(b.worldX, b.worldY))).y : 0;
  };
  if (pet.kind === "job") {
    const eye = gy("EyeLook"), neck = gy("Neck"), hip = gy("Hip");
    if (y < eye - 6) return "head";
    if (y < neck) return "face";
    if (y < hip + (hip - neck) * 0.15) return "body";
    return "legs";
  }
  const head = gy("Head"), body = gy("Body");
  if (y < head - (body - head) * 0.15) return "head";
  if (y < head + (body - head) * 0.55) return "face";
  return "body";
}

let pokeCount = 0, pokeTimer = null;
let patCount = 0, patTimer = null;

function interact(kind) {
  lastInteraction = Date.now();
  const ai = settings.aiInteractions && settings.chatReady;
  const log = {
    patHead: "摸了摸你的头",
    petting: "一直在温柔地摸你的头",
    pokeCheek: "戳了戳你的脸",
    pokeBody: "戳了戳你的身体",
    pokeLegs: "碰了碰你的腿",
    dragStart: "用鼠标把你拎了起来",
    drop: "把你放到了屏幕上的另一个地方",
    dropFar: "拎着你在屏幕上晃来晃去了好一阵，才把你放下",
  }[kind];
  if (log) pendingEvents.push(log);
  if (pendingEvents.length > 30) pendingEvents = pendingEvents.slice(-30);

  let text = "";
  switch (kind) {
    case "patHead":
      patCount++;
      clearTimeout(patTimer);
      patTimer = setTimeout(() => { patCount = 0; }, 8000);
      text = R.line(patCount >= 3 ? "patMany" : "patHead");
      break;
    case "petting": text = R.line("patMany"); break;
    case "pokeCheek":
      pokeCount++;
      clearTimeout(pokeTimer);
      pokeTimer = setTimeout(() => { pokeCount = 0; }, 10000);
      text = R.pokeLine(pokeCount);
      break;
    default: text = R.line(kind);
  }
  if (ai && kind !== "dragStart") {
    // 立刻给个表情，台词交给 AI（攒一会儿再一起发）
    const first = parseLine(text, EMOTIONS).find((s) => s.type === "tag");
    if (first) perform(first.name);
    clearTimeout(interact.timer);
    interact.timer = setTimeout(() => { if (!chatState.busy) sendChat(""); }, 1800);
    return;
  }
  say(text);
}

// ---- 鼠标穿透：只有角色像素和 UI 上才接收鼠标 ----
let interactive = false;
function setInteractive(on) {
  if (on === interactive) return;
  interactive = on;
  api.ignoreMouse(!on);
}

// 悬浮按钮：鼠标在角色身上时出现；离开后留一会儿，方便移到按钮上
let toolsOn = false, toolsHideTimer = null;
function showTools(on) {
  if (on) {
    clearTimeout(toolsHideTimer);
    toolsHideTimer = null;
    if (!toolsOn) { toolsOn = true; document.body.classList.add("tools-on"); }
  } else if (toolsOn && !toolsHideTimer) {
    toolsHideTimer = setTimeout(() => {
      toolsHideTimer = null;
      toolsOn = false;
      document.body.classList.remove("tools-on");
    }, 900);
  }
}

const pixel = new Uint8Array(4);
function characterAt(x, y) {
  if (!pet?.spine) return false;
  const r = app.renderer.resolution;
  const cx = x, cy = y - stageEl.offsetTop;
  if (cy < 0 || cx < 0 || cx > stageEl.clientWidth || cy > stageEl.clientHeight) return false;
  const gl = app.renderer.gl;
  gl.readPixels(Math.floor(cx * r), Math.floor(app.view.height - cy * r), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
  return pixel[3] > 24;
}

// 按元素矩形判断（隐藏/不可点击的元素 elementFromPoint 拿不到，所以不用它）
function rectHit(el, x, y, pad = 0) {
  if (!el || el.hidden) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}
function uiAt(x, y) {
  return rectHit(bubbleEl, x, y) || rectHit(chatbar, x, y) || rectHit(wardrobeEl, x, y) || (toolsOn && rectHit(toolsEl, x, y, 4 * ui));
}

let drag = null;
let hoverRaf = 0;
let pat = { lastX: 0, dir: 0, flips: [], cooldown: 0 };

document.addEventListener("mousemove", (e) => {
  if (drag) return;
  if (hoverRaf) return;
  hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0;
    const onChar = characterAt(e.clientX, e.clientY);
    const keep = !chatbar.hidden && chatbar.contains(document.activeElement);
    // 角色身上、按钮附近都算「悬停中」，按钮不会在半路消失
    showTools(onChar || (toolsOn && rectHit(toolsEl, e.clientX, e.clientY, 36 * ui)));
    setInteractive(onChar || uiAt(e.clientX, e.clientY) || keep);
    // 摸头：在头上来回移动鼠标
    if (onChar && regionAt(e.clientX, e.clientY) === "head") {
      const dx = e.clientX - pat.lastX;
      if (Math.abs(dx) > 3) {
        const dir = Math.sign(dx);
        if (dir !== pat.dir) { pat.flips.push(performance.now()); pat.dir = dir; }
        pat.lastX = e.clientX;
      }
      const now = performance.now();
      pat.flips = pat.flips.filter((t) => now - t < 1400);
      if (pat.flips.length >= 6 && now > pat.cooldown) {
        pat.flips = [];
        pat.cooldown = now + 4000;
        // 睡着的时候轻轻摸头不会吵醒她，只会在梦里嘟囔一句
        if (sleepingNow()) { lastInteraction = Date.now(); if (!speaker.active) say(R.line("sleepPat")); }
        else interact("petting");
      }
    }
  });
});
document.addEventListener("mouseleave", () => {
  if (drag) return;
  setInteractive(false);
  showTools(false);
});

stageEl.addEventListener("pointerdown", async (e) => {
  if (!characterAt(e.clientX, e.clientY)) return;
  if (e.button === 2) return;
  wardrobeEl.hidden = true;
  stageEl.setPointerCapture(e.pointerId);
  drag = { sx: e.screenX, sy: e.screenY, x: e.clientX, y: e.clientY, moved: false, bounds: null, dist: 0, lx: e.screenX, ly: e.screenY, t: performance.now() };
  drag.bounds = await api.getBounds();
});

stageEl.addEventListener("pointermove", (e) => {
  if (!drag || !drag.bounds) return;
  const dx = e.screenX - drag.sx, dy = e.screenY - drag.sy;
  if (!drag.moved && Math.hypot(dx, dy) > 5) {
    drag.moved = true;
    document.body.classList.add("dragging");
    if (inSleepMode()) nap.wokeBy = "user";
    brain.interrupt("drag");
    interact("dragStart");
    if (pet.kind === "chibi") brain.carry();
    else { pet.setFace("Surprise"); pet.playMotion("Surprise", { loopSeconds: 60 }); pet.holdMotion(); }
  }
  if (drag.moved) {
    drag.dist += Math.hypot(e.screenX - drag.lx, e.screenY - drag.ly);
    drag.lx = e.screenX; drag.ly = e.screenY;
    api.setPosition(drag.bounds.x + dx, drag.bounds.y + dy);
  }
});

stageEl.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const d = drag;
  drag = null;
  document.body.classList.remove("dragging");
  if (d.moved) {
    api.savePosition();
    if (pet.kind === "job") pet.releaseMotion(0.3);
    interact(d.dist > 2500 ? "dropFar" : "drop");
    if (pet.kind === "chibi") brain.reset({ dropped: true });
    return;
  }
  const region = regionAt(d.x, d.y);
  // 睡着的时候点她：叫醒，不再接普通台词
  if (wakeUp("click")) return;
  if (pet.kind === "chibi") brain.emote(region === "head" ? "jump" : "hurt");
  interact({ head: "patHead", face: "pokeCheek", body: "pokeBody", legs: "pokeLegs" }[region]);
});

stageEl.addEventListener("dblclick", (e) => {
  if (characterAt(e.clientX, e.clientY)) openChat();
});

document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (characterAt(e.clientX, e.clientY) || uiAt(e.clientX, e.clientY)) api.menu();
});

// ---- 悬浮按钮 & 衣柜 ----
toolsEl.addEventListener("click", (e) => {
  const act = e.target.closest("button")?.dataset.act;
  if (act === "chat") chatbar.hidden ? openChat() : closeChat();
  if (act === "menu") api.menu();
  if (act === "wardrobe") {
    wardrobeEl.hidden = !wardrobeEl.hidden;
    if (!wardrobeEl.hidden) renderWardrobe();
  }
});
function renderWardrobe() {
  const list = wardrobeEl.querySelector(".wardrobe-list");
  list.innerHTML = "";
  for (const c of DATA.costumes) {
    const b = document.createElement("button");
    b.className = c.id === settings.costume ? "on" : "";
    b.innerHTML = `${c.nameZh}<small>${c.name}</small>`;
    b.onclick = () => { wardrobeEl.hidden = true; api.setSettings({ costume: c.id }); };
    list.appendChild(b);
  }
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { wardrobeEl.hidden = true; closeChat(); }
});

// ============================================================
// Q 版：自主活动（chibi-brain.js）
// ============================================================
const brain = new ChibiBrain({
  pet: () => pet,
  settings: () => settings,
  api,
  bed,
  busy: () => Boolean(drag) || speaker.active || chatTyping() || !wardrobeEl.hidden || chatState.busy,
  idleMs: () => Date.now() - lastInteraction,
  say: (text) => say(text),
  manpu: (kind, ms) => manpu.show(kind, manpuPoint(), ms),
  line: (kind) => R.line(kind),
  isNight: () => R.isNight(),
  deepSleep: () => nap.deep,
  shouldWake: () => napOver(),
});

// ============================================================
// 睡觉：很久没理她就会犯困睡着 —— 立绘站着打盹，Q 版搬出小床、盖好被子睡。
// 白天打个盹会自己醒；晚上（22 点～早上 6 点）睡着、或者被「哄睡」的话睡得更沉，一直睡到被叫醒。
// 点她、拖她、打开对话框会把她叫醒；在头上轻轻摸不会。
// ============================================================
const bedtime = (d = new Date()) => d.getHours() >= 22 || d.getHours() < 6;
const nap = {
  deep: false,    // 熟睡：只有被叫醒才起来
  night: false,   // 晚上睡的（醒来时说早安）
  until: 0,       // 白天的小盹睡到什么时候
  talkAt: 0,      // 下一句梦话
  wokeAt: 0,      // 上次醒来的时间
  wokeBy: "",     // "user" = 被叫醒
  selfWake: false, // 睡饱了自己醒的（醒来后说句话）
};
// 睡着了（立绘在打盹 / Q 版躺在床上）
const sleepingNow = () => Boolean(pet?.spine) && (pet.kind === "job" ? pet.sleeping : brain.sleeping);
// 睡着了或者正在上床
const inSleepMode = () => Boolean(pet?.spine) && (pet.kind === "job" ? pet.sleeping : brain.action === "sleep");

function fallAsleep({ manual = false } = {}) {
  if (!pet?.spine || inSleepMode() || drag) return;
  nap.night = bedtime();
  nap.deep = manual || nap.night;
  nap.until = nap.deep ? Infinity : Date.now() + (4 + Math.random() * 4) * 60000;
  nap.talkAt = Date.now() + (1.5 + Math.random() * 2) * 60000;
  nap.wokeBy = "";
  nap.selfWake = false;
  wardrobeEl.hidden = true;
  if (manual) {
    if (chatState.busy) api.chatAbort(); // 不然后面的回复会把她叫醒
    closeChat();
  }
  if (pet.kind === "job") pet.sleep({ deep: nap.deep });
  else brain.goToSleep();
  say(R.line(nap.night ? "goodnight" : manual ? "tuckIn" : "fallAsleep"), { force: true });
}

// 叫醒她；返回是不是真的叫醒了
function wakeUp(by) {
  if (!inSleepMode()) return false;
  const wasAsleep = sleepingNow();
  nap.wokeBy = "user";
  lastInteraction = Date.now();
  pendingEvents.push("把正在睡觉的你叫醒了");
  if (pet.kind === "chibi") brain.interrupt("click");
  // 立绘：台词的情绪动作会先演「惊醒」再接上（JobPet.playMotion）
  else pet.setFace("Surprise");
  if (wasAsleep) say(wakeLine(), { force: true });
  else if (pet.kind === "job") pet.wake({ startled: true });
  return true;
}

function wakeLine() {
  const h = new Date().getHours();
  if (nap.night && h >= 6 && h < 12) return R.line("wakeMorning");
  if (bedtime()) return R.line("wakeNight");
  return R.line("wake");
}

// 白天的小盹睡够了没有（打着盹到了晚上就干脆一直睡下去）
function napOver() {
  if (nap.deep) return false;
  if (bedtime()) { nap.deep = nap.night = true; return false; }
  if (Date.now() < nap.until) return false;
  nap.selfWake = true;
  return true;
}

// 立绘睡饱了：慢慢抬起头伸个懒腰（Q 版的起床在 chibi-brain.js）
function wakeSelf() {
  pet.wake({ startled: false });
  pet.setFace("Close");
  setTimeout(() => { if (!sleepingNow() && pet?.kind === "job") pet.setFace("HalfEye_Normal"); }, 900);
}

// 犯困：很久没理她（晚上一半的时间就困了）；正在说话、对话、拖动、换衣服的时候不睡
setInterval(() => {
  if (!pet?.spine) return;
  if (sleepingNow()) {
    if (pet.kind === "job" && napOver()) return wakeSelf();
    // 白天打盹偶尔说句梦话；晚上安安静静地睡
    if (!nap.deep && Date.now() >= nap.talkAt && !speaker.active && !chatState.busy) {
      nap.talkAt = Date.now() + (2 + Math.random() * 3) * 60000;
      say(R.line("sleepTalk"));
    }
    return;
  }
  const min = Number(settings.sleepMinutes) || 0;
  if (!min || inSleepMode() || drag || speaker.active || chatState.busy || !chatbar.hidden || !wardrobeEl.hidden) return;
  if (pet.kind === "job" ? pet.motionName !== "Base" : brain.action) return;
  const quiet = Date.now() - Math.max(lastInteraction, nap.wokeAt);
  if (quiet >= (bedtime() ? min / 2 : min) * 60000) fallAsleep();
}, 10000);

api.onSleep?.((on) => (on ? fallAsleep({ manual: true }) : wakeUp("menu")));

// 每帧：Q 版自主活动、Zzz、被子跟着呼吸起伏
let wasSleeping = false;
app.ticker.add(() => {
  const dt = app.ticker.deltaMS / 1000;
  brain.tick(dt);
  const z = sleepingNow();
  if (z !== wasSleeping) {
    wasSleeping = z;
    if (z) sleepFx.start();
    else {
      sleepFx.stop();
      nap.wokeAt = Date.now();
      // 睡饱了自己醒的：起来以后伸个懒腰说句话
      if (nap.selfWake) {
        nap.selfWake = false;
        setTimeout(() => {
          if (sleepingNow() || speaker.active || chatState.busy) return;
          if (Math.random() < 0.6) say(R.line("wakeSelf"));
          else scheduleRest(400);
        }, 2300);
      }
    }
    api.sleepState?.(z);
  }
  if (z) {
    const charH = stageEl.clientHeight;
    const p = pet.kind === "job"
      ? manpuPoint()
      : (() => { const f = toWindow(pet.facePoint()); return { x: f.x + pet.facing * charH * 0.05, y: f.y - charH * 0.14 }; })();
    sleepFx.update(Math.min(dt, 0.2), p, { dir: pet.kind === "chibi" ? pet.facing || 1 : 1, calm: nap.deep });
  }
  if (pet?.kind === "chibi" && pet.spine && bed.shown) {
    const e = pet.spine.state.tracks[0];
    bed.breath = e?.animation?.name === "SleepLoop" ? (1 - Math.cos(Math.PI * e.trackTime)) / 2 : 0;
  }
});

// ============================================================
// 闲置：太久没理她
// ============================================================
let lastIdleTalk = Date.now();
setInterval(() => {
  const idleMin = (Date.now() - lastInteraction) / 60000;
  const sinceTalk = (Date.now() - lastIdleTalk) / 60000;
  if (speaker.active || chatState.busy || !chatbar.hidden || inSleepMode()) return;
  const aiIdle = Number(settings.idleTalkMinutes) || 0;
  if (aiIdle > 0 && settings.chatReady && idleMin >= aiIdle && sinceTalk >= aiIdle) {
    lastIdleTalk = Date.now();
    sendChat("", { extraDesktop: [`主人已经 ${Math.round(idleMin)} 分钟没有理你了，你可以主动搭个话`] });
    return;
  }
  if (idleMin >= 15 && sinceTalk >= 25) {
    lastIdleTalk = Date.now();
    say(R.line(R.isNight() ? "idleNight" : "idle"));
    return;
  }
  // 偶尔自己换个姿势
  if (pet?.kind === "job" && Math.random() < 0.25 && pet.motionName === "Base") {
    const m = ["PoseChange03", "PoseChange04", "PoseChange05", "Think"][Math.floor(Math.random() * 4)];
    pet.playMotion(m, { loopSeconds: 4 + Math.random() * 4 });
    if (Math.random() < 0.4) { pet.setFace("HalfEye_Normal"); scheduleRest(8000); }
  }
}, 60000);

// ============================================================
// 设置变化
// ============================================================
api.onSettings(async (next) => {
  const prev = settings;
  settings = next;
  if (next.chatAutoClose !== prev.chatAutoClose) touchChat();
  if (next.mode !== prev.mode || next.costume !== prev.costume) {
    await loadPet();
    if (next.mode !== prev.mode) say(R.line(next.mode));
    else say(R.line("costume", { name: costumeOf(next.costume).nameZh }));
  } else {
    layout();
    // 大小变了、或者打开了「下落」：Q 版重新落地
    if (pet?.kind === "chibi" && (next.scale !== prev.scale || (next.chibiFall !== false && prev.chibiFall === false))) brain.reset();
  }
});

// 衣柜打开后一段时间没碰就收起，免得一直挡着 Q 版的自主活动
let wardrobeTimer = null;
const touchWardrobe = () => {
  clearTimeout(wardrobeTimer);
  if (!wardrobeEl.hidden) wardrobeTimer = setTimeout(() => { wardrobeEl.hidden = true; }, 15000);
};
wardrobeEl.addEventListener("mousemove", touchWardrobe);
new MutationObserver(touchWardrobe).observe(wardrobeEl, { attributes: true, attributeFilter: ["hidden"] });

// ============================================================
// 启动
// ============================================================
await loadPet();
setTimeout(() => say(R.greetLine()), 500);
window.__araya = { pet: () => pet, perform, say, sendChat, app, brain, bed, openChat, closeChat, fallAsleep, wakeUp, nap };
