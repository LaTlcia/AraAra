// 睡觉动作：没有现成的骨骼动画，全部用代码写关键帧，生成后写进 skeleton.json。
//   立绘（job）：站着打瞌睡 —— Sleep（犯困、慢慢垂下头）→ SleepLoop（呼吸 + 一下一下地点头）→ SleepDeep（熟睡：不再点头，呼吸放慢）
//                醒来有两种：SleepEnd（被叫醒，猛地抬头）、SleepWake（睡饱了，慢慢抬头伸个懒腰）
//   Q 版（chibi）：躺在床上睡 —— SleepIntro（跳上床躺下）→ SleepLoop（呼吸、偶尔蹭一蹭枕头）→ SleepWake（爬起来跳下床）
// 用法：addSleepAnimations(skeletonJson, "job" | "chibi")，浏览器和 Node 都能用（不依赖任何运行时）。

const STEP = 0.1; // 关键帧间隔（秒），足够密，直接线性插值

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = (a, b, k) => a + (b - a) * k;
const normAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
const round = (v) => Math.round(v * 1000) / 1000;
const times = (dur) => { const out = []; for (let t = 0; t <= dur + 1e-6; t += STEP) out.push(round(t)); if (out[out.length - 1] < dur) out.push(dur); return out; };

// ---------------- 取动画在某一时刻的值 ----------------
function curveAt(curve, k) {
  if (!Array.isArray(curve)) return curve === "stepped" ? 0 : k;
  const [x1, y1, x2, y2] = curve;
  // 三次贝塞尔：先由 x 二分求参数，再算 y
  let lo = 0, hi = 1, u = k;
  for (let i = 0; i < 24; i++) {
    u = (lo + hi) / 2;
    const x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
    if (x < k) lo = u; else hi = u;
  }
  return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
}

function sampleFrames(frames, t, fields) {
  if (!frames || !frames.length) return null;
  if (t <= frames[0].time) return fields.map((f) => frames[0][f] ?? 0);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (t < b.time) {
      const k = curveAt(a.curve, (t - a.time) / (b.time - a.time));
      return fields.map((f) => (f === "angle" ? a[f] + normAngle(b[f] - a[f]) * k : lerp(a[f] ?? 0, b[f] ?? 0, k)));
    }
  }
  const last = frames[frames.length - 1];
  return fields.map((f) => last[f] ?? 0);
}

// 动画在时刻 t 的骨骼姿势：{ bone: { rotate, translate:[x,y], scale:[x,y], shear:[x,y] } }（只含被 key 的部分）
function samplePose(anim, t) {
  const pose = {};
  for (const [bone, tl] of Object.entries(anim.bones || {})) {
    const p = (pose[bone] = {});
    if (tl.rotate) p.rotate = sampleFrames(tl.rotate, t, ["angle"])[0];
    if (tl.translate) p.translate = sampleFrames(tl.translate, t, ["x", "y"]);
    if (tl.scale) p.scale = sampleFrames(tl.scale, t, ["x", "y"]);
    if (tl.shear) p.shear = sampleFrames(tl.shear, t, ["x", "y"]);
  }
  return pose;
}

// 插槽附件 / IK / 绘制顺序在时刻 t 的状态（取 t 之前最后一帧）
function sampleSlots(anim, t) {
  const out = {};
  for (const [slot, tl] of Object.entries(anim.slots || {})) {
    const map = {};
    for (const [type, frames] of Object.entries(tl)) {
      let f = frames[0];
      for (const fr of frames) if (fr.time <= t + 1e-6) f = fr;
      map[type] = [{ ...f, time: 0, curve: undefined }];
    }
    out[slot] = map;
  }
  return out;
}

function sampleDrawOrder(anim, t) {
  if (!anim.drawOrder) return undefined;
  let f = null;
  for (const fr of anim.drawOrder) if (fr.time <= t + 1e-6) f = fr;
  return f ? [{ ...f, time: 0 }] : undefined;
}

// ---------------- 生成时间轴 ----------------
// poseAt(t) 返回该时刻要覆盖的姿势（同 samplePose 的格式），把它按 STEP 采样成关键帧
function buildBones(dur, poseAt, bones) {
  const out = {};
  const ts = times(dur);
  const samples = ts.map((t) => poseAt(t));
  for (const bone of bones) {
    const tl = {};
    for (const type of ["rotate", "translate", "scale", "shear"]) {
      if (!samples.some((p) => p[bone] && p[bone][type] !== undefined)) continue;
      tl[type] = ts.map((time, i) => {
        const v = samples[i][bone]?.[type] ?? (type === "rotate" ? 0 : type === "scale" ? [1, 1] : [0, 0]);
        return type === "rotate" ? { time, angle: round(v) } : { time, x: round(v[0]), y: round(v[1]) };
      });
    }
    if (Object.keys(tl).length) out[bone] = tl;
  }
  return out;
}

// 在基础姿势上叠加偏移：delta = { bone: { rotate: +度, translate: [+x, +y], scale: [×x, ×y] } } × 权重 k
function addPose(base, deltas) {
  const out = {};
  for (const [bone, p] of Object.entries(base)) out[bone] = { ...p, translate: p.translate && [...p.translate], scale: p.scale && [...p.scale] };
  for (const [delta, k] of deltas) {
    if (!k) continue;
    for (const [bone, d] of Object.entries(delta)) {
      const p = (out[bone] ||= {});
      if (d.rotate !== undefined) p.rotate = (p.rotate ?? 0) + d.rotate * k;
      if (d.translate) { const [x, y] = p.translate || [0, 0]; p.translate = [x + d.translate[0] * k, y + d.translate[1] * k]; }
      if (d.scale) { const [x, y] = p.scale || [1, 1]; p.scale = [x * (1 + (d.scale[0] - 1) * k), y * (1 + (d.scale[1] - 1) * k)]; }
    }
  }
  return out;
}

const bonesOf = (...poses) => [...new Set(poses.flatMap((p) => Object.keys(p)))];

// 把某段动画的摆动（头发、衣摆）原样搬过来，可以按比例减弱；slow > 1 时按倍数放慢
function copySway(anim, bones, factor, slow = 1) {
  const out = {};
  for (const bone of bones) {
    const tl = anim.bones?.[bone];
    if (!tl) continue;
    const copy = {};
    for (const [type, frames] of Object.entries(tl)) {
      copy[type] = frames.map((f) => {
        const g = { ...f, time: round((f.time || 0) * slow) };
        if (type === "rotate") g.angle = round(normAngle(f.angle) * factor);
        else if (type === "translate") { g.x = round(f.x * factor); g.y = round(f.y * factor); }
        return g;
      });
    }
    out[bone] = copy;
  }
  return out;
}

// ============================================================
// 立绘：站着打瞌睡
// ============================================================
const JOB_SWAY = /^(Hair_Sway_Ctrl|HairAcceLeftBack|Clothes_Sway|BodyBack_)/;

// 睡着时的姿势（相对待机姿势的偏移）
const JOB_SLEEP = {
  Neck: { rotate: 7 },
  FaceAngle: { translate: [-46, 10] },
  TR: { translate: [0, -12] },
  Body: { rotate: 1.2 },
  Bust: { rotate: 2.4 },
  CollarLeft: { translate: [-7, 0] },
  CollarRight: { translate: [-7, 0] },
  ArmLeft: { rotate: -2 },
  ArmRight: { rotate: 2 },
  ArmLeftFore: { rotate: -3 },
  ArmRightFore: { rotate: 3 },
  ArmLeftHand: { rotate: -6 },
  ArmRightHand: { rotate: 6 },
  Hip: { rotate: -0.8 },
};
// 点头时额外垂下的量
const JOB_NOD = { Neck: { rotate: 6 }, FaceAngle: { translate: [-26, 6] }, Bust: { rotate: 1.4 }, TR: { translate: [0, -3] } };
// 呼吸
const JOB_BREATH = { Bust: { translate: [4, 0] }, CollarLeft: { translate: [3, 0] }, CollarRight: { translate: [3, 0] }, TR: { translate: [0, 1.8] }, Neck: { rotate: -0.8 } };
// 惊醒时头和肩膀猛地抬起
const JOB_JOLT = { Neck: { rotate: -5 }, FaceAngle: { translate: [26, -6] }, CollarLeft: { translate: [7, 0] }, CollarRight: { translate: [7, 0] }, TR: { translate: [0, 6] }, Bust: { rotate: -1.5 } };

function addJobSleep(json) {
  const base = json.animations["01BaseLoop"];
  if (!base) return;
  const P0 = samplePose(base, 0);
  const slots = sampleSlots(base, 0);
  const swayBones = Object.keys(base.bones || {}).filter((b) => JOB_SWAY.test(b));
  const staticBase = Object.fromEntries(Object.entries(P0).filter(([b]) => !JOB_SWAY.test(b)));
  const posed = bonesOf(staticBase, JOB_SLEEP, JOB_NOD, JOB_BREATH, JOB_JOLT).filter((b) => !JOB_SWAY.test(b));
  const constSway = buildBones(0, () => P0, swayBones);

  // 犯困：头先垂一下、被自己惊到抬一点，然后彻底睡过去
  const introDur = 2.2;
  const intro = (t) => {
    const head = t < 0.75 ? smooth(t / 0.75) * 0.6 : t < 1.0 ? lerp(0.6, 0.35, smooth((t - 0.75) / 0.25)) : lerp(0.35, 1, smooth((t - 1.0) / 0.9));
    const body = smooth(t / 1.9);
    return addPose(staticBase, [[pick(JOB_SLEEP, HEAD), head], [omit(JOB_SLEEP, HEAD), body]]);
  };

  // 睡着：5 秒一循环，两次呼吸；头慢慢往下沉，4 秒处轻轻一点又抬回来
  const loopDur = 5;
  const loop = (t) => {
    const breath = (1 - Math.cos((2 * Math.PI * t) / 2.5)) / 2;
    const nod = t < 4 ? smooth(t / 4) : t < 4.3 ? lerp(1, -0.3, smooth((t - 4) / 0.3)) : lerp(-0.3, 0, smooth((t - 4.3) / 0.7));
    return addPose(staticBase, [[JOB_SLEEP, 1], [JOB_NOD, nod], [JOB_BREATH, breath]]);
  };

  // 熟睡：头整个靠下来不再点头，呼吸放慢（10 秒三次），头发衣摆也摆得更慢更轻
  const DEEP_NOD = 0.85;
  const deepDur = 10;
  const deep = (t) => {
    const breath = (1 - Math.cos((2 * Math.PI * t * 3) / deepDur)) / 2;
    return addPose(staticBase, [[JOB_SLEEP, 1], [JOB_NOD, DEEP_NOD], [JOB_BREATH, breath * 1.2]]);
  };

  // 惊醒：头和肩膀猛地抬起，再回到待机姿势
  const endDur = 0.9;
  const end = (t) => {
    const sleep = t < 0.16 ? lerp(1, 0, smooth(t / 0.16)) : 0;
    const jolt = t < 0.16 ? smooth(t / 0.16) : lerp(1, 0, smooth((t - 0.16) / 0.74));
    return addPose(staticBase, [[JOB_SLEEP, sleep], [JOB_JOLT, jolt]]);
  };

  // 自然醒：慢慢抬起头，挺一挺肩膀（伸懒腰），再放松回待机姿势
  const wakeDur = 2.2;
  const wake = (t) => {
    const sleep = 1 - smooth(t / 1.3);
    const stretch = t < 1.1 ? smooth((t - 0.5) / 0.6) : lerp(1, 0, smooth((t - 1.1) / 1.1));
    return addPose(staticBase, [[JOB_SLEEP, sleep], [JOB_NOD, DEEP_NOD * sleep], [JOB_JOLT, stretch * 0.5], [JOB_BREATH, stretch]]);
  };

  json.animations.Sleep = { slots, bones: { ...constSway, ...buildBones(introDur, intro, posed) } };
  json.animations.SleepLoop = { slots, bones: { ...copySway(base, swayBones, 0.6), ...buildBones(loopDur, loop, posed) } };
  json.animations.SleepDeep = { slots, bones: { ...copySway(base, swayBones, 0.4, 2), ...buildBones(deepDur, deep, posed) } };
  json.animations.SleepEnd = { slots, bones: { ...constSway, ...buildBones(endDur, end, posed) } };
  json.animations.SleepWake = { slots, bones: { ...constSway, ...buildBones(wakeDur, wake, posed) } };
}

const HEAD = ["Neck", "FaceAngle"];
const pick = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => keys.includes(k)));
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));

// ============================================================
// Q 版：躺在床上睡（床和被子由渲染端画，见 src/renderer/bed.js）
// ============================================================
// 整个人绕臀部（Rot 骨骼）逆时针转 90°：仰躺、头朝左，再往下放到床垫上
export const CHIBI_LIE = { rotate: 90, translate: [-310, -425] };
const CHIBI_LYING = {
  Rot: { rotate: CHIBI_LIE.rotate, translate: CHIBI_LIE.translate },
  Head: { rotate: -6 },
  // 两脚并拢、膝盖微屈（IK 目标挂在 Rot 下，跟着身体一起转）
  // Rot 转了 90° 以后，IK 目标的局部 x 轴朝上：负值让脚落到胯部以下、平放在床上
  Ik_LegLeft: { translate: [-214, -70] },
  Ik_LegRight: { translate: [5, -70] },
};
// 呼吸：胸口起伏、头跟着轻轻动
const CHIBI_BREATH = { Bust: { translate: [0, -10], rotate: -1.2 }, Head: { rotate: 1.2 } };
// 偶尔在枕头上蹭一蹭
const CHIBI_NUZZLE = { Head: { rotate: 5 }, Bust: { rotate: 1 } };
// 起跳前下蹲
const CHIBI_CROUCH = { TR: { translate: [0, -70] }, Body: { rotate: -6 }, Head: { rotate: 4 } };

export const CHIBI_SLEEP_TIMES = { intro: 1.0, loop: 4, wake: 0.9 };

function addChibiSleep(json) {
  const wait = json.animations.WaitDefault;
  if (!wait) return;
  const P0 = samplePose(wait, 0);
  const slots = sampleSlots(wait, 0);
  const posed = bonesOf(P0, CHIBI_LYING, CHIBI_BREATH, CHIBI_NUZZLE, CHIBI_CROUCH);
  const lie = (k) => [CHIBI_LYING, k];

  // 跳上床：蹲 → 起跳时转身 → 落在床上弹一下
  const intro = (t) => {
    const crouch = t < 0.16 ? smooth(t / 0.16) : t < 0.32 ? lerp(1, 0, smooth((t - 0.16) / 0.16)) : 0;
    const turn = smooth((t - 0.2) / 0.5);
    const arc = t > 0.2 && t < 0.72 ? Math.sin(((t - 0.2) / 0.52) * Math.PI) : 0; // 空中抛物线
    const bounce = t > 0.72 ? Math.sin(((t - 0.72) / 0.28) * Math.PI) * (1 - (t - 0.72) / 0.28) : 0;
    const pose = addPose(P0, [[CHIBI_CROUCH, crouch], lie(turn)]);
    pose.Rot = pose.Rot || {};
    const [x, y] = pose.Rot.translate || [0, 0];
    pose.Rot.translate = [x, y + arc * 260 + bounce * 40];
    if (pose.Rot.rotate === undefined) pose.Rot.rotate = 0;
    return pose;
  };

  // 睡着：4 秒一循环，两次呼吸，后半段在枕头上蹭一下
  const loop = (t) => {
    const breath = (1 - Math.cos((2 * Math.PI * t) / 2)) / 2;
    const nuzzle = t > 2.6 && t < 3.6 ? Math.sin(((t - 2.6) / 1.0) * Math.PI) : 0;
    return addPose(P0, [lie(1), [CHIBI_BREATH, breath], [CHIBI_NUZZLE, nuzzle]]);
  };

  // 起床：掀被子坐起来 → 跳下床 → 落地
  const wake = (t) => {
    const turn = 1 - smooth(t / 0.45);
    const arc = t < 0.55 ? Math.sin((t / 0.55) * Math.PI) : 0;
    const land = t > 0.55 ? Math.sin(((t - 0.55) / 0.35) * Math.PI) : 0;
    const pose = addPose(P0, [lie(turn), [CHIBI_CROUCH, land * 0.8]]);
    pose.Rot = pose.Rot || {};
    const [x, y] = pose.Rot.translate || [0, 0];
    pose.Rot.translate = [x, y + arc * 200];
    if (pose.Rot.rotate === undefined) pose.Rot.rotate = 0;
    return pose;
  };

  json.animations.SleepIntro = { slots, bones: buildBones(CHIBI_SLEEP_TIMES.intro, intro, posed) };
  json.animations.SleepLoop = { slots, bones: buildBones(CHIBI_SLEEP_TIMES.loop, loop, posed) };
  json.animations.SleepWake = { slots, bones: buildBones(CHIBI_SLEEP_TIMES.wake, wake, posed) };
}

export function addSleepAnimations(json, kind) {
  if (kind === "job") addJobSleep(json);
  else addChibiSleep(json);
  return json;
}

export const _internals = { samplePose, sampleSlots, sampleDrawOrder, addPose, buildBones, copySway, smooth, lerp };
