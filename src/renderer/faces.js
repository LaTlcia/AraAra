// 表情预设。jobspine 的脸由眉毛 / 眼睛 / 嘴 / 腮红 / 高光几个插槽的附件拼出来，
// 动画本身不 key 这些插槽，所以由代码按 faceType 切换。
// 表情名称：Normal、Smile、Shy、Anger……

// ---- jobspine 部件分组 ----
export const JOB_SLOTS = {
  browR: ["EyeBlowR_A", "EyeBlowR_B", "EyeBlowR_C", "EyeBlowR_D", "EyeBlowR_E"],
  browL: ["EyeBlowL_A", "EyeBlowL_B", "EyeBlowL_C", "EyeBlowL_D", "EyeBlowL_E"],
  // 眼睛：1 = 睁眼（带眼白/瞳孔/高光），2..5 = 各种闭眼/半眼/笑眼线
  eyeR: ["EyeLashesR_1", "EyeLashesR_2", "EyeR_3", "EyeR_4", "EyeR_5"],
  eyeL: ["EyeLashesL_1", "EyeLashesL_2", "EyeL_3", "EyeL_4", "EyeL_5"],
  // 睁眼时才显示的眼球部件
  eyeOpenParts: [
    "EyeRightWhite", "EyeLeftWhite", "EyeRight", "EyeLeft", "EyeRightHi", "EyeLeftHi",
    "EyeRightMask", "EyeLeftMask", "EyeLashesR_Alpha_1", "EyeLashesL_Alpha_1",
  ],
  kira: ["EyeRight_Kira", "EyeLeft_Kira"],
  cheek: ["FaceCheek"],
  // 嘴：形状 A..H × 张口 01..03
  mouth: "ABCDEFGH".split("").flatMap((s) => ["01", "02", "03"].map((o) => `Mouth${o}_${s}`)),
};

// 每个预设：brow 眉形(A-E)，eye 眼型(1-5)，mouth 嘴形，cheek 腮红，kira 星星眼，rest 不说话时的张口程度(0-2)
//   眼：1 睁眼  2 柔和闭眼（从容/坏笑）  3 紧闭  4 笑眼 ^^  5 白眼（搞笑惊吓）
//   嘴：A 微笑  B 平  C 小嘴  D 微张  H 宽嘴（不满/困扰）；亚罗椰的 E/F/G 是空图
//   眉：A 普通  B 八字（难过/困扰）  C 认真  D 怒  E 上扬（惊讶）——眉毛透过刘海显示，差别比较含蓄
export const JOB_FACES = {
  Normal:         { brow: "A", eye: 1, mouth: "A" },
  Smile:          { brow: "A", eye: 4, mouth: "A" },
  Smile_L:        { brow: "A", eye: 4, mouth: "A", rest: 1, cheek: true },
  HalfEye_Normal: { brow: "C", eye: 2, mouth: "A" },
  Strong:         { brow: "C", eye: 1, mouth: "A", rest: 1 },
  Serious:        { brow: "C", eye: 1, mouth: "B" },
  Anger:          { brow: "D", eye: 1, mouth: "H" },
  Anger_L:        { brow: "D", eye: 3, mouth: "H", rest: 2 },
  HalfEye_Anger:  { brow: "D", eye: 2, mouth: "B" },
  Sad:            { brow: "B", eye: 1, mouth: "C" },
  HalfEye_Sad:    { brow: "B", eye: 2, mouth: "C" },
  Surprise:       { brow: "E", eye: 1, mouth: "B", rest: 2 },
  Surprise_L:     { brow: "E", eye: 5, mouth: "B", rest: 2 },
  Trouble:        { brow: "B", eye: 1, mouth: "H" },
  Shy:            { brow: "B", eye: 1, mouth: "D", cheek: true },
  Ennui:          { brow: "A", eye: 1, mouth: "B" },
  Sleep:          { brow: "A", eye: 3, mouth: "D" },
  Close:          { brow: "A", eye: 2, mouth: "A" },
  Pain:           { brow: "B", eye: 3, mouth: "H" },
  Kira:           { brow: "E", eye: 1, mouth: "A", rest: 1, kira: true, cheek: true },
  Wink:           { brow: "A", eye: 1, eyeL: 4, mouth: "A", rest: 1 },
};

// ---- chibi（Q 版）脸：动画会 key 这些插槽，这里只在需要时覆盖 ----
export const CHIBI_FACES = {
  Normal:   null,
  Smile:    { eye: "Laugh", mouth: "Laugh" },
  Smile_L:  { eye: "Laugh", mouth: "Laugh" },
  Strong:   { brow: "Anger", mouth: "Laugh" },
  Serious:  { brow: "Anger" },
  Anger:    { brow: "Anger", mouth: "Anger" },
  Sad:      { brow: "Sad" },
  Surprise: { mouth: "Open" },
  Trouble:  { brow: "Sad", mouth: "Anger" },
  Shy:      { eye: "Laugh", brow: "Sad" },
  Ennui:    { eye: "Close" },
  Sleep:    { eye: "Close" },
  Close:    { eye: "Close" },
  Pain:     { eye: "Close", brow: "Sad", mouth: "Anger" },
  HalfEye_Normal: { brow: "Sad", mouth: "Laugh" },
  HalfEye_Sad:    { brow: "Sad" },
  HalfEye_Anger:  { brow: "Anger" },
  Wink:     { eye: "Laugh", mouth: "Laugh" },
};
