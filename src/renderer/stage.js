// PIXI 舞台 + 亚罗椰的 spine 角色（jobspine 立绘 / chibi Q 版）
// 依赖全局 PIXI（pixi.js 6）与 PIXI.spine（pixi-spine 3.1，3.6 骨骼走 3.7 运行时）
import { JOB_SLOTS, JOB_FACES, CHIBI_FACES } from "./faces.js";

const { PIXI } = window;

export function createApp(canvasParent) {
  const app = new PIXI.Application({
    resizeTo: canvasParent,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
    preserveDrawingBuffer: true, // 鼠标穿透要读像素
  });
  canvasParent.appendChild(app.view);
  return app;
}

// 图集里尺寸为 0×0 的区域是「这套衣服没有这个部件」的占位。游戏里不画，
// 但 pixi 遇到 0×0 的贴图帧会退回整张贴图，结果整张图集被铺在网格上（比如 81042 的 BodyBack）。
// 载入后把引用空区域的附件从皮肤里删掉，插槽就什么都不显示。
function stripEmptyAttachments(data) {
  let removed = 0;
  for (const skin of data.skins) {
    for (const map of skin.attachments) {
      if (!map) continue;
      for (const name of Object.keys(map)) {
        const r = map[name]?.region;
        if (r && (!r.width || !r.height)) { delete map[name]; removed++; }
      }
    }
  }
  for (const slot of data.slots) {
    if (slot.attachmentName && !data.skins.some((sk) => sk.getAttachment(slot.index, slot.attachmentName))) slot.attachmentName = null;
  }
  return removed;
}

let loadSeq = 0;
function loadSpine(base) {
  return new Promise((resolve, reject) => {
    const loader = new PIXI.Loader();
    const key = `spine${++loadSeq}`;
    loader.add(key, `${base}/skeleton.json`, { metadata: { spineAtlasFile: `${base}/skeleton.atlas` } });
    loader.onError.once((err) => reject(err));
    loader.load((_, res) => {
      if (res[key] && res[key].spineData) { stripEmptyAttachments(res[key].spineData); resolve(res[key].spineData); }
      else reject(new Error(`加载失败：${base}`));
    });
  });
}

// 骨骼和图集不在同一目录（Q 版共用骨骼）：贴图按图集所在目录加载
export function loadSpineWithAtlas(skeletonUrl, atlasUrl) {
  const atlasDir = atlasUrl.slice(0, atlasUrl.lastIndexOf("/") + 1);
  const imageLoader = () => (page, callback) => {
    const tex = PIXI.BaseTexture.from(atlasDir + page);
    if (tex.valid) callback(tex);
    else tex.once("loaded", () => callback(tex));
  };
  return new Promise((resolve, reject) => {
    const loader = new PIXI.Loader();
    const key = `spine${++loadSeq}`;
    loader.add(key, skeletonUrl, { metadata: { spineAtlasFile: atlasUrl, imageLoader } });
    loader.onError.once((err) => reject(err));
    loader.load((_, res) => {
      if (res[key] && res[key].spineData) { stripEmptyAttachments(res[key].spineData); resolve(res[key].spineData); }
      else reject(new Error(`加载失败：${atlasUrl}`));
    });
  });
}

// 动作名 → jobspine 动画
// intro 播一次 → loop 持续 → end 收尾 → 回到 01BaseLoop
export const JOB_MOTIONS = {
  Base:         { loop: "01BaseLoop" },
  Fun:          { intro: "02Fun", loop: "02FunLoop", end: "02FunEnd" },
  Anger:        { intro: "03Anger", loop: "03AngerLoop", end: "03AngerEnd" },
  Shy:          { intro: "04Shy", loop: "04ShyLoop", end: "04ShyEnd" },
  Surprise:     { intro: "05Surprise", loop: "05SurpriseLoop", end: "05SurpriseEnd" },
  Think:        { intro: "S_01Think", loop: "S_01ThinkLoop", end: "S_01ThinkEnd" },
  Positive:     { intro: "S_02Positive" },
  PoseChange03: { intro: "S_03PoseChange", loop: "S_03PoseChangeLoop", end: "S_03PoseChangeEnd" },
  PoseChange04: { intro: "S_04PoseChange", loop: "S_04PoseChangeLoop", end: "S_04PoseChangeEnd" },
  PoseChange05: { intro: "S_05PoseChange", loop: "S_05PoseChangeLoop", end: "S_05PoseChangeEnd" },
  Negative:     { intro: "S_06Negative" },
  Disagree:     { intro: "S_06Negative" },
  // 打瞌睡（犯困的情绪）：头垂下去点几下，然后惊醒。真正睡着用 JobPet.sleep()
  Sleep:        { intro: "Sleep", loop: "SleepLoop", end: "SleepEnd" },
};

// Q 版：锁住哪些骨骼的位移（MoveJump/MoveLanding 的 Move 会甩出约 7000 单位，TR 也有上千单位的水平位移）
const ROOT_LOCK = { default: ["Move"], MoveJump: ["Move", "TR"], MoveLanding: ["Move", "TR"] };

// Q 版发型（服装数据里的 hairType）
const HAIR_SLOTS = ["HairTail_Top", "HairTail_LeftUpper", "HairTail_RightUpper", "HairTail_LeftBottom", "HairTail_RightBottom"];
const HAIR_TYPES = { 1: [], 2: [0], 3: [1], 4: [2], 5: [3], 6: [4], 7: [1, 2], 8: [3, 4] };

class BasePet {
  constructor(app) {
    this.app = app;
    this.spine = null;
    this.faceName = "Normal";
    this.talking = false;
    this.listeners = {};
  }
  on(event, fn) { (this.listeners[event] ||= []).push(fn); }
  emit(event, ...args) { (this.listeners[event] || []).forEach((fn) => fn(...args)); }

  mount(spine) {
    if (this.spine) {
      this.app.stage.removeChild(this.spine);
      this.spine.destroy({ children: true });
    }
    this.spine = spine;
    spine.autoUpdate = true;
    this.app.stage.addChild(spine);
    // 在 state.apply 之后、插槽显示对象刷新之前覆盖表情附件
    const state = spine.state;
    const apply = state.apply.bind(state);
    state.apply = (skeleton) => {
      const r = apply(skeleton);
      this.applyOverrides(skeleton);
      return r;
    };
  }

  setAttachment(slotName, attachmentName) {
    const sk = this.spine.skeleton;
    const slot = sk.findSlot(slotName);
    if (!slot) return;
    if (!attachmentName) { slot.setAttachment(null); return; }
    const att = sk.getAttachmentByName(slotName, attachmentName);
    slot.setAttachment(att || null);
  }

  // 头部在舞台坐标里的位置（给气泡和漫符定位）
  headPoint() {
    const b = this.spine.skeleton.findBone(this.headBone);
    if (!b) return { x: this.spine.x, y: this.spine.y - 200 };
    const p = this.spine.toGlobal(new PIXI.Point(b.worldX, b.worldY));
    return { x: p.x, y: p.y };
  }

  layout() {}
  applyOverrides() {}
}

// ============================================================
// jobspine：大立绘，表情 + 动作
// ============================================================
export class JobPet extends BasePet {
  constructor(app) {
    super(app);
    this.kind = "job";
    this.headBone = "FaceFront";
    this.motionName = "Base";
    this.motionTimer = null;
    this.blink = { next: 2 + Math.random() * 3, phase: 0 };
    this.mouthOpen = 0;
    this.mouthTimer = 0;
    this.scaleFactor = 1;
    this.sleeping = false;
  }

  async load(costume, assetsBase) {
    const data = await loadSpine(`${assetsBase}/${costume.jobspine}`);
    const spine = new PIXI.spine.Spine(data);
    this.bounds = null;
    this.sleeping = false;
    this.motionName = "Base";
    this.mount(spine);
    spine.state.data.defaultMix = 0.25;
    this.setFace(this.faceName);
    this.playMotion("Base", { quiet: true });
    this.layout();
    this.app.ticker.remove(this.tick, this);
    this.app.ticker.add(this.tick, this);
  }

  destroy() {
    this.app.ticker.remove(this.tick, this);
  }

  layout(scale = this.scaleFactor) {
    if (!this.spine) return;
    this.scaleFactor = scale;
    const { width, height } = this.app.screen;
    if (!this.bounds) {
      this.spine.scale.set(1);
      this.spine.update(0);
      this.bounds = this.spine.getLocalBounds().clone();
    }
    const b = this.bounds;
    // 身体占满窗口高度（留出头顶给气泡的空间由窗口布局决定）
    const s = (height / b.height) * scale;
    this.spine.scale.set(s);
    this.spine.x = width / 2 - (b.x + b.width / 2) * s;
    this.spine.y = height - (b.y + b.height) * s;
  }

  setFace(name) {
    if (!JOB_FACES[name]) name = "Normal";
    this.faceName = name;
    this.faceDirty = true;
  }

  // 动作：intro → loop（loopSeconds 秒）→ end → Base。睡着的时候先惊醒（SleepEnd）再接动作
  playMotion(name, { loopSeconds = 3.2, quiet = false } = {}) {
    if (!this.spine) return;
    if (this.sleeping && name === "Sleep") return; // 已经睡着了，犯困不用再演
    const m = JOB_MOTIONS[name] || JOB_MOTIONS.Base;
    const st = this.spine.state;
    clearTimeout(this.motionTimer);
    let lead = 0;
    if (this.sleeping) {
      this.sleeping = false;
      st.setAnimation(0, "SleepEnd", false);
      lead = this.animDuration("SleepEnd");
    }
    const start = (anim, loop) => (lead ? st.addAnimation(0, anim, loop, 0) : st.setAnimation(0, anim, loop));
    this.motionName = name;
    if (!m.intro) {
      start(m.loop, true);
      return;
    }
    start(m.intro, false);
    if (m.loop) {
      st.addAnimation(0, m.loop, true, 0);
      this.motionTimer = setTimeout(() => this.endMotion(), (lead + this.animDuration(m.intro) + loopSeconds) * 1000);
    } else {
      st.addAnimation(0, JOB_MOTIONS.Base.loop, true, 0);
      this.motionTimer = setTimeout(() => {
        if (this.motionName === name) this.motionName = "Base";
        this.emit("motionEnd", name);
      }, (lead + this.animDuration(m.intro)) * 1000);
    }
    if (!quiet) this.emit("motion", name);
  }

  // 睡着：犯困垂头 → 打几下瞌睡 → 熟睡（头靠下来不再点头，呼吸放慢），一直睡到 wake()
  // deep = 直接熟睡（比如夜里）
  sleep({ deep = false } = {}) {
    if (!this.spine || this.sleeping) return;
    clearTimeout(this.motionTimer);
    const st = this.spine.state;
    let entry = st.tracks[0];
    const cur = entry?.animation?.name;
    // 犯困的情绪动作正演到一半：接着睡下去，不从头再来（去掉排在后面的「惊醒」）
    if (cur === "Sleep" || cur === "SleepLoop") (st.clearNext || st.disposeNext).call(st, entry);
    else entry = st.setAnimation(0, "Sleep", false);
    if (entry.animation.name === "Sleep") entry = st.addAnimation(0, "SleepLoop", true, 0);
    // 在 SleepLoop 头往下沉的阶段（循环里的 1.2 秒处）开始过渡到熟睡，不会撞上点头
    const LOOP = this.animDuration("SleepLoop");
    const at = Math.ceil((entry.trackTime - 1.2) / LOOP) * LOOP + 1.2 + (deep ? 0 : LOOP);
    st.addAnimation(0, "SleepDeep", true, Math.max(1.2, at)).mixDuration = 1.6;
    this.motionName = "Sleep";
    this.sleeping = true;
    this.setFace("Sleep");
  }

  // 醒来：startled = 被叫醒（猛地抬头），否则是睡饱了慢慢抬头伸懒腰。返回动作时长（秒）
  wake({ startled = true } = {}) {
    if (!this.spine || !this.sleeping) return 0;
    clearTimeout(this.motionTimer);
    this.sleeping = false;
    this.motionName = "Base";
    const anim = startled ? "SleepEnd" : "SleepWake";
    const st = this.spine.state;
    st.setAnimation(0, anim, false);
    st.addAnimation(0, JOB_MOTIONS.Base.loop, true, 0);
    return this.animDuration(anim);
  }

  endMotion() {
    if (this.sleeping) return;
    const m = JOB_MOTIONS[this.motionName];
    if (!m || !m.end) return;
    const st = this.spine.state;
    st.setAnimation(0, m.end, false);
    st.addAnimation(0, JOB_MOTIONS.Base.loop, true, 0);
    const name = this.motionName;
    this.motionName = "Base";
    this.emit("motionEnd", name);
  }

  // 保持当前动作的 loop 直到 release
  holdMotion() { clearTimeout(this.motionTimer); }
  releaseMotion(delay = 1.2) {
    if (this.sleeping) return;
    clearTimeout(this.motionTimer);
    this.motionTimer = setTimeout(() => this.endMotion(), delay * 1000);
  }

  animDuration(name) {
    const a = this.spine.spineData.findAnimation(name);
    return a ? a.duration : 1;
  }

  setTalking(on) { this.talking = on; if (!on) this.mouthOpen = 0; }

  tick() {
    if (!this.spine) return;
    const dt = this.app.ticker.deltaMS / 1000;
    // 眨眼：表情是睁眼(1)时才眨
    const b = this.blink;
    b.next -= dt;
    if (b.next <= 0) {
      b.phase += dt;
      if (b.phase > 0.16) { b.phase = 0; b.next = 2.5 + Math.random() * 4; if (Math.random() < 0.15) b.next = 0.25; }
    }
    // 说话时嘴巴开合
    if (this.talking) {
      this.mouthTimer -= dt;
      if (this.mouthTimer <= 0) {
        this.mouthOpen = [0, 1, 2, 1, 2, 0, 1][Math.floor(Math.random() * 7)];
        this.mouthTimer = 0.07 + Math.random() * 0.08;
      }
    }
  }

  applyOverrides() {
    const f = JOB_FACES[this.faceName] || JOB_FACES.Normal;
    const blinking = this.blink.next <= 0;
    const eyeR = blinking && (f.eyeR || f.eye) === 1 ? 3 : (f.eyeR || f.eye);
    const eyeL = blinking && (f.eyeL || f.eye) === 1 ? 3 : (f.eyeL || f.eye);
    const set = (slot, on) => this.setAttachment(slot, on ? slot : null);

    JOB_SLOTS.browR.forEach((s) => set(s, s.endsWith(`_${f.brow}`)));
    JOB_SLOTS.browL.forEach((s) => set(s, s.endsWith(`_${f.brow}`)));
    JOB_SLOTS.eyeR.forEach((s, i) => set(s, i + 1 === eyeR));
    JOB_SLOTS.eyeL.forEach((s, i) => set(s, i + 1 === eyeL));
    const openR = eyeR === 1, openL = eyeL === 1;
    JOB_SLOTS.eyeOpenParts.forEach((s) => set(s, /Right|R_/.test(s) ? openR : openL));
    set("EyeRight_Kira", !!f.kira && openR);
    set("EyeLeft_Kira", !!f.kira && openL);
    set("FaceCheek", !!f.cheek);
    const open = this.talking ? Math.max(this.mouthOpen, f.rest ? 1 : 0) : f.rest || 0;
    const mouth = `Mouth0${Math.min(3, 1 + open)}_${f.mouth}`;
    JOB_SLOTS.mouth.forEach((s) => set(s, s === mouth));
  }
}

// ============================================================
// chibi：Q 版小人，会在屏幕底部走来走去
// ============================================================
export const CHIBI_MOTIONS = {
  idle: "WaitDefault",
  walk: "MoveFront",
  walkBack: "MoveBack",
  jump: "MoveJump",
  land: "MoveLanding",
  victory: "Victory42",
  cheer: "Victory05",
  pose: "Victory13",
  spin: "Victory26",
  sitDown: "RestActive",
  sit: "RestLoop",
  standUp: "RestRecover",
  faint: "DeathActive",
  fainted: "DeathLoop",
  recover: "DeathRecover",
  hurt: "DamageSword",
  heal: "MpRecover",
  dash: "PassSword",
};

export class ChibiPet extends BasePet {
  constructor(app) {
    super(app);
    this.kind = "chibi";
    this.headBone = "Head";
    this.scaleFactor = 1;
    this.face = null;
    this.facing = 1;
  }

  async load(costume, assetsBase) {
    const data = await loadSpineWithAtlas(`${assetsBase}/chibi/skeleton.json`, `${assetsBase}/${costume.chibi}/skeleton.atlas`);
    const spine = new PIXI.spine.Spine(data);
    this.bounds = null;
    this.mount(spine);
    spine.state.data.defaultMix = 0.15;
    const hair = HAIR_TYPES[costume.hairType] || [];
    HAIR_SLOTS.forEach((s, i) => this.setAttachment(s, hair.includes(i) ? s : null));
    // 武器插槽不显示
    ["WeaponDummy", "WeaponDummy2", "WeaponDual", "WeaponDual2"].forEach((s) => this.setAttachment(s, null));
    this.hair = hair;
    this.play("idle", true);
    this.layout();
  }

  destroy() {}

  layout(scale = this.scaleFactor) {
    if (!this.spine) return;
    this.scaleFactor = scale;
    const { width, height } = this.app.screen;
    if (!this.bounds) {
      this.spine.scale.set(1);
      this.spine.update(0);
      this.bounds = this.spine.getLocalBounds().clone();
    }
    // 以根骨骼为水平中心，左右翻转时不会跳
    const s = (height / (-this.bounds.y + 30)) * scale;
    this.spine.scale.set(this.facing === -1 ? -s : s, s);
    this.spine.x = width / 2;
    this.spine.y = height - 20 * s;
  }

  setFacing(dir) {
    this.facing = dir;
    const s = Math.abs(this.spine.scale.y);
    this.spine.scale.x = dir === -1 ? -s : s;
  }

  play(name, loop = false, then = "idle") {
    const anim = CHIBI_MOTIONS[name] || name;
    const st = this.spine.state;
    st.setAnimation(0, anim, loop);
    if (!loop && then) st.addAnimation(0, CHIBI_MOTIONS[then] || then, true, 0);
    return this.spine.spineData.findAnimation(anim)?.duration || 1;
  }

  setFace(name) { this.face = CHIBI_FACES[name] || null; this.faceName = name; }
  setTalking(on) { this.talking = on; this.mouthTimer = 0; }

  // 脸的中心（舞台坐标）。Q 版的脸是一整张贴图，躺着的时候头骨骼的位置离脸比较远
  facePoint() {
    const sk = this.spine.skeleton;
    for (const name of ["001FaceMouth", "002FaceMouth"]) {
      const slot = sk.findSlot(name);
      const att = slot?.attachment;
      if (!att?.computeWorldVertices) continue;
      const v = new Float32Array(8);
      att.computeWorldVertices(slot.bone, v, 0, 2);
      const p = this.spine.toGlobal(new PIXI.Point((v[0] + v[4]) / 2, (v[1] + v[5]) / 2));
      return { x: p.x, y: p.y };
    }
    return this.headPoint();
  }

  // 定格在某个动画的某一时刻（秒）
  pose(anim, time) {
    const entry = this.spine.state.setAnimation(0, anim, false);
    entry.trackTime = time;
    entry.timeScale = 0;
    return entry;
  }

  // 从某一时刻开始播，播完回到待机
  playFrom(anim, time, then = "WaitDefault") {
    const entry = this.spine.state.setAnimation(0, anim, false);
    entry.trackTime = time;
    if (then) this.spine.state.addAnimation(0, then, true, 0);
    const dur = this.spine.spineData.findAnimation(anim)?.duration || 1;
    return Math.max(0, dur - time);
  }

  applyOverrides() {
    const sk = this.spine.skeleton;
    // 战斗动画会用 Move（跳跃时 TR 也会）把人整个移出画面；桌宠的位移交给窗口，这里锁住
    const anim = this.spine.state.tracks[0]?.animation?.name;
    for (const name of ROOT_LOCK[anim] || ROOT_LOCK.default) {
      const b = sk.findBone(name);
      if (b) { b.x = b.data.x; b.y = b.data.y; }
    }
    // 发型与武器：动画可能会 key 到，统一压回去
    HAIR_SLOTS.forEach((s, i) => { if (!this.hair?.includes(i)) sk.findSlot(s)?.setAttachment(null); });
    const f = this.face;
    const talkingOpen = this.talking && Math.floor(performance.now() / 110) % 2 === 0;
    for (const prefix of ["001", "002"]) {
      if (f?.eye) {
        for (const side of ["Left", "Right"]) {
          const slot = sk.findSlot(`${prefix}FaceEye${side}`);
          if (slot && slot.attachment) this.setAttachment(slot.data.name, `${prefix}FaceEye${side}${f.eye}`);
        }
      }
      const brow = sk.findSlot(`${prefix}FaceEyebrow`);
      if (f?.brow && brow && brow.attachment) this.setAttachment(brow.data.name, `${prefix}FaceEyebrow${f.brow}`);
      const mouth = sk.findSlot(`${prefix}FaceMouth`);
      if (mouth && mouth.attachment) {
        const m = talkingOpen ? "Open" : f?.mouth || null;
        if (m) this.setAttachment(mouth.data.name, `${prefix}FaceMouth${m}`);
      }
    }
  }
}
