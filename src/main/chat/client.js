// 流式对话客户端：OpenAI 兼容的 Chat Completions（DeepSeek、通义、Ollama、各种中转都行）
// fetchImpl 由主进程传入（带代理的 session.fetch）。

async function* sseLines(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, "");
        buf = buf.slice(idx + 1);
        yield line;
      }
    }
    if (buf) yield buf;
  } finally {
    reader.releaseLock();
  }
}

async function ensureOk(response) {
  if (response.status >= 400) {
    const body = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
}

async function* streamOpenAI(fetchImpl, cfg, instructions, messages, signal) {
  const base = cfg.baseUrl.trim().replace(/\/+$/, "");
  const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
  const headers = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "system", content: instructions }, ...messages],
      max_tokens: cfg.maxTokens || 2048,
      stream: true,
    }),
    signal,
  });
  await ensureOk(response);
  for await (const line of sseLines(response, signal)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") break;
    let event;
    try { event = JSON.parse(data); } catch { continue; }
    if (event.error) throw new Error(JSON.stringify(event.error).slice(0, 300));
    const delta = event.choices?.[0]?.delta?.content;
    if (delta) yield delta;
  }
}


function streamText(fetchImpl, cfg, instructions, messages, signal) {
  if (!cfg.baseUrl?.trim() || !cfg.model?.trim()) throw new Error("还没有填写接口地址和模型（右键亚罗椰 → 设置）");
  return streamOpenAI(fetchImpl, cfg, instructions, messages, signal);
}

module.exports = { streamText };
