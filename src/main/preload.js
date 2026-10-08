// 渲染进程可用的 API（contextIsolation 下通过 window.pet 暴露）
const { contextBridge, ipcRenderer } = require("electron");

const on = (channel) => (fn) => {
  const handler = (_, ...args) => fn(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};

contextBridge.exposeInMainWorld("pet", {
  init: () => ipcRenderer.invoke("pet:init"),
  ignoreMouse: (ignore) => ipcRenderer.send("pet:ignoreMouse", ignore),
  getBounds: () => ipcRenderer.invoke("pet:getBounds"),
  setPosition: (x, y) => ipcRenderer.send("pet:setPosition", { x, y }),
  savePosition: () => ipcRenderer.send("pet:savePosition"),
  ensureVisible: () => ipcRenderer.send("pet:ensureVisible"),
  workArea: () => ipcRenderer.invoke("pet:workArea"),
  menu: () => ipcRenderer.send("pet:menu"),
  openSettings: (tab) => ipcRenderer.send("pet:openSettings", tab),
  focus: () => ipcRenderer.send("pet:focus"),
  externalChatDone: (result) => ipcRenderer.send("pet:externalChatDone", result),

  chatSend: (input) => ipcRenderer.invoke("chat:send", input),
  chatAbort: () => ipcRenderer.send("chat:abort"),
  chatHistory: () => ipcRenderer.invoke("chat:history"),
  chatReset: () => ipcRenderer.invoke("chat:reset"),

  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  testApi: () => ipcRenderer.invoke("settings:test"),
  openUserData: () => ipcRenderer.send("settings:openUserData"),

  onChatEvent: on("chat:event"),
  onEmote: on("pet:emote"),
  onSay: on("pet:say"),
  onOpenChat: on("pet:openChat"),
  onExternalChat: on("pet:externalChat"),
  onSettings: on("settings:changed"),
  onSettingsTab: on("settings:tab"),
});
