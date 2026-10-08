// 睡着时从头上飘起来的 Zzz（立绘、Q 版共用）。用 DOM + SVG 画在漫符层上，不挡鼠标，也不会被画布边缘截掉。

const Z_PATH = "M4 4H28V9L11 27H28V32H4V27L21 9H4Z";

export class SleepFx {
  constructor(layer) {
    this.layer = layer;
    this.on = false;
    this.timer = 0;
    this.n = 0;
  }

  start() {
    if (this.on) return;
    this.on = true;
    this.timer = 1.2;
    this.n = 0;
  }

  // 已经飘起来的 Z 自己飘完、淡出
  stop() { this.on = false; }

  // 每帧调用。point = Z 冒出来的位置（窗口坐标）；dir = 往哪边飘（1 右 / -1 左）；calm = 熟睡，飘得慢一点、稀一点
  update(dt, point, { dir = 1, calm = false } = {}) {
    if (!this.on || !point) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = calm ? 2 : 1.5;
    // 窗口被挡住时 CSS 动画可能不跑、animationend 不来：最多留几个，并且到时间也删掉
    const old = this.layer.querySelectorAll(".zz");
    if (old.length >= 5) old[0].remove();
    const size = [1, 0.78, 0.6][this.n++ % 3];
    const el = document.createElement("div");
    el.className = "zz";
    el.style.left = `${point.x}px`;
    el.style.top = `${point.y}px`;
    el.style.setProperty("--s", size);
    el.style.setProperty("--dx", `${dir * (24 + Math.random() * 16)}px`);
    const dur = calm ? 3.8 : 3;
    el.style.setProperty("--dur", `${dur}s`);
    el.innerHTML = `<svg viewBox="0 0 32 36"><path d="${Z_PATH}"/></svg>`;
    el.addEventListener("animationend", () => el.remove());
    setTimeout(() => el.remove(), dur * 1000 + 600);
    this.layer.appendChild(el);
  }
}
