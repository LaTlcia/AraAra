// Spine 3.6.x 二进制 .skel → Spine JSON（3.6/3.7 runtime 可读的对象格式 skins）
// 按 spine-libgdx 3.6 SkeletonBinary 的读取顺序实现。
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const BLEND = ["normal", "additive", "multiply", "screen"];
const ATTACH = ["region", "boundingbox", "mesh", "linkedmesh", "path", "point", "clipping"];
const TRANSFORM = ["normal", "onlyTranslation", "noRotationOrReflection", "noScale", "noScaleOrReflection"];
const POSITION = ["fixed", "percent"];
const SPACING = ["length", "fixed", "percent"];
const ROTATE = ["tangent", "chain", "chainScale"];

class Reader {
  constructor(buf) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    this.pos = 0;
  }
  byte() { return this.buf[this.pos++]; }
  sbyte() { return this.view.getInt8(this.pos++); }
  bool() { return this.byte() !== 0; }
  short() { const v = this.view.getInt16(this.pos); this.pos += 2; return v; }
  int32() { const v = this.view.getInt32(this.pos); this.pos += 4; return v; }
  float() { const v = this.view.getFloat32(this.pos); this.pos += 4; return Math.fround(v); }
  varint(optimizePositive) {
    let b = this.byte();
    let r = b & 0x7f;
    if (b & 0x80) {
      b = this.byte(); r |= (b & 0x7f) << 7;
      if (b & 0x80) {
        b = this.byte(); r |= (b & 0x7f) << 14;
        if (b & 0x80) {
          b = this.byte(); r |= (b & 0x7f) << 21;
          if (b & 0x80) { b = this.byte(); r |= (b & 0x7f) << 28; }
        }
      }
    }
    return optimizePositive ? r : ((r >>> 1) ^ -(r & 1));
  }
  string() {
    let n = this.varint(true);
    if (n === 0) return null;
    if (n === 1) return "";
    n--;
    const s = this.buf.toString("utf8", this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  rgba() { return (this.int32() >>> 0).toString(16).padStart(8, "0"); }
}

const round = (v) => (Number.isInteger(v) ? v : Math.round(v * 1e5) / 1e5);

export function convertSkel(buf) {
  const r = new Reader(buf);
  const json = {};
  const skeleton = {};
  skeleton.hash = r.string() || undefined;
  skeleton.spine = r.string() || undefined;
  skeleton.width = r.float();
  skeleton.height = r.float();
  const nonessential = r.bool();
  if (nonessential) {
    skeleton.fps = r.float();
    skeleton.images = r.string() || undefined;
  }
  json.skeleton = skeleton;

  const bones = [];
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const b = { name: r.string() };
    if (i !== 0) b.parent = bones[r.varint(true)].name;
    b.rotation = round(r.float());
    b.x = round(r.float());
    b.y = round(r.float());
    b.scaleX = round(r.float());
    b.scaleY = round(r.float());
    b.shearX = round(r.float());
    b.shearY = round(r.float());
    b.length = round(r.float());
    b.transform = TRANSFORM[r.varint(true)];
    if (nonessential) b.color = r.rgba();
    bones.push(b);
  }
  json.bones = bones;

  const slots = [];
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const s = { name: r.string() };
    s.bone = bones[r.varint(true)].name;
    s.color = r.rgba();
    const dark = r.int32();
    if (dark !== -1) s.dark = ((dark >>> 0) & 0xffffff).toString(16).padStart(6, "0");
    const att = r.string();
    if (att != null) s.attachment = att;
    s.blend = BLEND[r.varint(true)];
    slots.push(s);
  }
  json.slots = slots;

  const ik = [];
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const c = { name: r.string(), order: r.varint(true), bones: [] };
    for (let j = 0, m = r.varint(true); j < m; j++) c.bones.push(bones[r.varint(true)].name);
    c.target = bones[r.varint(true)].name;
    c.mix = round(r.float());
    c.bendPositive = r.sbyte() !== -1;
    ik.push(c);
  }
  json.ik = ik;

  const transform = [];
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const c = { name: r.string(), order: r.varint(true), bones: [] };
    for (let j = 0, m = r.varint(true); j < m; j++) c.bones.push(bones[r.varint(true)].name);
    c.target = bones[r.varint(true)].name;
    c.local = r.bool();
    c.relative = r.bool();
    c.rotation = round(r.float());
    c.x = round(r.float());
    c.y = round(r.float());
    c.scaleX = round(r.float());
    c.scaleY = round(r.float());
    c.shearY = round(r.float());
    c.rotateMix = round(r.float());
    c.translateMix = round(r.float());
    c.scaleMix = round(r.float());
    c.shearMix = round(r.float());
    transform.push(c);
  }
  json.transform = transform;

  const path = [];
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const c = { name: r.string(), order: r.varint(true), bones: [] };
    for (let j = 0, m = r.varint(true); j < m; j++) c.bones.push(bones[r.varint(true)].name);
    c.target = slots[r.varint(true)].name;
    c.positionMode = POSITION[r.varint(true)];
    c.spacingMode = SPACING[r.varint(true)];
    c.rotateMode = ROTATE[r.varint(true)];
    c.rotation = round(r.float());
    c.position = round(r.float());
    c.spacing = round(r.float());
    c.rotateMix = round(r.float());
    c.translateMix = round(r.float());
    path.push(c);
  }
  json.path = path;

  const floats = (n) => { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = round(r.float()); return a; };
  const shorts = () => { const n = r.varint(true); const a = new Array(n); for (let i = 0; i < n; i++) a[i] = r.short(); return a; };
  const vertices = (count) => {
    if (!r.bool()) return floats(count << 1);
    const out = [];
    for (let i = 0; i < count; i++) {
      const bc = r.varint(true);
      out.push(bc);
      for (let j = 0; j < bc; j++) out.push(r.varint(true), round(r.float()), round(r.float()), round(r.float()));
    }
    return out;
  };

  const skinNames = [];
  // 记录每个 (skin, slot, attachment) 是否带权重，以便解析 deform
  const vertexInfo = new Map();

  const readAttachment = (skinName, slotIndex, keyName) => {
    let name = r.string();
    const a = {};
    if (name != null && name !== keyName) a.name = name;
    if (name == null) name = keyName;
    const type = ATTACH[r.byte()];
    if (type !== "region") a.type = type;
    switch (type) {
      case "region": {
        const p = r.string();
        if (p != null && p !== name) a.path = p;
        a.rotation = round(r.float());
        a.x = round(r.float());
        a.y = round(r.float());
        a.scaleX = round(r.float());
        a.scaleY = round(r.float());
        a.width = round(r.float());
        a.height = round(r.float());
        a.color = r.rgba();
        break;
      }
      case "boundingbox": {
        a.vertexCount = r.varint(true);
        a.vertices = vertices(a.vertexCount);
        if (nonessential) a.color = r.rgba();
        vertexInfo.set(`${skinName}/${slotIndex}/${keyName}`, { weighted: a.vertices.length !== a.vertexCount * 2, n: a.vertexCount });
        break;
      }
      case "mesh": {
        const p = r.string();
        if (p != null && p !== name) a.path = p;
        a.color = r.rgba();
        const vc = r.varint(true);
        a.uvs = floats(vc << 1);
        a.triangles = shorts();
        a.vertices = vertices(vc);
        a.hull = r.varint(true);
        if (nonessential) {
          a.edges = shorts();
          a.width = round(r.float());
          a.height = round(r.float());
        }
        vertexInfo.set(`${skinName}/${slotIndex}/${keyName}`, { weighted: a.vertices.length !== vc * 2, n: vc });
        break;
      }
      case "linkedmesh": {
        const p = r.string();
        if (p != null && p !== name) a.path = p;
        a.color = r.rgba();
        const sk = r.string();
        if (sk != null) a.skin = sk;
        a.parent = r.string();
        a.deform = r.bool();
        if (nonessential) {
          a.width = round(r.float());
          a.height = round(r.float());
        }
        a.__linked = true;
        break;
      }
      case "path": {
        a.closed = r.bool();
        a.constantSpeed = r.bool();
        a.vertexCount = r.varint(true);
        a.vertices = vertices(a.vertexCount);
        a.lengths = floats(a.vertexCount / 3);
        if (nonessential) a.color = r.rgba();
        vertexInfo.set(`${skinName}/${slotIndex}/${keyName}`, { weighted: a.vertices.length !== a.vertexCount * 2, n: a.vertexCount });
        break;
      }
      case "point": {
        a.rotation = round(r.float());
        a.x = round(r.float());
        a.y = round(r.float());
        if (nonessential) a.color = r.rgba();
        break;
      }
      case "clipping": {
        a.end = slots[r.varint(true)].name;
        a.vertexCount = r.varint(true);
        a.vertices = vertices(a.vertexCount);
        if (nonessential) a.color = r.rgba();
        vertexInfo.set(`${skinName}/${slotIndex}/${keyName}`, { weighted: a.vertices.length !== a.vertexCount * 2, n: a.vertexCount });
        break;
      }
      default:
        throw new Error(`未知 attachment 类型 @${r.pos}`);
    }
    return a;
  };

  const linked = [];
  const readSkin = (skinName) => {
    const slotCount = r.varint(true);
    if (slotCount === 0) return null;
    const skin = {};
    for (let i = 0; i < slotCount; i++) {
      const slotIndex = r.varint(true);
      const map = {};
      for (let j = 0, m = r.varint(true); j < m; j++) {
        const key = r.string();
        const a = readAttachment(skinName, slotIndex, key);
        if (a.__linked) { delete a.__linked; linked.push({ skinName, slotIndex, key, a }); }
        map[key] = a;
      }
      skin[slots[slotIndex].name] = map;
    }
    return skin;
  };

  const skins = {};
  const def = readSkin("default");
  if (def) { skins.default = def; skinNames.push("default"); }
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const name = r.string();
    skins[name] = readSkin(name);
    skinNames.push(name);
  }
  json.skins = skins;
  // linkedmesh 继承父网格的顶点信息
  for (const l of linked) {
    const parentSkin = l.a.skin || "default";
    const info = vertexInfo.get(`${parentSkin}/${l.slotIndex}/${l.a.parent}`);
    if (info) vertexInfo.set(`${l.skinName}/${l.slotIndex}/${l.key}`, info);
  }

  const events = {};
  const eventNames = [];
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const name = r.string();
    const e = { int: r.varint(false), float: round(r.float()) };
    const s = r.string();
    if (s != null) e.string = s;
    events[name] = e;
    eventNames.push(name);
  }
  json.events = events;

  const curve = (frame) => {
    switch (r.byte()) {
      case 1: frame.curve = "stepped"; break;
      case 2: frame.curve = [round(r.float()), round(r.float()), round(r.float()), round(r.float())]; break;
    }
  };

  const animations = {};
  for (let i = 0, n = r.varint(true); i < n; i++) {
    const name = r.string();
    const anim = {};

    const slotTl = {};
    for (let j = 0, m = r.varint(true); j < m; j++) {
      const slotIndex = r.varint(true);
      const map = {};
      for (let k = 0, kk = r.varint(true); k < kk; k++) {
        const type = r.byte();
        const fc = r.varint(true);
        const frames = [];
        for (let f = 0; f < fc; f++) {
          const fr = { time: round(r.float()) };
          if (type === 0) {
            fr.name = r.string();
          } else if (type === 1) {
            fr.color = r.rgba();
            if (f < fc - 1) curve(fr);
          } else if (type === 2) {
            fr.light = r.rgba();
            fr.dark = ((r.int32() >>> 0) & 0xffffff).toString(16).padStart(6, "0");
            if (f < fc - 1) curve(fr);
          } else throw new Error(`未知 slot timeline ${type}`);
          frames.push(fr);
        }
        map[["attachment", "color", "twoColor"][type]] = frames;
      }
      slotTl[slots[slotIndex].name] = map;
    }
    if (Object.keys(slotTl).length) anim.slots = slotTl;

    const boneTl = {};
    for (let j = 0, m = r.varint(true); j < m; j++) {
      const boneIndex = r.varint(true);
      const map = {};
      for (let k = 0, kk = r.varint(true); k < kk; k++) {
        const type = r.byte();
        const fc = r.varint(true);
        const frames = [];
        for (let f = 0; f < fc; f++) {
          const fr = { time: round(r.float()) };
          if (type === 0) fr.angle = round(r.float());
          else { fr.x = round(r.float()); fr.y = round(r.float()); }
          if (f < fc - 1) curve(fr);
          frames.push(fr);
        }
        map[["rotate", "translate", "scale", "shear"][type]] = frames;
      }
      boneTl[bones[boneIndex].name] = map;
    }
    if (Object.keys(boneTl).length) anim.bones = boneTl;

    const ikTl = {};
    for (let j = 0, m = r.varint(true); j < m; j++) {
      const idx = r.varint(true);
      const fc = r.varint(true);
      const frames = [];
      for (let f = 0; f < fc; f++) {
        const fr = { time: round(r.float()), mix: round(r.float()), bendPositive: r.sbyte() !== -1 };
        if (f < fc - 1) curve(fr);
        frames.push(fr);
      }
      ikTl[ik[idx].name] = frames;
    }
    if (Object.keys(ikTl).length) anim.ik = ikTl;

    const tfTl = {};
    for (let j = 0, m = r.varint(true); j < m; j++) {
      const idx = r.varint(true);
      const fc = r.varint(true);
      const frames = [];
      for (let f = 0; f < fc; f++) {
        const fr = { time: round(r.float()), rotateMix: round(r.float()), translateMix: round(r.float()), scaleMix: round(r.float()), shearMix: round(r.float()) };
        if (f < fc - 1) curve(fr);
        frames.push(fr);
      }
      tfTl[transform[idx].name] = frames;
    }
    if (Object.keys(tfTl).length) anim.transform = tfTl;

    const pathTl = {};
    for (let j = 0, m = r.varint(true); j < m; j++) {
      const idx = r.varint(true);
      const map = {};
      for (let k = 0, kk = r.varint(true); k < kk; k++) {
        const type = r.byte();
        const fc = r.varint(true);
        const frames = [];
        for (let f = 0; f < fc; f++) {
          const fr = { time: round(r.float()) };
          if (type === 0) fr.position = round(r.float());
          else if (type === 1) fr.spacing = round(r.float());
          else { fr.rotateMix = round(r.float()); fr.translateMix = round(r.float()); }
          if (f < fc - 1) curve(fr);
          frames.push(fr);
        }
        map[["position", "spacing", "mix"][type]] = frames;
      }
      pathTl[path[idx].name] = map;
    }
    if (Object.keys(pathTl).length) anim.paths = pathTl;

    const deform = {};
    for (let j = 0, m = r.varint(true); j < m; j++) {
      const skinName = skinNames[r.varint(true)];
      const skinMap = (deform[skinName] = deform[skinName] || {});
      for (let k = 0, kk = r.varint(true); k < kk; k++) {
        const slotIndex = r.varint(true);
        const slotMap = (skinMap[slots[slotIndex].name] = {});
        for (let a = 0, aa = r.varint(true); a < aa; a++) {
          const attName = r.string();
          const fc = r.varint(true);
          const frames = [];
          for (let f = 0; f < fc; f++) {
            const fr = { time: round(r.float()) };
            const len = r.varint(true);
            if (len !== 0) {
              fr.offset = r.varint(true);
              fr.vertices = floats(len);
            }
            if (f < fc - 1) curve(fr);
            frames.push(fr);
          }
          slotMap[attName] = frames;
        }
      }
    }
    if (Object.keys(deform).length) anim.deform = deform;

    const doc = r.varint(true);
    if (doc > 0) {
      const frames = [];
      for (let f = 0; f < doc; f++) {
        const fr = { time: round(r.float()), offsets: [] };
        for (let o = 0, oo = r.varint(true); o < oo; o++) {
          fr.offsets.push({ slot: slots[r.varint(true)].name, offset: r.varint(true) });
        }
        frames.push(fr);
      }
      anim.drawOrder = frames;
    }

    const ec = r.varint(true);
    if (ec > 0) {
      const frames = [];
      for (let f = 0; f < ec; f++) {
        const time = round(r.float());
        const ename = eventNames[r.varint(true)];
        const fr = { time, name: ename, int: r.varint(false), float: round(r.float()) };
        if (r.bool()) fr.string = r.string();
        frames.push(fr);
      }
      anim.events = frames;
    }
    animations[name] = anim;
  }
  json.animations = animations;

  if (r.pos !== buf.length) {
    throw new Error(`解析结束位置 ${r.pos} ≠ 文件长度 ${buf.length}`);
  }
  return json;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [, , input, output] = process.argv;
  const json = convertSkel(fs.readFileSync(input));
  if (output) fs.writeFileSync(output, JSON.stringify(json));
  else {
    console.log("spine", json.skeleton.spine, "bones", json.bones.length, "slots", json.slots.length);
    console.log("skins", Object.keys(json.skins).join(", "));
    console.log("animations", Object.keys(json.animations).join(", "));
  }
}
