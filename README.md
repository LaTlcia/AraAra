# AraAra

**English** | [简体中文](README.zh-CN.md)

A desktop pet of Araya Endo (遠藤亜羅椰) from *Assault Lily Last Bullet*, for Windows and macOS. Built from her Spine standing-art and chibi art assets.

- **Standing art**: 11 outfits, 21 facial expressions assembled from eyebrow / eye / mouth / blush parts, plus Fun / Anger / Shy / Surprise / Think / Positive / Negative / PoseChange motions
- **Chibi**: the same 11 outfits. When left alone for a while she keeps herself busy — jogging, dashing, hopping (the window really jumps), dancing, sitting down, looking around, talking to herself. Drop her mid-air and she falls to the bottom of the screen (can be turned off). Start delay, activity level and allowed actions are all configurable under *Settings → Appearance*
- **Sleep**: ignore her long enough and she gets drowsy. The standing art dozes off on her feet and sinks into a deep sleep; the chibi pulls out a little bed, hops in and tucks herself under the blanket, which rises and falls with her breathing. Daytime naps end on their own; at night (22:00–6:00) she sleeps soundly until you wake her. Clicking, dragging or opening the chat wakes her; gentle head pats don't. Neither the sleep motions nor the bed exist in the original assets — the motions are keyframed in code and the bed is drawn with Canvas
- **AI chat**: works with any OpenAI-compatible Chat Completions API (DeepSeek, Qwen, Ollama, relays…). Her personality comes from a character card (SillyTavern format, with lorebook)
- **Emotions → motions**: the AI prefixes sentences with emotion tags such as `[smug]`; the pet switches expressions, plays motions and pops comic symbols accordingly, and her mouth moves while she talks
- **Interaction**: click her head to pat, poke her cheek, wiggle the mouse over her head to keep patting, drag her around — these interactions are passed to the AI as context
- **Local emotion API**: `http://127.0.0.1:47210` lets other programs drive her expressions and lines

## Usage

| Action | Effect |
| --- | --- |
| Double-click / `Ctrl(⌘)+Shift+Y` | Open the chat bar; close it with × or Esc, or let it hide itself after a while; type `/reset` to clear her memory |
| Hover over her | Shows the Talk / Wardrobe / Menu buttons |
| Right-click / tray icon | Menu: outfits, standing / chibi, size, tuck her in / wake her, perform emotion, always on top, settings… |
| Click head / face / body | Pat / poke her cheek / poke (she gets annoyed if you keep poking) |
| Drag | Move her |

On first launch, open *Settings → Chat* and fill in the API base URL (everything before `/chat/completions`, usually ending in `/v1`), the model name and the API key (optional for local models). The key is encrypted with the system keychain (macOS Keychain / Windows DPAPI). Leave the proxy empty to follow the system proxy.

Size can be adjusted freely between 50% and 200% with the slider in *Settings → Appearance*; the right-click menu also has zoom in / out.

> The app UI is in Chinese.

## Character card

The repository ships two cards (SillyTavern chara_card_v3): `assets/card/araya.json`, the full reference card (used when present), and `assets/card/template.json`, a minimal template used when there is no `araya.json`. Edit either one directly, or point *Settings → Chat → Custom character card* at any card file (V1 / V2 / V3 cards are supported).

Text fields support macros such as `{{char}}`, `{{user}}`, `{{time}}`, `{{date}}` and `{{weekday}}`. Lorebook entries with `constant: true` are injected every turn; the others are injected only when one of their `keys` appears in the conversation.

## Emotion tags

Reply format: `[smug]Oh my, caught you♪[shy]…d-don't stare at me like that.`

| Tag | Emotion | Face | Standing motion | Chibi |
| --- | --- | --- | --- | --- |
| normal | calm | Normal | Base | idle |
| smile | smile | Smile | Fun | victory |
| happy | happy | Smile_L | Fun | cheer |
| smug | composed smirk | HalfEye_Normal | PoseChange05 | pose |
| tease | teasing | Wink | PoseChange04 | spin |
| proud | confident | Strong | Positive | pose |
| excited | excited / smitten | Kira | Fun | jump |
| shy | shy | Shy | Shy | idle |
| surprise | surprised | Surprise | Surprise | hurt |
| shock | shocked | Surprise_L | Surprise | faint |
| think | thinking | Serious | Think | idle |
| serious | serious | Serious | PoseChange03 | pose |
| angry | angry | Anger | Anger | hurt |
| pout | pouting / jealous | HalfEye_Anger | Anger | idle |
| sad | sad | Sad | Negative | sit |
| trouble | troubled | Trouble | Think | idle |
| bored | bored | Ennui | PoseChange04 | sit |
| sleepy | sleepy | Sleep | Sleep (dozes off) | doze |
| gentle | gentle | Close | Positive | idle |

The mapping lives in `src/shared/emotions.json`; face part combinations live in `src/renderer/faces.js`.

## Emotion API

```bash
# Perform an emotion (optionally with a line)
curl -X POST http://127.0.0.1:47210/emote -H "Content-Type: application/json" -d '{"emotion":"shy","text":"……别一直盯着我看嘛。"}'
# Say something; emotion tags can be mixed in
curl -X POST http://127.0.0.1:47210/say -H "Content-Type: application/json" -d '{"text":"[smug]哎呀♪[shy]……才没有害羞。"}'
# Send a message to the AI as if the user typed it; returns her reply
curl -X POST http://127.0.0.1:47210/chat -H "Content-Type: application/json" -d '{"message":"今天也辛苦了"}'
```

It only listens on 127.0.0.1, POST bodies must be `application/json`, and browser requests carrying an `Origin` header are rejected.

## Development

Requires Node.js 20+.

```bash
npm install
npm start              # run
npm run build:icons    # regenerate icons
npm run dist           # package: mac (dmg / zip, arm64 + x64) and win (installer + portable, x64) into dist/
```

If downloading Electron is slow, go through a proxy: `ELECTRON_GET_USE_PROXY=1 GLOBAL_AGENT_HTTPS_PROXY=http://127.0.0.1:7890 npm install`.

### Layout

```
assets/              art assets (all that packaging needs)
  jobspine/<id>/     standing art: skeleton.json + atlas + png
  chibi/             chibi: shared skeleton.json + per-outfit atlas / png
  data/araya.json    outfit list
  card/araya.json    reference character card
  card/template.json template character card
  icons/             tray icons
src/main/            Electron main process: window, tray, settings, chat service, emotion API
  chat/              character card / lorebook / prompt / streaming client
src/renderer/        pet page: PIXI + pixi-spine rendering, bubble, interaction, chibi behaviour, settings page
src/shared/          emotion table, window layout
tools/               skel2json (Spine 3.6 binary → JSON), sleep animation generator, icon generator, packaging hook, debug pages
```

### Notes

- The skeletons were Spine 3.6.53 binaries. `tools/skel2json.mjs` converts them to JSON following the read order of spine-libgdx 3.6's SkeletonBinary, and they are rendered with pixi-spine's 3.7 runtime.
- The chibi MoveJump / MoveLanding animations throw the root bones (Move and TR) thousands of units away; those translations are locked while rendering and vertical movement is left to the window.
- 0×0 regions in an atlas mean "this outfit has no such part", but pixi would draw them as the whole texture, so attachments referencing empty regions are removed after loading (`stripEmptyAttachments` in `stage.js`).
- The sleep animations (standing art: Sleep / SleepLoop / SleepDeep / SleepEnd / SleepWake; chibi: SleepIntro / SleepLoop / SleepWake) are generated by `tools/sleep-anim.mjs` as keyframes layered on the idle pose and are already baked into the shipped `skeleton.json` files; `tools/sleeplab.html` previews them frame by frame. The bed and blanket are drawn with Canvas 2D in `src/renderer/bed.js`.
- Mouth shapes E / F / G are empty in the textures; the "half-closed eyes" look is approximated with gently closed eyes and a smile.
- On Windows with fractional scaling (125% / 150%), window sizes read back from the OS carry rounding errors, so the main process only trusts its own recorded window size and never reads it back while moving (`petSize` in `main.js`).
- macOS builds are only ad-hoc signed: right-click → Open on first launch, or run `xattr -dr com.apple.quarantine /Applications/亚罗椰桌宠.app`.
- Windows builds can be cross-compiled on macOS; the exe icon and version info are written by `tools/after-pack.js` (resedit).

## Copyright

The characters and artwork belong to Assault Lily Project and the rights holders of *Assault Lily Last Bullet*. This is an unofficial fan project for personal learning and exchange only — do not use it commercially or redistribute the assets.
