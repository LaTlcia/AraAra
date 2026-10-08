# AraAra

[English](README.md) | **简体中文**

遠藤亜羅椰（《突击莉莉 Last Bullet》）的桌面宠物，Windows / macOS 双平台。用 Spine 立绘和 Q 版美术资源制作。

- **立绘**：11 套服装，21 种表情由眉毛 / 眼睛 / 嘴 / 腮红部件拼出，配合 Fun / Anger / Shy / Surprise / Think / Positive / Negative / PoseChange 等动作
- **Q 版**：同样 11 套服装；很久没人理她时会自己活动——小跑、冲刺、蹦跳（窗口真的会跳起来）、跳舞庆祝、坐下、东张西望、自言自语；放在半空会掉下来（可以关掉）。开始时间、活跃程度和允许的动作都能在「设置 → 外观」里调
- **睡觉**：很久没理她就会犯困。立绘站着打盹、慢慢睡熟；Q 版搬出一张小床，跳上去盖好被子，被子跟着呼吸起伏。白天只是打个盹，过一会儿自己会醒；晚上（22 点～早上 6 点）睡得很沉，只有被叫醒才起来。点她、拖她或者打开对话框会把她叫醒，轻轻摸头不会。睡觉动作和小床在原始素材里都没有：动作是用代码写的关键帧，床是用 Canvas 画的
- **AI 对话**：接 OpenAI 兼容的 Chat Completions 接口（DeepSeek、通义千问、Ollama、各种中转都行），人格来自角色卡（SillyTavern 格式，含世界书）
- **情绪 → 动作**：AI 每句话前写情绪标签（如 `[smug]`），桌宠按标签切换表情、播放动作、冒出漫符；说话时嘴巴会动
- **互动**：点头摸头、戳脸、在头上来回晃鼠标 = 一直摸、拖动搬家；这些互动会作为上下文告诉 AI
- **本地情绪接口**：`http://127.0.0.1:47210`，让别的程序驱动她的表情和台词

## 使用

| 操作 | 效果 |
| --- | --- |
| 双击 / `Ctrl(⌘)+Shift+Y` | 打开对话框；点 × 或按 Esc 收起，一段时间不对话会自动收起；输入 `/reset` 清空记忆 |
| 鼠标移到身上 | 出现「说话 / 换衣服 / 菜单」按钮 |
| 右键 / 托盘图标 | 菜单：换衣服、立绘 / Q 版、大小、哄她睡觉 / 叫醒她、表演情绪、置顶、设置… |
| 点头 / 点脸 / 点身体 | 摸头 / 戳脸 / 戳一下（连续戳她会生气） |
| 按住拖动 | 换位置 |

第一次使用请在「设置 → 对话」里填接口地址（Base URL，填到 `/chat/completions` 之前，一般以 `/v1` 结尾）、模型名和 API Key（本地模型可以不填 Key）。Key 用系统钥匙串（macOS Keychain / Windows DPAPI）加密保存，代理留空时跟随系统代理。

大小可以在「设置 → 外观」里用滑块在 50%～200% 之间调节，右键菜单里也有放大 / 缩小。

## 角色卡

仓库里带了两张卡（SillyTavern chara_card_v3 格式）：`assets/card/araya.json` 是参考用的完整角色卡（存在时优先使用），`assets/card/template.json` 是精简的模板卡（没有 `araya.json` 时使用）。可以直接改，也可以在「设置 → 对话 → 自定义角色卡」里填任意位置的卡（V1 / V2 / V3 格式都能读）。

文本里可以用 `{{char}}`、`{{user}}`、`{{time}}`、`{{date}}`、`{{weekday}}` 等宏。世界书里 `constant: true` 的条目每轮都会注入，其余条目在聊天中出现 `keys` 里的关键词时才注入。

## 情绪标签

AI 回复的格式：`[smug]哎呀，被我抓到了♪[shy]……别、别一直盯着看嘛。`

| 标签 | 情绪 | 表情 | 立绘动作 | Q 版 |
| --- | --- | --- | --- | --- |
| normal | 平静 | Normal | Base | idle |
| smile | 微笑 | Smile | Fun | victory |
| happy | 开心 | Smile_L | Fun | cheer |
| smug | 从容坏笑 | HalfEye_Normal | PoseChange05 | pose |
| tease | 调戏 / 撩人 | Wink | PoseChange04 | spin |
| proud | 自信 | Strong | Positive | pose |
| excited | 兴奋 / 心动 | Kira | Fun | jump |
| shy | 害羞 | Shy | Shy | idle |
| surprise | 惊讶 | Surprise | Surprise | hurt |
| shock | 大受打击 | Surprise_L | Surprise | faint |
| think | 思考 | Serious | Think | idle |
| serious | 认真 | Serious | PoseChange03 | pose |
| angry | 生气 | Anger | Anger | hurt |
| pout | 不满 / 吃醋 | HalfEye_Anger | Anger | idle |
| sad | 难过 | Sad | Negative | sit |
| trouble | 困扰 / 无奈 | Trouble | Think | idle |
| bored | 无聊 | Ennui | PoseChange04 | sit |
| sleepy | 困倦 | Sleep | Sleep（打瞌睡） | doze |
| gentle | 温柔安心 | Close | Positive | idle |

映射表在 `src/shared/emotions.json`，表情部件组合在 `src/renderer/faces.js`。

## 情绪接口

```bash
# 做表情（可带台词）
curl -X POST http://127.0.0.1:47210/emote -H "Content-Type: application/json" -d '{"emotion":"shy","text":"……别一直盯着我看嘛。"}'
# 说一段话，可以夹情绪标签
curl -X POST http://127.0.0.1:47210/say -H "Content-Type: application/json" -d '{"text":"[smug]哎呀♪[shy]……才没有害羞。"}'
# 当作主人说的话交给 AI，返回她的回复
curl -X POST http://127.0.0.1:47210/chat -H "Content-Type: application/json" -d '{"message":"今天也辛苦了"}'
```

只监听 127.0.0.1，POST 必须是 `application/json`，带 `Origin` 头的浏览器请求会被拒绝。

## 开发

需要 Node.js 20+。

```bash
npm install
npm start              # 运行
npm run build:icons    # 重新生成图标
npm run dist           # 打包：mac（dmg / zip，arm64 + x64）和 win（安装包 + 便携版，x64），输出在 dist/
```

下载 Electron 较慢时可以走代理：`ELECTRON_GET_USE_PROXY=1 GLOBAL_AGENT_HTTPS_PROXY=http://127.0.0.1:7890 npm install`。

### 目录

```
assets/              美术资源（打包只需要这个）
  jobspine/<id>/     立绘：skeleton.json + atlas + png
  chibi/             Q 版：共用 skeleton.json + 各服装 atlas / png
  data/araya.json    服装列表
  card/araya.json    参考角色卡
  card/template.json 模板角色卡
  icons/             托盘图标
src/main/            Electron 主进程：窗口、托盘、设置、对话服务、情绪接口
  chat/              角色卡 / 世界书 / 提示词 / 流式客户端
src/renderer/        桌宠页面：PIXI + pixi-spine 渲染、气泡、互动、Q 版行为、设置页
src/shared/          情绪表、窗口布局
tools/               skel2json（Spine 3.6 二进制 → JSON）、睡觉动作生成、图标生成、打包钩子、调试页
```

### 说明

- 骨骼原本是 Spine 3.6.53 二进制，`tools/skel2json.mjs` 按 spine-libgdx 3.6 的 SkeletonBinary 读取顺序转成 JSON，由 pixi-spine 的 3.7 运行时渲染。
- Q 版的 MoveJump / MoveLanding 会把根骨骼 Move（和 TR）甩出几千单位；渲染时锁住这些位移，上下运动完全交给窗口。
- 图集里 0×0 的区域表示「这套衣服没有这个部件」，pixi 会把它当成整张贴图来画，所以载入骨骼后会去掉引用空区域的附件（`stage.js` 的 `stripEmptyAttachments`）。
- 睡觉动作（立绘：Sleep / SleepLoop / SleepDeep / SleepEnd / SleepWake；Q 版：SleepIntro / SleepLoop / SleepWake）由 `tools/sleep-anim.mjs` 在待机姿势上叠加关键帧生成，已经写进随附的 `skeleton.json`；`tools/sleeplab.html` 可以逐帧预览。小床和被子由 `src/renderer/bed.js` 用 Canvas 2D 绘制。
- 嘴型 E / F / G 在贴图里是空的；「半眼」用「柔和闭眼 + 微笑」来表现。
- Windows 在 125% / 150% 这类非整数缩放下，读回的窗口尺寸有舍入误差，所以主进程只认自己记录的窗口尺寸，移动时不读回（`main.js` 的 `petSize`）。
- macOS 包只做了 ad-hoc 签名：第一次打开时右键 → 打开，或者执行 `xattr -dr com.apple.quarantine /Applications/亚罗椰桌宠.app`。
- Windows 包可以在 macOS 上交叉编译，exe 图标和版本信息由 `tools/after-pack.js`（resedit）写入。

## 版权声明

角色、立绘等美术资源的版权归 Assault Lily Project 及《突击莉莉 Last Bullet》相关权利方所有。本项目为非官方同人作品，仅供个人学习交流，请勿用于商业用途或二次分发素材。
