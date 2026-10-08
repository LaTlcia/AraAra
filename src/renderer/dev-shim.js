// 在普通浏览器里预览时代替 Electron 的 preload API（只用于开发调试）
const listeners = {};
const on = (name) => (fn) => { (listeners[name] ||= []).push(fn); };
const emit = (name, ...args) => (listeners[name] || []).forEach((fn) => fn(...args));

const q = new URLSearchParams(location.search);
let settings = {
  costume: Number(q.get("costume")) || 1042, mode: q.get("mode") || "job", scale: 1,
  chibiAuto: true, chibiIdleSeconds: Number(q.get("idle") ?? 60), chibiActivity: Number(q.get("activity")) || 2,
  chibiFall: q.get("fall") !== "0", chatAutoClose: Number(q.get("autoclose") ?? 30),
  chibiActions: { walk: true, dash: true, hop: true, dance: true, sit: true, sleep: true, look: true, talk: true },
  baseUrl: "", model: "",
  hasApiKey: true, chatReady: true, aiInteractions: false, idleTalkMinutes: 0, userName: "主人",
};
// 在 tools/frame.html 里运行时，用父页面模拟「窗口」位置和屏幕
const host = window.parent !== window && window.parent.petHost ? window.parent.petHost : null;
let seq = 0;

export default {
  async init() {
    const [data, emotions, layout] = await Promise.all([
      fetch("../../assets/data/araya.json").then((r) => r.json()),
      fetch("../shared/emotions.json").then((r) => r.json()),
      fetch("../shared/layout.json").then((r) => r.json()),
    ]);
    return {
      settings, data, emotions, layout, platform: "web",
    };
  },
  ignoreMouse() {},
  getBounds: async () => (host ? host.bounds() : { x: 0, y: 0, width: innerWidth, height: innerHeight }),
  setPosition(x, y) { host?.move(x, y); },
  savePosition() {},
  ensureVisible() {
    if (!host) return;
    const b = host.bounds(), wa = host.workArea();
    host.move(Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width), Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height));
  },
  workArea: async () => (host ? host.workArea() : { x: 0, y: 0, width: screen.width, height: screen.height }),
  menu() { console.log("[dev] menu"); },
  openSettings() {},
  focus() {},
  externalChatDone() {},
  async chatSend({ text }) {
    const id = ++seq;
    emit("chat:event", { id, type: "start" });
    const reply = text.includes("长")
      ? "[think]相位超验嘛……简单来说就是把 MAGI 压缩起来打出一击必杀。[proud]一般人用完就动不了了，S 级的我可不一样，用完照样能继续战斗。[smug]怎么样，是不是越来越想了解我了？"
      : `[smug]哎呀，「${text}」？这种问题也来问我♪[shy]……不过你愿意来找我，我还是挺高兴的。`;
    await new Promise((r) => setTimeout(r, 900));
    for (let i = 0; i < reply.length; i += 3) {
      emit("chat:event", { id, type: "delta", delta: reply.slice(i, i + 3) });
      await new Promise((r) => setTimeout(r, 40));
    }
    emit("chat:event", { id, type: "done", reply });
    return { id, reply };
  },
  chatAbort() {},
  chatHistory: async () => [],
  chatReset: async () => true,
  getSettings: async () => settings,
  async setSettings(patch) { settings = { ...settings, ...patch }; emit("settings", settings); return settings; },
  testApi: async () => ({ ok: true, text: "[smile]测试" }),
  openUserData() {},
  onChatEvent: on("chat:event"),
  onEmote: on("emote"),
  onSay: on("say"),
  onOpenChat: on("openChat"),
  onExternalChat: on("externalChat"),
  onSettings: on("settings"),
  onSettingsTab: on("tab"),
};
