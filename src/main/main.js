// 亚罗椰桌宠 · Electron 主进程
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const {
  app, BrowserWindow, Tray, Menu, ipcMain, protocol, net, screen, session, globalShortcut, nativeImage, shell,
} = require("electron");
const { Settings } = require("./settings");
const { ChatService } = require("./chat");
const { startEmotionServer } = require("./emotion-server");

const ROOT = path.join(__dirname, "..", "..");
const ASSETS = path.join(ROOT, "assets");
const DATA = JSON.parse(fs.readFileSync(path.join(ASSETS, "data", "araya.json"), "utf8"));
const EMOTIONS = require("../shared/emotions.json");

const LAYOUT = require("../shared/layout.json");
const SCALE_PRESETS = [0.6, 0.8, 1, 1.25, 1.5];

protocol.registerSchemesAsPrivileged([
  { scheme: "pet", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let settings, chat, petWin, settingsWin, tray, emotionServer, netSession;
let petSleeping = false;   // 渲染进程报告的睡觉状态（菜单显示「哄她睡觉 / 叫醒她」）
// 桌宠窗口「应该」的尺寸（DIP）。Windows 在 125%/150% 这类非整数缩放下，getSize() 读回来的尺寸带舍入误差，
// 移动时如果读回再写入，误差会累积，拖着拖着窗口就越来越大。所以尺寸只认这里，移动时不读回。
let petSize = null;

// ------------------------------------------------------------
// 窗口
// ------------------------------------------------------------
// 窗口尺寸（公式见 shared/layout.json，渲染进程用同一份配置布局）
function windowSize(s = settings.get()) {
  const L = LAYOUT[s.mode] || LAYOUT.job;
  const ui = Math.min(LAYOUT.uiMax, Math.max(LAYOUT.uiMin, Math.sqrt(s.scale)));
  const charH = L.charHeight * s.scale;
  // 太大时不超过屏幕可用高度（页面按窗口高度布局，角色会跟着缩小一点）
  const display = petWin ? screen.getDisplayMatching(petWin.getBounds()) : screen.getPrimaryDisplay();
  return {
    width: Math.round(Math.max(L.minWidth * ui, charH * L.widthRatio)),
    height: Math.round(Math.min(charH + L.topReserve * ui, display.workArea.height)),
  };
}

function defaultPosition(size) {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - size.width - 40, y: wa.y + wa.height - size.height };
}

function clampToScreen(pos, size) {
  const display = screen.getDisplayNearestPoint({ x: pos.x + size.width / 2, y: pos.y + size.height / 2 });
  const wa = display.workArea;
  return {
    x: Math.min(Math.max(pos.x, wa.x - size.width / 3), wa.x + wa.width - (size.width * 2) / 3),
    y: Math.min(Math.max(pos.y, wa.y - size.height / 3), wa.y + wa.height - size.height / 2),
  };
}

// 移动窗口：位置照给，尺寸永远用 petSize
function placePet(x, y) {
  if (!petWin || !petSize) return;
  petWin.setBounds({ x: Math.round(x), y: Math.round(y), width: petSize.width, height: petSize.height });
}

// 设定尺寸并用最小/最大尺寸锁住，防止系统在换算时自己改尺寸
function lockPetSize(size, pos) {
  petSize = size;
  petWin.setMinimumSize(1, 1);
  petWin.setMaximumSize(10000, 10000);
  petWin.setBounds({ ...(pos || petPosition()), ...size });
  petWin.setMinimumSize(size.width, size.height);
  petWin.setMaximumSize(size.width, size.height);
}

function petPosition() {
  const [x, y] = petWin.getPosition();
  return { x, y };
}

function createPetWindow() {
  const s = settings.get();
  const size = windowSize(s);
  const pos = clampToScreen(s.position || defaultPosition(size), size);
  petWin = new BrowserWindow({
    ...size,
    ...pos,
    transparent: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: s.alwaysOnTop,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: "#00000000",
    title: "亚罗椰",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  lockPetSize(size, pos);
  applyAlwaysOnTop();
  if (process.platform === "darwin") petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadURL("pet://app/src/renderer/index.html");
  if (process.env.ARAYA_DEBUG) {
    petWin.webContents.on("console-message", (e) => console.log(`[renderer] ${e.message}`));
    petWin.webContents.on("render-process-gone", (_, d) => console.log("[renderer] gone", d));
  }
  petWin.on("closed", () => { petWin = null; });
  petWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
}

function applyAlwaysOnTop() {
  if (!petWin) return;
  petWin.setAlwaysOnTop(settings.get().alwaysOnTop, process.platform === "darwin" ? "floating" : "screen-saver");
}

function resizePetWindow() {
  if (!petWin) return;
  const size = windowSize();
  const { x, y } = petPosition();
  const old = petSize || size;
  // 以脚底中心为锚点缩放
  const pos = clampToScreen({ x: Math.round(x + old.width / 2 - size.width / 2), y: y + old.height - size.height }, size);
  lockPetSize(size, pos);
}

function savePosition() {
  if (!petWin) return;
  const [x, y] = petWin.getPosition();
  settings.set({ position: { x, y } });
}

function openSettings(tab = "") {
  if (settingsWin) {
    settingsWin.show();
    settingsWin.focus();
    if (tab) settingsWin.webContents.send("settings:tab", tab);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 760,
    height: 640,
    minWidth: 620,
    minHeight: 480,
    title: "亚罗椰桌宠 · 设置",
    backgroundColor: "#fff7fb",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  settingsWin.loadURL(`pet://app/src/renderer/settings.html${tab ? `#${tab}` : ""}`);
  settingsWin.on("closed", () => { settingsWin = null; });
  if (process.platform === "darwin") app.dock?.show();
  settingsWin.on("closed", () => { if (process.platform === "darwin") app.dock?.hide(); });
}

// ------------------------------------------------------------
// 菜单（托盘和右键共用）
// ------------------------------------------------------------
function buildMenu() {
  const s = settings.get();
  const send = (ch, ...args) => petWin?.webContents.send(ch, ...args);
  return Menu.buildFromTemplate([
    { label: "和亚罗椰说话…", accelerator: "CommandOrControl+Shift+Y", click: () => openChat() },
    { type: "separator" },
    {
      label: "换衣服",
      submenu: DATA.costumes.map((c) => ({
        label: `${c.nameZh}（${c.name}）`,
        type: "radio",
        checked: s.costume === c.id,
        click: () => settings.set({ costume: c.id }),
      })),
    },
    {
      label: "形态",
      submenu: [
        { label: "立绘", type: "radio", checked: s.mode === "job", click: () => settings.set({ mode: "job" }) },
        { label: "Q 版（会在桌面上散步）", type: "radio", checked: s.mode === "chibi", click: () => settings.set({ mode: "chibi" }) },
      ],
    },
    {
      label: `大小（${Math.round(s.scale * 100)}%）`,
      submenu: [
        { label: "放大", click: () => settings.set({ scale: Math.round((s.scale + 0.1) * 20) / 20 }) },
        { label: "缩小", click: () => settings.set({ scale: Math.round((s.scale - 0.1) * 20) / 20 }) },
        { type: "separator" },
        ...SCALE_PRESETS.map((v) => ({
          label: `${Math.round(v * 100)}%`,
          type: "radio",
          checked: Math.abs(s.scale - v) < 0.01,
          click: () => settings.set({ scale: v }),
        })),
        { type: "separator" },
        { label: "在设置里自由调节…", click: () => openSettings("look") },
      ],
    },
    { label: petSleeping ? "叫醒她" : "哄她睡觉", click: () => send("pet:sleep", !petSleeping) },
    {
      label: "表演情绪",
      submenu: Object.entries(EMOTIONS).filter(([k]) => !k.startsWith("_")).map(([k, v]) => ({
        label: `${v.label}  [${k}]`,
        click: () => send("pet:emote", { emotion: k }),
      })),
    },
    { type: "separator" },
    { label: "置顶显示", type: "checkbox", checked: s.alwaysOnTop, click: (i) => settings.set({ alwaysOnTop: i.checked }) },
    { label: "Q 版自主活动", type: "checkbox", checked: s.chibiAuto, enabled: s.mode === "chibi", click: (i) => settings.set({ chibiAuto: i.checked }) },
    { label: "Q 版放到半空会掉下来", type: "checkbox", checked: s.chibiFall, enabled: s.mode === "chibi", click: (i) => settings.set({ chibiFall: i.checked }) },
    {
      label: "Q 版活跃程度",
      enabled: s.mode === "chibi" && s.chibiAuto,
      submenu: [["安静", 1], ["普通", 2], ["活泼", 3], ["超活泼", 4]].map(([label, v]) => ({
        label, type: "radio", checked: s.chibiActivity === v, click: () => settings.set({ chibiActivity: v }),
      })),
    },
    { label: "开机自动启动", type: "checkbox", checked: s.launchAtLogin, click: (i) => settings.set({ launchAtLogin: i.checked }) },
    { label: "回到屏幕右下角", click: () => { if (!petWin) return; const p = defaultPosition(petSize); placePet(p.x, p.y); savePosition(); } },
    { type: "separator" },
    { label: "对话记录", click: () => openSettings("history") },
    { label: "设置…", accelerator: "CommandOrControl+,", click: () => openSettings() },
    { type: "separator" },
    { label: "退出", click: () => app.quit() },
  ]);
}

function refreshTray() {
  tray?.setContextMenu(buildMenu());
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, "icons", process.platform === "darwin" ? "trayTemplate.png" : "tray.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("亚罗椰");
  refreshTray();
  tray.on("click", () => { if (process.platform !== "darwin") petWin?.show(); });
}

function openChat() {
  if (!petWin) return;
  if (process.platform === "darwin") app.focus({ steal: true });
  petWin.show();
  petWin.focus();
  petWin.webContents.send("pet:openChat");
}

// ------------------------------------------------------------
// 网络（对话请求走单独的 session，方便设置代理）
// ------------------------------------------------------------
async function applyProxy() {
  const proxy = settings.get().proxy.trim();
  await netSession.setProxy(proxy ? { proxyRules: proxy, proxyBypassRules: "<local>" } : { mode: "system" });
}

// ------------------------------------------------------------
// 对话
// ------------------------------------------------------------
let chatSeq = 0;
async function runChat(sender, input) {
  const id = ++chatSeq;
  const send = (payload) => { if (!sender.isDestroyed()) sender.send("chat:event", { id, ...payload }); };
  send({ type: "start" });
  try {
    const { reply, lore } = await chat.respond(input, (delta) => send({ type: "delta", delta }));
    if (lore.length) console.log(`[chat] 世界书激活：${lore.join("、")}`);
    send({ type: "done", reply });
    return { id, reply };
  } catch (e) {
    const aborted = e.name === "AbortError";
    send({ type: aborted ? "aborted" : "error", error: String(e.message || e) });
    return { id, error: String(e.message || e) };
  }
}

function registerIpc() {
  ipcMain.handle("pet:init", () => ({
    settings: settings.publicView(),
    data: DATA,
    emotions: EMOTIONS,
    layout: LAYOUT,
    platform: process.platform,
  }));
  ipcMain.on("pet:ignoreMouse", (e, ignore) => {
    BrowserWindow.fromWebContents(e.sender)?.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.handle("pet:getBounds", () => (petWin ? { ...petPosition(), ...petSize } : null));
  ipcMain.on("pet:setPosition", (_, { x, y }) => placePet(x, y));
  ipcMain.on("pet:savePosition", () => savePosition());
  // 打开对话框时把窗口整个挪回屏幕内，免得输入框被截掉
  ipcMain.on("pet:ensureVisible", () => {
    if (!petWin) return;
    const b = { ...petPosition(), ...petSize };
    const wa = screen.getDisplayMatching(b).workArea;
    const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
    const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
    if (x !== b.x || y !== b.y) { placePet(x, y); savePosition(); }
  });
  ipcMain.handle("pet:workArea", () => {
    if (!petWin) return screen.getPrimaryDisplay().workArea;
    const b = petWin.getBounds();
    return screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 }).workArea;
  });
  ipcMain.on("pet:menu", () => buildMenu().popup({ window: petWin }));
  ipcMain.on("pet:sleepState", (_, on) => { petSleeping = Boolean(on); refreshTray(); });
  ipcMain.on("pet:openSettings", (_, tab) => openSettings(tab));
  ipcMain.on("pet:focus", () => {
    if (process.platform === "darwin") app.focus({ steal: true });
    petWin?.focus();
  });

  ipcMain.handle("chat:send", (e, input) => runChat(e.sender, input));
  ipcMain.on("chat:abort", () => chat.abort());
  ipcMain.handle("chat:history", () => chat.loadHistory());
  ipcMain.handle("chat:reset", () => { chat.reset(); return true; });

  ipcMain.handle("settings:get", () => settings.publicView());
  ipcMain.handle("settings:set", (_, patch) => { settings.set(patch); return settings.publicView(); });
  ipcMain.handle("settings:test", async () => {
    try {
      let text = "";
      await chat.respond({ text: "（这是设置页的连接测试，用一句话打个招呼）", save: false }, (d) => { text += d; });
      return { ok: true, text };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
  ipcMain.on("settings:openUserData", () => shell.openPath(app.getPath("userData")));
}

// ------------------------------------------------------------
// 启动
// ------------------------------------------------------------
app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock?.hide();

  protocol.handle("pet", (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response("forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  settings = new Settings();
  netSession = session.fromPartition("persist:araya-net");
  await applyProxy();
  chat = new ChatService({
    dataDir: app.getPath("userData"),
    // 内置角色卡：有 assets/card/araya.json 就用它，否则用模板卡
    defaultCard: ["araya.json", "template.json"].map((f) => path.join(ASSETS, "card", f)).find((f) => fs.existsSync(f)),
    getSettings: () => settings.get(),
    getFetch: () => (url, init) => netSession.fetch(url, init),
  });

  registerIpc();
  createPetWindow();
  createTray();
  globalShortcut.register("CommandOrControl+Shift+Y", openChat);

  const startServer = () => {
    emotionServer?.close();
    emotionServer = null;
    const s = settings.get();
    if (!s.apiServer) return;
    emotionServer = startEmotionServer({
      port: Number(s.apiPort) || 47210,
      emotions: EMOTIONS,
      onEmote: (payload) => petWin?.webContents.send("pet:emote", payload),
      onSay: (payload) => petWin?.webContents.send("pet:say", payload),
      onChat: (message) => new Promise((resolve) => {
        if (!petWin) return resolve({ error: "窗口未就绪" });
        petWin.webContents.send("pet:externalChat", message);
        ipcMain.once("pet:externalChatDone", (_, result) => resolve(result));
      }),
    });
  };
  startServer();
  if (settings.get().launchAtLogin) app.setLoginItemSettings({ openAtLogin: true });

  settings.onChange((now, before) => {
    if (now.mode !== before.mode || now.scale !== before.scale) resizePetWindow();
    if (now.alwaysOnTop !== before.alwaysOnTop) applyAlwaysOnTop();
    if (now.proxy !== before.proxy) applyProxy();
    if (now.apiServer !== before.apiServer || now.apiPort !== before.apiPort) startServer();
    if (now.launchAtLogin !== before.launchAtLogin) app.setLoginItemSettings({ openAtLogin: now.launchAtLogin });
    petWin?.webContents.send("settings:changed", settings.publicView());
    settingsWin?.webContents.send("settings:changed", settings.publicView());
    refreshTray();
  });
});

app.on("second-instance", () => openChat());
app.on("window-all-closed", () => {
  // 关掉设置窗口不退出；桌宠窗口没了才退出
  if (!petWin) app.quit();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  emotionServer?.close();
});
