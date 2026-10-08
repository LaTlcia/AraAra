// Q 版的自主活动：没人理她的时候自己小跑、冲刺、蹦跳、跳舞、坐下、东张西望、自言自语。
// 每个动作是一个可中断的 async 函数；点她、拖她、开对话框都会立刻打断。
// 睡觉（搬出小床、盖被子）也在这里演，什么时候睡、什么时候醒由 pet.js 决定。

const CANCEL = Symbol("cancel");

// 庆祝 / 跳舞用的胜利动作（tools/build-assets.mjs 里保留的那些）
const DANCES = ["Victory01", "Victory04", "Victory05", "Victory06", "Victory12", "Victory13", "Victory17", "Victory18",
  "Victory26", "Victory38", "Victory42", "Victory49", "Victory57", "Victory71", "MpRecover", "WaitAprilFool"];

// 活跃程度 1~4：两次动作之间的间隔（秒）与各动作的权重
const LEVELS = {
  1: { gap: [14, 28], w: { walk: 3, dash: 0, hop: 1, dance: 1, sit: 3, look: 2, talk: 1 } },
  2: { gap: [7, 15], w: { walk: 4, dash: 1, hop: 2, dance: 2, sit: 2, look: 2, talk: 1 } },
  3: { gap: [3.5, 8], w: { walk: 4, dash: 2, hop: 3, dance: 3, sit: 1, look: 2, talk: 1.5 } },
  4: { gap: [1.5, 4], w: { walk: 3, dash: 4, hop: 4, dance: 4, sit: 0.5, look: 1, talk: 2 } },
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
   *   pet(): 当前 ChibiPet，settings(): 当前设置，api: preload API，bed: 小床（bed.js），
   *   busy(): 正在说话 / 开着对话框 / 拖动中，idleMs(): 距离上次互动的毫秒数，
   *   say(text), manpu(kind, ms), line(kind), isNight(),
   *   deepSleep(): 这一觉是不是熟睡（夜里 / 被哄睡），shouldWake(): 睡够了没有（白天的小盹）
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
    this.interrupt(dropped ? "drag" : "reset");
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

  // 被打断（点击、拖动、对话、AI 情绪；reset = 换衣服 / 换大小后重新落地）
  // 在床上的时候：被拎走、重置就直接收起床；其余情况掀开被子起床（情绪动作自己会先起床）
  interrupt(reason = "") {
    const bed = this.ctx.bed;
    const inBed = bed?.shown;
    const hard = reason === "drag" || reason === "reset";
    if (this.action === "wake" && !hard) return; // 正在起床，让她起完
    if (this.token) this.token.cancelled = true;
    this.token = null;
    this.action = null;
    if (this.motion) { this.motion.reject?.(CANCEL); this.motion = null; }
    this.sleeping = false;
    this.timer = Math.max(this.timer, 4);
    const pet = this.pet;
    if (!pet?.spine || pet.kind !== "chibi") return;
    pet.spine.state.timeScale = 1;
    if (inBed && hard) bed.hide(reason === "reset");
    if (inBed && !hard && reason !== "emote") {
      this.run("wake", () => this.getUp({ startled: true }));
      return;
    }
    if (reason !== "emote") pet.setFace("Normal"); // 情绪动作自己带表情
    if (reason !== "emote" && reason !== "drag") pet.play("idle", true);
  }

  // 床摆出来了（睡着、正在上床或者正在起床）
  get inBed() { return Boolean(this.ctx.bed?.shown); }

  // 去睡觉（犯困了，或者菜单里「哄她睡觉」）
  goToSleep() {
    if (this.inBed || this.action === "sleep" || this.action === "wake") return;
    this.interrupt("sleep");
    this.run("sleep", () => this.sleep());
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
    const entries = Object.entries(level.w).filter(([k, w]) => w && this.allowed(k));
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
        if (name === "sleep" || name === "wake") this.ctx.bed?.hide(); // 出错时也别把床留在那里
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

  // 坐下休息：侧坐在地上歇一会儿
  async sit(sec = rand(6, 16)) {
    await this.play("RestActive", { then: "RestLoop" });
    if (Math.random() < 0.3) this.ctx.manpu("note", 2000);
    await this.wait(sec);
    await this.play("RestRecover", { then: "WaitDefault" });
  }

  // 犯困（醒着时的「困倦」情绪）：坐下来闭着眼睛点几下头
  async doze() {
    await this.play("RestActive", { then: "RestLoop" });
    this.pet.setFace("Close");
    this.ctx.manpu("zzz", 3600);
    await this.wait(4);
    this.pet.setFace("Normal");
    await this.play("RestRecover", { then: "WaitDefault" });
  }

  // 睡觉：搬出小床 → 跳上床、盖好被子 → 一直睡到 ctx.shouldWake()（夜里 / 被哄睡时只有被叫醒才起来）→ 自己起床
  async sleep() {
    const pet = this.pet, bed = this.ctx.bed, st = pet.spine.state;
    bed.setInBed(false);
    bed.coverUp(false);
    bed.show();
    pet.setFace("Smile");
    await this.wait(0.5);                                  // 床出现
    st.setAnimation(0, "SleepIntro", false);
    const loop = st.addAnimation(0, "SleepLoop", true, 0);
    loop.timeScale = this.ctx.deepSleep() ? 0.75 : 1;      // 熟睡时呼吸慢一点
    await this.wait(0.56);                                 // 跳到半空，脚已经高过床垫
    bed.setInBed(true);
    await this.wait(Math.max(0.1, this.anim("SleepIntro") - 0.56));
    pet.setFace("Sleep");
    bed.coverUp(true);
    this.sleeping = true;
    while (!this.ctx.shouldWake()) await this.wait(1);
    await this.getUp();
  }

  // 起床：掀开被子 → 坐起来跳下床 → 收起床。startled = 被叫醒（表情交给叫醒时说的那句话）
  async getUp({ startled = false } = {}) {
    const pet = this.pet, bed = this.ctx.bed, st = pet.spine.state;
    this.sleeping = false;
    bed.coverUp(false);
    if (!startled) pet.setFace("Normal");
    else if (pet.faceName === "Sleep") pet.setFace("Surprise");
    await this.wait(startled ? 0.15 : 0.6);
    if (!bed.inBed) {                                      // 还没躺进去就被叫住了
      bed.hide();
      this.idle();
      return;
    }
    st.setAnimation(0, "SleepWake", false);
    st.addAnimation(0, "WaitDefault", true, 0);
    await this.wait(0.1);                                  // 坐起来，脚要从床沿前面荡下来了
    bed.setInBed(false);
    await this.wait(Math.max(0.1, this.anim("SleepWake") - 0.1));
    bed.hide();
    await this.wait(0.35);
    if (pet.faceName === "Surprise" || pet.faceName === "Sleep") pet.setFace("Normal");
  }

  anim(name) { return this.pet.spine.spineData.findAnimation(name)?.duration || 1; }

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
  // 在床上的时候：犯困就接着睡；别的情绪先起床再演
  async emote(kind) {
    if (kind === "idle") return;
    const inBed = this.inBed;
    if (kind === "doze" && inBed) return;
    this.interrupt("emote");
    const map = {
      victory: "Victory42", cheer: "Victory01", pose: "Victory13", spin: "Victory26", hurt: "DamageSword",
    };
    await this.run(`emote:${kind}`, async () => {
      if (inBed) await this.getUp({ startled: true });
      switch (kind) {
        case "jump": await this.hop(); break;
        case "sit": await this.sit(6); break;
        case "doze": await this.doze(); break;
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
