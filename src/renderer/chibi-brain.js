// Q 版的自主活动：没人理她的时候自己小跑、冲刺、蹦跳、跳舞、坐下、打瞌睡、东张西望、自言自语。
// 每个动作是一个可中断的 async 函数；点她、拖她、开对话框都会立刻打断。

const CANCEL = Symbol("cancel");

// 庆祝 / 跳舞用的胜利动作（tools/build-assets.mjs 里保留的那些）
const DANCES = ["Victory01", "Victory04", "Victory05", "Victory06", "Victory12", "Victory13", "Victory18",
  "Victory26", "Victory38", "Victory42", "Victory49", "Victory57", "Victory71", "MpRecover", "WaitAprilFool"];

// 活跃程度 1~4：两次动作之间的间隔（秒）与各动作的权重
const LEVELS = {
  1: { gap: [14, 28], w: { walk: 3, dash: 0, hop: 1, dance: 1, sit: 3, sleep: 2, look: 2, talk: 1 } },
  2: { gap: [7, 15], w: { walk: 4, dash: 1, hop: 2, dance: 2, sit: 2, sleep: 1, look: 2, talk: 1 } },
  3: { gap: [3.5, 8], w: { walk: 4, dash: 2, hop: 3, dance: 3, sit: 1, sleep: 0.3, look: 2, talk: 1.5 } },
  4: { gap: [1.5, 4], w: { walk: 3, dash: 4, hop: 4, dance: 4, sit: 0.5, sleep: 0, look: 1, talk: 2 } },
};

// 跳跃相关姿势（根骨骼位移已在 ChibiPet 里锁住）：
// MoveJump 开头 = 下蹲蓄力；MoveLanding 开头 = 空中姿势（单手举起、腿收起）；MoveLanding 0.13s 起 = 落地缓冲 → 站起
const AIR = ["MoveLanding", 0.02];
const LAND_FROM = 0.13;
const CROUCH_SEC = 0.08;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class ChibiBrain {
  /**
   * ctx: {
   *   pet(): 当前 ChibiPet，settings(): 当前设置，api: preload API，
   *   busy(): 正在说话 / 开着对话框 / 拖动中，idleMs(): 距离上次互动的毫秒数，
   *   say(text), manpu(kind, ms), face(name), line(kind), isNight()
   * }
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.token = null;        // 当前动作的取消令牌
    this.action = null;       // 当前动作名
    this.motion = null;       // 正在进行的位移（由 tick 推进）
    this.timer = 4;
    this.sleeping = false;
    this.x = 0; this.y = 0; this.w = 0; this.h = 0; this.wa = null;
    this.restY = null;        // 关闭「下落」时，她停留的高度
  }

  get pet() { return this.ctx.pet(); }
  get scale() { return this.ctx.settings().scale || 1; }

  // ---------------- 生命周期 ----------------
  // 载入 / 切换形态 / 被放下：开启下落就掉到屏幕底部，否则停在原地
  reset({ dropped = false } = {}) {
    this.interrupt(dropped ? "drag" : "");
    this.timer = 3;
    this.run("fall", async () => {
      if (this.ctx.settings().chibiFall !== false) return this.fallToGround();
      this.restY = this.y;
      if (dropped) await this.landing();
      else this.idle();
    });
  }

  // 被鼠标拎着时的姿势
  carry() {
    const pet = this.pet;
    if (!pet?.spine) return;
    pet.pose(...AIR).timeScale = 0;
    pet.setFace("Surprise");
  }

  // 被打断（点击、拖动、对话、AI 情绪）
  interrupt(reason = "") {
    const wasSleeping = this.sleeping;
    if (this.token) this.token.cancelled = true;
    this.token = null;
    this.action = null;
    if (this.motion) { this.motion.reject?.(CANCEL); this.motion = null; }
    this.sleeping = false;
    const pet = this.pet;
    if (pet?.spine && pet.kind === "chibi") {
      pet.spine.state.timeScale = 1;
      if (reason !== "emote") pet.setFace("Normal"); // 情绪动作自己带表情
      if (reason === "click" && wasSleeping) {
        pet.play("recover", false, "idle");
        this.ctx.say(this.ctx.line("chibiWake"));
      } else if (reason !== "emote" && reason !== "drag") {
        pet.play("idle", true);
      }
    }
    this.timer = Math.max(this.timer, 4);
  }

  // ---------------- 每帧 ----------------
  // dt 为真实流逝秒数；位移按 ≤50ms 的小步推进，掉帧时也不会穿过目标
  tick(dt) {
    const pet = this.pet;
    if (!pet?.spine || pet.kind !== "chibi") return;
    dt = Math.min(dt, 1);
    if (this.motion) {
      for (let left = dt; left > 0 && this.motion; left -= 0.05) this.stepMotion(Math.min(0.05, left));
      return;
    }
    if (this.action) return;
    if (this.ctx.busy()) { this.timer = Math.max(this.timer, 2); return; }

    const s = this.ctx.settings();
    if (!s.chibiAuto) return;
    this.timer -= dt;
    if (this.timer > 0) return;

    const idle = this.ctx.idleMs() / 1000;
    const level = LEVELS[s.chibiActivity] || LEVELS[2];
    if (idle < (Number(s.chibiIdleSeconds) || 0)) {
      // 还没到「自己玩」的时候：安安静静，偶尔看看四周
      this.timer = rand(20, 40);
      if (Math.random() < 0.4 && this.allowed("look")) this.run("look", () => this.look());
      return;
    }
    this.timer = rand(...level.gap);
    const kind = this.choose(level, idle);
    if (kind) this.run(kind, () => this[kind]());
  }

  allowed(kind) {
    const a = this.ctx.settings().chibiActions || {};
    return a[kind] !== false;
  }

  choose(level, idle) {
    const s = this.ctx.settings();
    const entries = Object.entries(level.w).filter(([k, w]) => {
      if (!w || !this.allowed(k)) return false;
      // 打瞌睡：深夜，或者已经很久没人理她
      if (k === "sleep") return this.ctx.isNight() || idle > (Number(s.chibiIdleSeconds) || 0) + 180;
      return true;
    });
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let r = Math.random() * total;
    for (const [k, w] of entries) { if ((r -= w) <= 0) return k; }
    return entries[0]?.[0] || null;
  }

  async run(name, fn) {
    if (this.token) this.token.cancelled = true;
    const token = { cancelled: false };
    this.token = token;
    this.action = name;
    try {
      await this.syncBounds();
      this.check(token);
      // 每个动作都从地面开始（比如掉落途中被情绪动作打断）
      if (name !== "fall" && this.y < this.ground - 2) await this.fallToGround();
      this.check(token);
      await fn();
    } catch (e) {
      if (e !== CANCEL) console.error(`[chibi] ${name}`, e);
    } finally {
      if (this.token === token) {
        this.token = null;
        this.action = null;
        this.sleeping = false;
        const pet = this.pet;
        if (pet?.kind === "chibi" && pet.spine) pet.spine.state.timeScale = 1;
        this.ctx.api.savePosition();
      }
    }
  }

  check(token = this.token) {
    if (!token || token.cancelled) throw CANCEL;
  }

  // ---------------- 基础动作 ----------------
  async syncBounds() {
    const b = await this.ctx.api.getBounds();
    this.wa = await this.ctx.api.workArea();
    Object.assign(this, { x: b.x, y: b.y, w: b.width, h: b.height });
  }

  // 地面：开启下落时是屏幕底部；关闭时是她被放下的高度
  get ground() {
    const bottom = this.wa.y + this.wa.height - this.h;
    if (this.ctx.settings().chibiFall !== false) return bottom;
    return Math.min(bottom, Math.max(this.wa.y, this.restY ?? this.y));
  }
  // 窗口完整留在屏幕内（否则气泡、对话框会被屏幕边缘截掉）
  get minX() { return this.wa.x; }
  get maxX() { return this.wa.x + this.wa.width - this.w; }

  wait(sec) {
    const token = this.token;
    return new Promise((resolve, reject) => {
      setTimeout(() => (token && !token.cancelled && token === this.token ? resolve() : reject(CANCEL)), sec * 1000);
    });
  }

  // 播一段动画并等它播完（loop 时等 sec 秒）
  async play(anim, { loop = false, sec = 0, then = null } = {}) {
    const st = this.pet.spine.state;
    st.setAnimation(0, anim, loop);
    if (then) st.addAnimation(0, then, true, 0);
    const dur = this.pet.spine.spineData.findAnimation(anim)?.duration || 1;
    await this.wait(loop ? sec : dur);
  }

  idle() { this.pet.play("idle", true); }

  // 位移由 tick 推进：move（水平移动）、hop（抛物线跳）、fall（掉到地面）
  startMotion(m) {
    return new Promise((resolve, reject) => { this.motion = { ...m, t: 0, resolve, reject }; });
  }

  stepMotion(dt) {
    const m = this.motion;
    const api = this.ctx.api;
    m.t += dt;
    if (m.type === "move") {
      const dir = Math.sign(m.to - this.x);
      this.x += dir * m.speed * dt;
      if ((dir > 0 && this.x >= m.to) || (dir < 0 && this.x <= m.to) || dir === 0) {
        this.x = m.to;
        this.motion = null;
        m.resolve();
      }
    } else if (m.type === "hop") {
      const k = Math.min(1, m.t / m.dur);
      this.x = m.x0 + (m.x1 - m.x0) * k;
      this.y = m.y0 - 4 * m.height * k * (1 - k);
      if (k >= 1) { this.y = m.y0; this.motion = null; m.resolve(); }
    } else if (m.type === "fall") {
      m.vy = (m.vy || 0) + 2600 * this.scale * dt;
      this.y += m.vy * dt;
      if (this.y >= this.ground) { this.y = this.ground; this.motion = null; m.resolve(); }
    }
    api.setPosition(this.x, this.y);
  }

  clampX(x) { return Math.min(this.maxX, Math.max(this.minX, x)); }

  // 选一个目标点：太靠边就往回走
  target(dist) {
    let to = this.x + (Math.random() < 0.5 ? -dist : dist);
    if (to < this.minX || to > this.maxX) to = this.x - (to - this.x);
    return this.clampX(to);
  }

  async moveTo(to, speed, timeScale) {
    if (Math.abs(to - this.x) < 8) return;
    this.pet.setFacing(to > this.x ? 1 : -1);
    this.pet.spine.state.setAnimation(0, "MoveFront", true);
    this.pet.spine.state.timeScale = timeScale;
    await this.startMotion({ type: "move", to, speed });
    this.pet.spine.state.timeScale = 1;
  }

  // 下落：空中姿势定格 → 落地缓冲 → 站起；掉得高会吓一跳
  async fallToGround() {
    if (!this.wa || this.y >= this.ground - 2) { this.idle(); return; }
    const high = this.ground - this.y > 220 * this.scale;
    this.pet.pose(...AIR);
    if (high) { this.pet.setFace("Surprise"); this.ctx.manpu("exclaim", 1200); }
    await this.startMotion({ type: "fall" });
    await this.landing();
    if (high) this.pet.setFace("Normal");
  }

  async landing() {
    await this.wait(this.pet.playFrom("MoveLanding", LAND_FROM));
  }

  // ---------------- 自主动作 ----------------
  // 小跑：Q 版骨骼没有走路动画，用放慢的跑步
  async walk() {
    const to = this.target(rand(100, 380) * this.scale);
    await this.moveTo(to, 95 * this.scale, 0.75);
    this.idle();
    if (Math.random() < 0.25) { this.pet.setFace("Smile"); await this.wait(1.2); this.pet.setFace("Normal"); }
  }

  // 冲刺：跑一大段，结尾欢呼或者摆个姿势
  async dash() {
    const to = this.target(rand(300, 700) * this.scale);
    this.pet.setFace("Strong");
    await this.moveTo(to, 300 * this.scale, 1.3);
    this.pet.setFace("Smile");
    if (Math.random() < 0.5) await this.play("Victory01", { then: "WaitDefault" });
    else await this.play("PassSword", { then: "WaitDefault" });
    this.pet.setFace("Normal");
  }

  // 蹦跳：窗口真的会跳起来，可能原地也可能往前
  async hop() {
    const times = 1 + Math.floor(Math.random() * 3);
    const forward = Math.random() < 0.6 ? (Math.random() < 0.5 ? -1 : 1) : 0;
    if (forward) this.pet.setFacing(forward);
    this.pet.setFace("Smile");
    const st = this.pet.spine.state;
    for (let i = 0; i < times; i++) {
      const y0 = this.ground;
      this.y = Math.min(this.y, y0);
      st.setAnimation(0, "MoveJump", false);       // 下蹲蓄力
      await this.wait(CROUCH_SEC);
      this.pet.pose(...AIR);                        // 空中
      await this.startMotion({
        type: "hop", dur: 0.55, height: rand(50, 90) * this.scale,
        x0: this.x, x1: this.clampX(this.x + forward * 45 * this.scale), y0,
      });
      this.pet.playFrom("MoveLanding", LAND_FROM); // 落地缓冲
      await this.wait(0.22);
    }
    if (Math.random() < 0.35) this.ctx.manpu("note", 1800);
    await this.wait(0.4);
    this.pet.setFace("Normal");
  }

  // 庆祝 / 跳舞
  async dance() {
    const anim = pick(DANCES);
    this.pet.setFace(Math.random() < 0.5 ? "Smile" : "Smile_L");
    if (Math.random() < 0.5) this.ctx.manpu(Math.random() < 0.7 ? "note" : "sparkle", 2400);
    await this.play(anim, { then: "WaitDefault" });
    await this.wait(0.3);
    this.pet.setFace("Normal");
  }

  // 坐下休息：坐到地上，或者趴着
  async sit() {
    const sec = rand(6, 16);
    if (Math.random() < 0.6) {
      await this.play("Victory17");               // 坐到地上（结尾停在坐姿）
      if (Math.random() < 0.3) this.ctx.manpu("note", 2000);
      await this.wait(sec);
      this.idle();
    } else {
      await this.play("RestActive", { then: "RestLoop" });
      await this.wait(sec);
      await this.play("RestRecover", { then: "WaitDefault" });
    }
  }

  // 打瞌睡：躺下、闭眼、冒 Zzz；点她会被吵醒
  async sleep() {
    this.pet.setFace("Close");
    await this.play("DeathActive", { then: "DeathLoop" });
    this.sleeping = true;
    const end = performance.now() + rand(15, 40) * 1000;
    while (performance.now() < end) {
      this.ctx.manpu("zzz", 3000);
      await this.wait(3.2);
    }
    this.sleeping = false;
    await this.play("DeathRecover", { then: "WaitDefault" });
    this.pet.setFace("Normal");
    if (Math.random() < 0.5) this.ctx.say(this.ctx.line("chibiWakeSelf"));
  }

  // 东张西望
  async look() {
    const flips = 2 + Math.floor(Math.random() * 2);
    if (Math.random() < 0.5) this.ctx.manpu("question", 2200);
    for (let i = 0; i < flips; i++) {
      this.pet.setFacing(-(this.pet.facing || 1));
      await this.wait(rand(0.6, 1.3));
    }
  }

  // 自言自语（本地台词，不消耗 token）
  async talk() {
    this.ctx.say(this.ctx.line(this.ctx.isNight() ? "chibiTalkNight" : "chibiTalk"));
    await this.wait(2);
  }

  // AI 情绪标签 / 菜单里的「表演情绪」触发的一次性动作
  async emote(kind) {
    if (kind === "idle") return;
    this.interrupt("emote");
    const map = {
      victory: "Victory42", cheer: "Victory01", pose: "Victory13", spin: "Victory26", hurt: "DamageSword",
    };
    await this.run(`emote:${kind}`, async () => {
      switch (kind) {
        case "jump": await this.hop(); break;
        case "sit":
          await this.play("Victory17");
          await this.wait(6);
          this.idle();
          break;
        case "faint":
          await this.play("DeathActive", { then: "DeathLoop" });
          await this.wait(2.2);
          await this.play("DeathRecover", { then: "WaitDefault" });
          break;
        default:
          await this.play(map[kind] || kind, { then: "WaitDefault" });
      }
    });
    this.timer = Math.max(this.timer, 5);
  }
}
