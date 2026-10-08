// 本地情绪接口：其他程序（脚本、聊天机器人、Claude Code 的 hook……）可以让亚罗椰做表情、说话。
// 只监听 127.0.0.1；POST 必须是 application/json，且拒绝带 Origin 的浏览器跨站请求。
//
//   GET  /                     状态
//   GET  /emotions             可用情绪标签
//   POST /emote  {"emotion":"shy","text":"可选的台词","duration":3}
//   POST /say    {"text":"[smug]哎呀♪[shy]……才没有害羞。"}   台词里可以夹情绪标签
//   POST /chat   {"message":"今天的天气怎么样？"}            当作主人说的话交给 AI，返回她的回复
const http = require("node:http");

function startEmotionServer({ port, emotions, onEmote, onSay, onChat }) {
  const names = Object.keys(emotions).filter((k) => !k.startsWith("_"));

  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.origin) return reply(403, { error: "不接受浏览器跨站请求" });

    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/") return reply(200, { ok: true, name: "araya-desktop-pet" });
    if (req.method === "GET" && url.pathname === "/emotions") {
      return reply(200, Object.fromEntries(names.map((k) => [k, emotions[k].label])));
    }
    if (req.method !== "POST") return reply(404, { error: "not found" });
    if (!/^application\/json\b/.test(req.headers["content-type"] || "")) return reply(415, { error: "需要 Content-Type: application/json" });

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 64 * 1024) return reply(413, { error: "太长了" });
    }
    let body;
    try { body = JSON.parse(raw || "{}"); } catch { return reply(400, { error: "JSON 格式不对" }); }

    if (url.pathname === "/emote") {
      const emotion = String(body.emotion || "").toLowerCase();
      if (!names.includes(emotion)) return reply(400, { error: `未知情绪，可用：${names.join(", ")}` });
      onEmote({ emotion, text: typeof body.text === "string" ? body.text.slice(0, 500) : "", duration: Number(body.duration) || 0 });
      return reply(200, { ok: true });
    }
    if (url.pathname === "/say") {
      if (typeof body.text !== "string" || !body.text.trim()) return reply(400, { error: "缺少 text" });
      onSay({ text: body.text.slice(0, 2000) });
      return reply(200, { ok: true });
    }
    if (url.pathname === "/chat") {
      if (typeof body.message !== "string" || !body.message.trim()) return reply(400, { error: "缺少 message" });
      const result = await onChat(body.message.slice(0, 4000));
      return reply(result.error ? 500 : 200, result);
    }
    return reply(404, { error: "not found" });
  });

  server.on("error", (e) => console.error(`[emotion-api] 端口 ${port} 启动失败：${e.message}`));
  server.listen(port, "127.0.0.1", () => console.log(`[emotion-api] http://127.0.0.1:${port}`));
  return server;
}

module.exports = { startEmotionServer };
