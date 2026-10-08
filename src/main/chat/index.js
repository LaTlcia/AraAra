// 对话服务：角色卡 + 提示词 + 历史记录 + 流式请求
const fs = require("node:fs");
const path = require("node:path");
const { loadCard } = require("./card");
const { buildPrompt } = require("./prompt");
const { streamText } = require("./client");

class ChatService {
  /**
   * @param opts.dataDir 存放对话历史的目录
   * @param opts.defaultCard 内置角色卡路径
   * @param opts.getSettings () => 当前设置
   * @param opts.getFetch () => 带代理的 fetch
   */
  constructor({ dataDir, defaultCard, getSettings, getFetch }) {
    this.historyFile = path.join(dataDir, "chat-history.json");
    this.defaultCard = defaultCard;
    this.getSettings = getSettings;
    this.getFetch = getFetch;
    this.busy = null;
  }

  loadHistory() {
    try {
      const h = JSON.parse(fs.readFileSync(this.historyFile, "utf8"));
      return Array.isArray(h) ? h : [];
    } catch {
      return [];
    }
  }

  saveHistory(history) {
    fs.mkdirSync(path.dirname(this.historyFile), { recursive: true });
    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 1));
  }

  reset() {
    this.saveHistory([]);
  }

  card() {
    const s = this.getSettings();
    const file = s.cardPath && fs.existsSync(s.cardPath) ? s.cardPath : this.defaultCard;
    return loadCard(file);
  }

  abort() {
    this.busy?.abort();
  }

  /**
   * 生成一条回复，逐段回调 onDelta；结束后写入历史并返回完整回复。
   * @param input.text 主人说的话（可空）
   * @param input.events 互动事件
   * @param input.desktop 桌面状态
   * @param input.save 是否写入历史（设置页的连接测试不写）
   */
  async respond({ text, events = [], desktop = [], save = true }, onDelta) {
    this.abort();
    const controller = new AbortController();
    this.busy = controller;
    const s = this.getSettings();
    const card = this.card();
    const turns = Math.max(1, Number(s.historyTurns) || 20);
    const history = this.loadHistory().slice(-turns * 2);
    const prompt = buildPrompt(card, {
      user: s.userName || "主人",
      text,
      history,
      desktop,
      events,
      ownerNotes: (s.ownerNotes || "").split("\n").map((l) => l.trim()).filter(Boolean),
      maxChars: Number(s.replyMaxChars) || 0,
    });
    const cfg = { baseUrl: s.baseUrl, apiKey: s.apiKey, model: s.model.trim(), maxTokens: 2048 };
    let reply = "";
    try {
      const stream = streamText(this.getFetch(), cfg, prompt.instructions, [...history, { role: "user", content: prompt.turn }], controller.signal);
      for await (const delta of stream) {
        reply += delta;
        onDelta(delta);
      }
    } finally {
      if (this.busy === controller) this.busy = null;
    }
    reply = reply.trim();
    if (reply && save) {
      history.push({ role: "user", content: prompt.compact }, { role: "assistant", content: reply });
      this.saveHistory(history.slice(-turns * 2));
    }
    return { reply, lore: prompt.lore };
  }
}

module.exports = { ChatService };
