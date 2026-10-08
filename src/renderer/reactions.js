// 本地台词：没有接 AI、或互动不交给 AI 时用。每句以情绪标签开头。
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export const LINES = {
  greet: {
    morning: [
      "[smile]贵安♪ 一大早就能见到你，今天运气不错呢。",
      "[smug]早上好。睡得好吗？……眼角还有点困意哦，呵呵。",
    ],
    noon: [
      "[happy]午安。吃过饭了吗？没吃的话……要不要和我一起？",
      "[smile]中午好。下午也要打起精神来，我会在这里看着你的。",
    ],
    afternoon: [
      "[smug]下午好。我正无聊呢，你就来了，时机抓得真准。",
      "[tease]下午茶时间到了哦。我珍藏的石榴茶，只请第一眼就中意的孩子喝♪",
    ],
    evening: [
      "[gentle]晚上好。今天也辛苦了，过来让我看看你的脸。",
      "[smile]晚上好♪ 今天发生了什么有趣的事吗？说给我听听。",
    ],
    night: [
      "[trouble]这么晚还没睡？……真拿你没办法，我就陪你一会儿吧。",
      "[sleepy]呼啊……这个时间还在终端前面？明天可不许赖床哦。",
    ],
  },
  patHead: [
    "[shy]……呵呵，摸我的头？胆子不小嘛。",
    "[smug]哎呀，这是在奖励我吗？那我就收下了♪",
    "[happy]再多摸一会儿也可以哦。……就一会儿。",
    "[gentle]你的手很暖和呢。",
  ],
  patMany: [
    "[shy]呜……这样摸下去，我会变得很没出息的。",
    "[tease]摸了这么久，下次可要换我来摸你了哦？",
    "[happy]呵呵，好舒服……再继续也没关系。",
  ],
  pokeCheek: [
    ["[surprise]呀……！突然袭击可不公平。", "[smug]戳得这么开心？我的脸可是很贵的哦♪"],
    ["[pout]……还来？", "[trouble]你是有多喜欢我的脸啊。"],
    ["[angry]真是的，再戳我就要反击了！", "[angry]够了！……胜负先记着，下次换我戳你。"],
  ],
  pokeBody: [
    "[tease]哎呀，主动出击了？我很欣赏这种积极性♪",
    "[smug]想引起我的注意？你早就已经引起了哦。",
    "[surprise]嗯？有什么事吗？",
    "[proud]找我有事？S 级的亚罗椰随时待命。",
  ],
  pokeLegs: [
    "[trouble]……你在看哪里呢？",
    "[pout]那里可不是能随便碰的地方。",
    "[smug]呵呵，看入迷了？也难怪，毕竟是我嘛。",
  ],
  dragStart: [
    "[surprise]哇，要带我去哪里？",
    "[excited]要去冒险吗？我奉陪♪",
  ],
  drop: [
    "[proud]……这里视野不错，就选这儿吧。",
    "[smug]下次搬家记得提前预约哦。",
  ],
  dropFar: [
    "[trouble]晃得我头都晕了……你是故意的吧？",
    "[shock]呜哇……！刚才那一下差点让我失态了。",
  ],
  idle: [
    "[bored]好无聊啊……来陪我说说话嘛。",
    "[think]在想要不要画一幅画……模特就选你吧。",
    "[smug]一直盯着屏幕，偶尔也看看我嘛。",
    "[tease]发呆的样子也挺可爱的。……被我看了好久都没发现吧？",
  ],
  idleNight: [
    "[sleepy]呼啊……有点困了。你也早点休息。",
    "[gentle]已经很晚了哦。今天就到这里吧？",
  ],
  costume: [
    "[proud]换好了。怎么样？很适合我吧♪",
    "[shy]……这身「{name}」，你喜欢吗？",
    "[smug]呵呵，看呆了？「{name}」可是我的自信之作。",
  ],
  chibi: ["[excited]变小了！这样就能到处走走了♪"],
  // Q 版自主活动时的自言自语
  chibiTalk: [
    "[happy]散步散步～今天的桌面也很热闹呢。",
    "[smug]呵呵，这么宽的地方，全都是我的狩猎场♪",
    "[think]那个图标……难道是可爱的孩子？",
    "[bored]主人好像很忙……那我就自己玩啦。",
    "[excited]跑起来了！S 级的速度可不是开玩笑的♪",
    "[proud]今天的训练量，达成！",
    "[tease]偷偷看我的话，我可是会发现的哦？",
    "[gentle]……在这里陪着你，其实也不坏。",
    "[smile]要不要一起出去走走？……开玩笑的，我在这边等你。",
  ],
  chibiTalkNight: [
    "[sleepy]呼啊……屏幕的光暖暖的，好想睡……",
    "[gentle]夜深了呢。你还不睡的话，我就再陪你一会儿。",
  ],
  chibiWake: [
    "[surprise]呀……！我、我才没有睡着！",
    "[shy]……被看到睡脸了吗？忘掉，现在立刻。",
    "[pout]好不容易梦到可爱的孩子了……你得赔我。",
  ],
  chibiWakeSelf: [
    "[sleepy]……嗯？我睡了多久？",
    "[smile]睡饱了♪ 好，继续巡逻。",
  ],
  job: ["[smile]还是这个高度比较好，能好好看着你的脸。"],
  noKey: [
    "[trouble]……还没告诉我怎么连上终端呢。右键我，在「设置」里填一下接口地址和模型吧。",
  ],
  error: ["[trouble]……信号好像不太好，刚才的话没能传过来。"],
};

export function greetLine(date = new Date()) {
  const h = date.getHours();
  const slot = h >= 5 && h < 10 ? "morning" : h < 14 ? "noon" : h < 18 ? "afternoon" : h < 23 ? "evening" : "night";
  return pick(LINES.greet[slot]);
}

export function line(kind, vars = {}) {
  let list = LINES[kind];
  if (!list) return "";
  const text = pick(list);
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

export function pokeLine(count) {
  const tier = count >= 5 ? 2 : count >= 3 ? 1 : 0;
  return pick(LINES.pokeCheek[tier]);
}

export const isNight = (d = new Date()) => d.getHours() >= 23 || d.getHours() < 5;

export const CHIBI_ACTION_NAMES = {
  walk: "在桌面上小跑", dash: "冲刺", hop: "蹦蹦跳跳", dance: "跳舞庆祝", sit: "坐着休息",
  sleep: "打瞌睡", look: "东张西望", talk: "自言自语", fall: "从半空落地",
  victory: "摆胜利姿势", cheer: "欢呼", pose: "摆姿势", spin: "转圈", jump: "跳", hurt: "被吓了一跳", faint: "倒下",
};
