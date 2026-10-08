// 生成 build/ 下的应用图标与托盘图标：npx electron tools/make-icons.js
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, protocol, net } = require("electron");

const ROOT = path.join(__dirname, "..");
protocol.registerSchemesAsPrivileged([{ scheme: "pet", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.whenReady().then(async () => {
  protocol.handle("pet", (req) => net.fetch(pathToFileURL(path.join(ROOT, decodeURIComponent(new URL(req.url).pathname))).toString()));
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, webPreferences: { offscreen: true } });
  await win.loadURL("pet://app/tools/make-icons.html");
  for (let i = 0; i < 100; i++) {
    if ((await win.webContents.executeJavaScript("document.title")) === "ready") break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const icons = await win.webContents.executeJavaScript("window.icons");
  fs.mkdirSync(path.join(ROOT, "build"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "assets", "icons"), { recursive: true });
  for (const [name, url] of Object.entries(icons)) {
    const out = name === "icon.png" ? path.join("build", name) : path.join("assets", "icons", name);
    fs.writeFileSync(path.join(ROOT, out), Buffer.from(url.split(",")[1], "base64"));
    console.log("wrote " + out);
  }
  // 打包成 .ico（PNG 压缩的图标项，Vista 以后都支持）
  const sizes = await win.webContents.executeJavaScript("window.icoSizes");
  const pngs = Object.entries(sizes).map(([px, url]) => [Number(px), Buffer.from(url.split(",")[1], "base64")]);
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(([px, buf], i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(px >= 256 ? 0 : px, e);
    header.writeUInt8(px >= 256 ? 0 : px, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(buf.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  fs.writeFileSync(path.join(ROOT, "build", "icon.ico"), Buffer.concat([header, ...pngs.map(([, b]) => b)]));
  console.log("wrote build/icon.ico");
  app.quit();
});
