// 设置：userData/settings.json。API Key 用系统钥匙串（safeStorage）加密后再存盘。
const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");
const LAYOUT = require("../shared/layout.json");

const SETTINGS_VERSION = 4;

const DEFAULTS = {
  // 外观
  costume: 1042,
  mode: "job",            // job = 立绘，chibi = Q 版
  scale: 1,               // 大小（LAYOUT.scaleMin ~ scaleMax）
  alwaysOnTop: true,
  position: null,         // { x, y }，上次窗口位置
  // Q 版自主活动
  chibiAuto: true,        // 长时间没互动时自己活动
  chibiIdleSeconds: 60,   // 多久没互动后开始（0 = 一直活动）
  chibiActivity: 2,       // 活跃程度 1 安静 / 2 普通 / 3 活泼 / 4 超活泼
  chibiActions: { walk: true, dash: true, hop: true, dance: true, sit: true, look: true, talk: true },
  chibiFall: true,        // 放到半空时掉到屏幕底部（关掉就停在放下的位置）
  // 睡觉
  sleepMinutes: 10,       // 多久没理她会犯困睡着（分钟，0 = 不会自己睡；晚上减半）
  // 对话
  userName: "主人",
  chatAutoClose: 30,      // 对话框多久没对话自动收起（秒，0 = 不自动收起）
  baseUrl: "",            // Chat Completions 的 Base URL，一般以 /v1 结尾
  model: "",
  apiKey: "",             // 本地模型（Ollama 等）可以不填
  proxy: "",              // 留空 = 跟随系统代理，例如 http://127.0.0.1:7890
  replyMaxChars: 80,
  historyTurns: 20,
  ownerNotes: "",         // 主人的全局设定，一行一条
  cardPath: "",           // 自定义角色卡（留空用内置的亚罗椰）
  aiInteractions: false,  // 摸头、戳脸等互动也交给 AI 回应
  idleTalkMinutes: 0,     // 多久没理她就主动搭话（0 = 关闭，需要 AI）
  // 情绪接口
  apiServer: true,
  apiPort: 47210,
  launchAtLogin: false,
};

const clampScale = (v) => Math.min(LAYOUT.scaleMax, Math.max(LAYOUT.scaleMin, Number(v) || 1));

// 旧版设置迁移：v1 的接口字段和大小基准不同；v2 的 Q 版只有「自由走动」开关；
// v3 的「打瞌睡」是 Q 版自主活动里的一项，关掉了的话就不让她自己睡
function migrate(saved) {
  if (saved.version === SETTINGS_VERSION) return saved;
  const out = { ...saved };
  if (saved.chibiActions?.sleep === false) out.sleepMinutes = 0;
  if (saved.version === 3) return out;
  if (saved.walk === false) out.chibiAuto = false;
  if (saved.version === 2) return out;
  if (saved.provider === "openai") {
    out.baseUrl = saved.openaiBaseUrl || "";
    out.model = saved.openaiModel || "";
  } else {
    out.baseUrl = "";
    out.model = "";
  }
  out.scale = 1; // 新的 100% 比旧版小，统一回到默认大小
  return out;
}

class Settings {
  constructor() {
    this.file = path.join(app.getPath("userData"), "settings.json");
    this.data = { ...DEFAULTS };
    this.listeners = [];
    try {
      const saved = migrate(JSON.parse(fs.readFileSync(this.file, "utf8")));
      for (const k of Object.keys(DEFAULTS)) if (k in saved && k !== "apiKey") this.data[k] = saved[k];
      this.data.chibiActions = { ...DEFAULTS.chibiActions, ...(saved.chibiActions || {}) };
      if (saved.apiKeyEnc && safeStorage.isEncryptionAvailable()) {
        this.data.apiKey = safeStorage.decryptString(Buffer.from(saved.apiKeyEnc, "base64"));
      }
      if (saved.version !== SETTINGS_VERSION) this.save();
    } catch {
      // 第一次启动
    }
    this.data.scale = clampScale(this.data.scale);
  }

  get() {
    return this.data;
  }

  // 给页面看的版本：不回传明文 key
  publicView() {
    const { apiKey, ...rest } = this.data;
    return { ...rest, hasApiKey: Boolean(apiKey), chatReady: Boolean(rest.baseUrl.trim() && rest.model.trim()) };
  }

  set(patch) {
    const before = { ...this.data };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "apiKey" && (v === undefined || v === null)) continue;
      if (k in DEFAULTS) this.data[k] = k === "scale" ? clampScale(v) : v;
    }
    this.save();
    this.listeners.forEach((fn) => fn(this.data, before));
  }

  onChange(fn) {
    this.listeners.push(fn);
  }

  save() {
    const { apiKey, ...rest } = this.data;
    const out = { version: SETTINGS_VERSION, ...rest };
    // 没有可用的钥匙串时 key 不落盘，只在本次运行有效
    if (apiKey && safeStorage.isEncryptionAvailable()) {
      out.apiKeyEnc = safeStorage.encryptString(apiKey).toString("base64");
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(out, null, 1));
  }
}

module.exports = { Settings, DEFAULTS };
