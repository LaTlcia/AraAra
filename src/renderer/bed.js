// Q 版睡觉用的床：没有现成贴图，全部用 Canvas 画出来再转成 PIXI 贴图。
// 坐标和骨骼一致：脚底为原点，x 向右、y 向下，单位 = 骨骼单位；按角色当前缩放绘制，换大小时重画。
// 分层：back（床头板、床尾板、床垫顶面、枕头）永远在角色后面；
//       front（床垫正面、床沿）、blanket（被子，随呼吸起伏）、posts（靠近镜头的床柱）在她躺进床里以后挡在她前面，
//       站在床边的时候（上床前、下床后）整张床都在她身后（setInBed）。

const { PIXI } = window;

// 床的尺寸（骨骼单位）
export const BED = {
  left: -1300, right: 1170, top: -1120, bottom: 30,   // 绘制范围
  headX0: -1255, headX1: -1105, headTop: -1010,         // 床头
  footX0: 1000, footX1: 1135, footTop: -600,            // 床尾
  matX0: -1150, matX1: 1020, matTop: -200, matBottom: -40, matDepth: 70,
  pillow: { x0: -1135, x1: -560, top: -360, bottom: -185 },
  blanketBottom: -48,
};

const C = {
  line: "#8a5367",
  wood: "#fff3f6", woodShade: "#f3d6e0", woodDeep: "#e6bccb",
  accent: "#ff80b3", accentDeep: "#e3639a",
  sheet: "#ffffff", sheetShade: "#efe3ea",
  pillow: "#ffffff", pillowShade: "#ead9e3", lace: "#ffc6dc",
  blanket: "#ff9cc5", blanketDeep: "#f07aaa", blanketLight: "#ffc4dc", hem: "#fff4f8", hemShade: "#f6dbe6",
  dot: "rgba(255,255,255,0.55)", stitch: "rgba(255,255,255,0.7)",
};

const LINE = 13; // 描边粗细（骨骼单位），和 Q 版立绘的描边差不多

function roundRect(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
}

function stroke(ctx, width = LINE, color = C.line) {
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

function vGrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function heart(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.25, cy + s * 0.05, cx - s * 0.75, cy - s * 0.95, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.75, cy - s * 0.95, cx + s * 1.25, cy + s * 0.05, cx, cy + s * 0.9);
  ctx.closePath();
}

// 立柱 + 圆球顶
function post(ctx, x0, x1, top, bottom) {
  const cx = (x0 + x1) / 2, w = x1 - x0;
  roundRect(ctx, x0, top + w * 0.55, x1, bottom, w * 0.22);
  ctx.fillStyle = vGrad(ctx, top, bottom, [[0, C.wood], [0.7, C.woodShade], [1, C.woodDeep]]);
  ctx.fill();
  stroke(ctx);
  ctx.beginPath();
  ctx.arc(cx, top + w * 0.2, w * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = C.accent;
  ctx.fill();
  stroke(ctx);
  ctx.beginPath();
  ctx.arc(cx - w * 0.2, top + w * 0.02, w * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fill();
}

// ---------------- 各层 ----------------
function drawBack(ctx) {
  const B = BED;
  // 地面阴影
  ctx.save();
  ctx.fillStyle = "rgba(120,60,90,0.16)";
  ctx.beginPath();
  ctx.ellipse((B.headX0 + B.footX1) / 2, B.bottom - 12, (B.footX1 - B.headX0) / 2 + 40, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // 床头板：拱形面板 + 镂空爱心
  ctx.beginPath();
  ctx.moveTo(B.headX0, B.matBottom);
  ctx.lineTo(B.headX0, B.headTop + 180);
  ctx.quadraticCurveTo(B.headX0, B.headTop, (B.headX0 + B.headX1) / 2 + 40, B.headTop);
  ctx.quadraticCurveTo(B.headX1 + 120, B.headTop + 20, B.headX1 + 120, B.headTop + 200);
  ctx.lineTo(B.headX1 + 120, B.matBottom);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, B.headTop, B.matBottom, [[0, C.wood], [0.65, C.woodShade], [1, C.woodDeep]]);
  ctx.fill();
  stroke(ctx);
  heart(ctx, (B.headX0 + B.headX1) / 2 + 50, B.headTop + 290, 95);
  ctx.fillStyle = C.accent;
  ctx.fill();
  stroke(ctx, LINE * 0.8);
  heart(ctx, (B.headX0 + B.headX1) / 2 + 30, B.headTop + 270, 30);
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fill();

  // 床尾板
  ctx.beginPath();
  ctx.moveTo(B.footX0 - 90, B.matBottom);
  ctx.lineTo(B.footX0 - 90, B.footTop + 120);
  ctx.quadraticCurveTo(B.footX0 - 90, B.footTop, B.footX0 + 20, B.footTop);
  ctx.quadraticCurveTo(B.footX1, B.footTop, B.footX1, B.footTop + 120);
  ctx.lineTo(B.footX1, B.matBottom);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, B.footTop, B.matBottom, [[0, C.wood], [0.65, C.woodShade], [1, C.woodDeep]]);
  ctx.fill();
  stroke(ctx);

  // 床垫顶面（稍微俯视，能看到一条）
  ctx.beginPath();
  ctx.moveTo(B.matX0 + 30, B.matTop);
  ctx.lineTo(B.matX0 + 90, B.matTop - B.matDepth);
  ctx.lineTo(B.matX1 + 10, B.matTop - B.matDepth);
  ctx.lineTo(B.matX1 - 40, B.matTop);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, B.matTop - B.matDepth, B.matTop, [[0, C.sheetShade], [1, C.sheet]]);
  ctx.fill();
  stroke(ctx);

  // 枕头：圆鼓鼓，带蕾丝边，中间被头压出一个窝
  const P = B.pillow;
  ctx.beginPath();
  ctx.moveTo(P.x0 + 40, P.bottom);
  ctx.bezierCurveTo(P.x0 - 30, P.bottom - 10, P.x0 - 20, P.top + 20, P.x0 + 60, P.top);
  ctx.bezierCurveTo((P.x0 + P.x1) / 2 - 80, P.top + 45, (P.x0 + P.x1) / 2 + 80, P.top + 45, P.x1 - 60, P.top);
  ctx.bezierCurveTo(P.x1 + 25, P.top + 20, P.x1 + 35, P.bottom - 10, P.x1 - 40, P.bottom);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, P.top, P.bottom, [[0, C.pillow], [0.55, C.pillow], [1, C.pillowShade]]);
  ctx.fill();
  stroke(ctx);
  // 蕾丝边
  ctx.save();
  ctx.strokeStyle = C.lace;
  ctx.lineWidth = 16;
  ctx.setLineDash([2, 26]);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(P.x0 + 55, P.top + 26);
  ctx.bezierCurveTo((P.x0 + P.x1) / 2 - 80, P.top + 70, (P.x0 + P.x1) / 2 + 80, P.top + 70, P.x1 - 55, P.top + 26);
  ctx.stroke();
  ctx.restore();
}

function drawFront(ctx) {
  const B = BED;
  // 床沿（木框）
  roundRect(ctx, B.matX0 - 20, B.matBottom - 30, B.matX1 + 20, B.bottom - 8, 24);
  ctx.fillStyle = vGrad(ctx, B.matBottom - 30, B.bottom, [[0, C.woodShade], [1, C.woodDeep]]);
  ctx.fill();
  stroke(ctx);
  // 床垫正面
  roundRect(ctx, B.matX0, B.matTop, B.matX1, B.matBottom, 40);
  ctx.fillStyle = vGrad(ctx, B.matTop, B.matBottom, [[0, C.sheet], [0.6, C.sheet], [1, C.sheetShade]]);
  ctx.fill();
  stroke(ctx);
}

function drawPosts(ctx) {
  const B = BED;
  post(ctx, B.headX0 - 10, B.headX0 + 95, B.headTop - 60, B.bottom);
  post(ctx, B.footX1 - 100, B.footX1 + 5, B.footTop - 60, B.bottom);
}

// 被子：顶边贴着躺姿的身体轮廓（胸前手臂的鼓包、平放的腿、翘起的脚尖），左边翻出一道白边卡在下巴下面，右边垂过床沿
const HEM = { x0: -590, x1: -470 };
const BLANKET_TOP = [
  [HEM.x0, -640], [-480, -705], [-330, -770], [-170, -872], [-20, -858], [120, -712],
  [300, -646], [480, -628], [630, -688], [770, -612], [890, -430],
];
function blanketPath(ctx) {
  const B = BED;
  const pts = BLANKET_TOP;
  ctx.beginPath();
  ctx.moveTo(HEM.x0 + 10, B.blanketBottom);
  ctx.lineTo(HEM.x0 - 5, -300);
  ctx.quadraticCurveTo(HEM.x0 - 20, pts[0][1] + 60, pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    // 用中点做二次曲线的控制点，轮廓连贯圆润
    const [mx, my] = i < pts.length - 1 ? [(x1 + pts[i + 1][0]) / 2, (y1 + pts[i + 1][1]) / 2] : [x1, y1];
    ctx.quadraticCurveTo(x1, y1, mx, my);
    if (i === pts.length - 1) ctx.lineTo(x1, y1);
  }
  ctx.quadraticCurveTo(935, -330, 925, -200);
  ctx.lineTo(915, B.blanketBottom);
  // 下摆：轻微的波浪
  const x0 = HEM.x0 + 10, x1 = 915, n = 7, w = (x1 - x0) / n;
  for (let i = 1; i <= n; i++) {
    const x = x1 - w * i;
    ctx.quadraticCurveTo(x + w / 2, B.blanketBottom + (i % 2 ? 26 : -4), x, B.blanketBottom);
  }
  ctx.closePath();
}

function drawBlanket(ctx) {
  const B = BED;
  blanketPath(ctx);
  ctx.fillStyle = vGrad(ctx, -880, B.blanketBottom, [[0, C.blanketLight], [0.3, C.blanket], [1, C.blanketDeep]]);
  ctx.fill();
  ctx.save();
  blanketPath(ctx);
  ctx.clip();
  // 波点
  ctx.fillStyle = C.dot;
  for (let y = -900, row = 0; y < 0; y += 100, row++) {
    for (let x = HEM.x0 - 40 + (row % 2) * 52; x < 980; x += 104) {
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // 绗缝线
  ctx.strokeStyle = C.stitch;
  ctx.lineWidth = 7;
  ctx.setLineDash([22, 18]);
  for (const x of [-180, 220, 600]) {
    ctx.beginPath();
    ctx.moveTo(x, -920);
    ctx.quadraticCurveTo(x + 40, -420, x - 10, 0);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(HEM.x0, -330);
  ctx.quadraticCurveTo(200, -400, 1000, -310);
  ctx.stroke();
  ctx.setLineDash([]);
  // 隆起处的高光、被子下沿的阴影
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(-400, -745);
  ctx.quadraticCurveTo(-180, -850, 40, -815);
  ctx.stroke();
  ctx.strokeStyle = "rgba(160,40,90,0.15)";
  ctx.lineWidth = 40;
  ctx.beginPath();
  ctx.moveTo(HEM.x0, B.blanketBottom - 10);
  ctx.lineTo(950, B.blanketBottom - 10);
  ctx.stroke();
  ctx.restore();
  blanketPath(ctx);
  stroke(ctx);

  // 翻出来的白色被边
  ctx.beginPath();
  ctx.moveTo(HEM.x0 + 10, B.blanketBottom);
  ctx.lineTo(HEM.x0 - 5, -300);
  ctx.quadraticCurveTo(HEM.x0 - 20, -580, HEM.x0, -640);
  ctx.quadraticCurveTo(HEM.x0 + 60, -715, HEM.x1 + 5, -712);
  ctx.quadraticCurveTo(HEM.x1 - 25, -480, HEM.x1 + 5, B.blanketBottom + 10);
  ctx.closePath();
  ctx.fillStyle = vGrad(ctx, -720, B.blanketBottom, [[0, C.hem], [1, C.hemShade]]);
  ctx.fill();
  stroke(ctx);
  // 被边上的一排小爱心
  ctx.fillStyle = C.lace;
  for (let y = -600; y < -60; y += 120) {
    heart(ctx, (HEM.x0 + HEM.x1) / 2 - 2 + (y + 600) * 0.01, y, 20);
    ctx.fill();
  }
}

// ---------------- 贴图 + 显示对象 ----------------
function makeTexture(draw, pxPerUnit, res) {
  const B = BED;
  const w = Math.ceil((B.right - B.left) * pxPerUnit * res);
  const h = Math.ceil((B.bottom - B.top) * pxPerUnit * res);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext("2d");
  ctx.scale(pxPerUnit * res, pxPerUnit * res);
  ctx.translate(-B.left, -B.top);
  draw(ctx);
  return PIXI.Texture.from(canvas, { resolution: res });
}

export class Bed {
  constructor(app) {
    this.app = app;
    this.layers = {
      back: new PIXI.Sprite(),
      front: new PIXI.Sprite(),
      blanket: new PIXI.Sprite(),
      posts: new PIXI.Sprite(),
    };
    this.visible = false;
    this.alpha = 0;
    this.blanketAlpha = 0;
    this.target = 0;
    this.blanketTarget = 0;
    this.pxPerUnit = 0;
    this.inBed = false;
    this.breath = 0;
    for (const s of Object.values(this.layers)) { s.alpha = 0; s.visible = false; }
    app.ticker.add(this.tick, this);
  }

  // 床在不在（正在出现 / 消失也算）
  get shown() { return this.target > 0 || this.alpha > 0.001; }

  // 挂到舞台上（换衣服后角色是新的 spine，要重新挂）
  attach(spine) {
    this.spine = spine;
    this.hide(true);
    this.setInBed(false);
  }

  detach() {
    for (const s of Object.values(this.layers)) s.parent?.removeChild(s);
    this.spine = null;
  }

  // inBed = 她躺在床上：床垫正面、被子、近处的床柱挡在她前面；否则整张床都在她身后
  setInBed(on) {
    this.inBed = on;
    const sp = this.spine, stage = this.app.stage;
    if (!sp || sp.parent !== stage) return;
    for (const s of Object.values(this.layers)) s.parent?.removeChild(s);
    let i = stage.getChildIndex(sp);
    stage.addChildAt(this.layers.back, i++);
    if (on) i++;
    for (const k of ["front", "blanket", "posts"]) stage.addChildAt(this.layers[k], i++);
  }

  // 跟着角色的位置和缩放（缩放变了就重画）
  sync() {
    const sp = this.spine;
    if (!sp) return;
    const ppu = Math.abs(sp.scale.y);
    if (Math.abs(ppu - this.pxPerUnit) > 1e-4) this.redraw(ppu);
    const flip = Math.sign(sp.scale.x) || 1;
    for (const s of Object.values(this.layers)) {
      s.x = sp.x + BED.left * ppu * flip;
      s.y = sp.y + BED.top * ppu;
      s.scale.x = flip;
    }
    // 被子以下摆为轴随呼吸起伏
    const b = this.layers.blanket;
    const pivotY = (BED.blanketBottom - BED.top) * ppu;
    const breathe = 1 + (this.breath || 0) * 0.03;
    b.pivot.y = pivotY;
    b.y = sp.y + BED.top * ppu + pivotY;
    b.scale.y = breathe;
  }

  redraw(ppu) {
    this.pxPerUnit = ppu;
    const res = this.app.renderer.resolution;
    const draws = { back: drawBack, front: drawFront, blanket: drawBlanket, posts: drawPosts };
    for (const [k, draw] of Object.entries(draws)) {
      const old = this.layers[k].texture;
      this.layers[k].texture = makeTexture(draw, ppu, res);
      if (old && old !== PIXI.Texture.EMPTY) old.destroy(true);
    }
  }

  show() { this.target = 1; this.visible = true; }
  // instant = 立刻消失（换衣服、换大小、被拎走时不等淡出）
  hide(instant = false) {
    this.target = 0;
    this.blanketTarget = 0;
    if (instant) {
      this.alpha = this.blanketAlpha = 0;
      for (const s of Object.values(this.layers)) s.visible = false;
    }
  }
  coverUp(on) { this.blanketTarget = on ? 1 : 0; }

  tick() {
    const dt = Math.min(0.1, this.app.ticker.deltaMS / 1000);
    const step = (v, t, speed) => (v < t ? Math.min(t, v + dt * speed) : Math.max(t, v - dt * speed));
    this.alpha = step(this.alpha, this.target, 4);
    this.blanketAlpha = step(this.blanketAlpha, Math.min(this.blanketTarget, this.target), 3.5);
    const on = this.alpha > 0.001;
    for (const [k, s] of Object.entries(this.layers)) {
      s.visible = on && (k !== "blanket" || this.blanketAlpha > 0.001);
      s.alpha = k === "blanket" ? this.blanketAlpha : this.alpha;
    }
    if (!on) { this.visible = false; return; }
    this.sync();
  }

  destroy() {
    this.app.ticker.remove(this.tick, this);
    this.detach();
  }
}
