# Goody Mobile Scene Handoff

狀態：portrait/mobile 已改為 canonical `390x844` world、普通置中 cover camera、schema v9 分層 assets 與 canonical wall/floor runtime projection；`390x844`、`430x932`、無重載轉向及 desktop `1440x900` browser visual QA 已完成。貓是 desktop／mobile 唯一可移動玩家；人物是 counter 後方的固定店員。

## 1. Objective 與 source priority

目標是在不破壞已完成 desktop contract 的前提下，補齊直向手機 `/` 的全視窗、可替換、可互動 8-bit scene。每一個 portrait placement、asset、depth、occlusion 與 interaction 都要能由 manifest/schema 驗證，並以 `390x844` 及較寬手機 viewport 做 browser QA。

依 `docs/README.md`，來源優先序固定如下：

1. `public/imagegen/asset-spec.json`：asset class 的 machine source of truth，包含 canvas、frame、grid、anchor 及可選 tile 設定。
2. `public/imagegen/asset-manifest.json`：實際檔案、class、spec version、anchor 與 delivery metadata。
3. 已發布且 immutable 的 Payload runtime manifest：live client 的 runtime source of truth；draft 不得直接供 live client 使用。
4. `docs/GOODY-2D-PLATFORM.md`：產品、runtime、interaction、scene 與 release contract。
5. `docs/GOODY-ASSET-CLASSES.md`、`docs/GOODY-8BIT-ART-WORKFLOW.md` 及其他人類可讀文件。

若 machine source、released manifest 與文件不一致，先停止發布、修正上游並完成驗證；不可用臆測補齊尺寸或 runtime 行為。

## 2. Provenance boundary

每個結論都要標籤其 provenance：

- **Authoritative machine/source truth**：`asset-spec.json`、`asset-manifest.json`、已發布 Payload manifest、`src/runtime/demo.ts`、`src/content/runtime-experience.ts`、domain validator、game interpreter 及其測試。這一層可直接約束 schema、canvas、frame、spawn、placement 與 runtime 行為。
- **User-approved visual contracts from current history**：目前已確認的 desktop scene composition、11 個 SKU 的共同 pastry 規格、可見 actor/cat/clipboard 關係與本 handoff 指定的 reference paths。這一層是視覺意圖與回歸邊界，不可代替 machine values。
- **Inference/recommendation**：任何 mobile 排版、portrait bbox、normalized position、scale、depth、occlusion row、是否生成 mobile-specific asset，以及由 screenshot 推導的尺寸，都必須先交給 ChatGPT Pro 的 `8-bit website project` 研究，再以 browser screenshot 與 code/spec 交叉驗證；未驗證前不得寫成目前事實。

## 3. Current portrait truth

目前 `src/runtime/demo.ts`、asset spec 與 manifest 定義如下：

- world 是 `390x844`；所有 portrait viewport 使用既有普通置中 cover，不增加 phone-safe/contain 特例。`390x844` 是 1:1，`430x932` 只做接近 aspect 的置中 cover crop。
- portrait 使用 scale `1/3` 的 `1170x252` ceiling、`918x1467` backwall 與 counter v3 direct layers；side walls/floor 改用 fully opaque canonical `384x1024`/`1536x512` textures，以 portrait-only projective clip profiles 投影。`portrait-wall-left` corners `(0,60)/(42,74)/(55,650)/(0,650)`、`portrait-wall-right` corners `(348,74)/(390,60)/(390,650)/(335,650)`、`portrait-floor` corners `(55,563)/(335,563)/(390,844)/(0,844)`，皆 subdivisions `4x16`、無 horizontal guides。Wall placements 使用 `concept-side-wall-canonical-v2`、full sourceRect `384x1024`、neutral position/scale、depth `3`、無 `flipX`；floor 使用 `concept-floor-canonical-v3`、full sourceRect `1536x512`、neutral position/scale、depth `2`。`mobile-side-wall-v3`/`mobile-floor-v3` 只保留 manifest delivery history，不是 active runtime assets。
- refrigerator、oven、curtain、fixture 與 counter base/top 各有 mobile-specific 窄長 PNG；mixer、display、11 個 pastries、calendar/menu、6 張 stools、左右側牆 props 與固定店員仍重用 desktop 檔案。
- current portrait runtime 保持 ceiling、backwall、side walls、floor、counter、oven/curtain、container/pastry 分離，沒有 flattened scene。
- `layout.player` 在兩個 orientation 都是 `cat-landscape`。portrait center 是 `(320,745)`，bounds center `x=50..340 / y=735..806`、scale `.14`、depth `52`。
- `shopkeeper` 是固定 spawn placement；portrait center 是 `(320,449)`、scale `.15`、depth `29`，由 counter/display 遮擋下半身。
- domain validator 允許 player 指向 character 或 animal，仍拒絕 item；game interpreter 的 input、bounds、animation 與 depth 路徑依 `layout.player` 運作，不依 character kind 寫死。

player **不是 `RuntimePlacement`**。`src/game/scene.ts` 先依 depth render placements，再獨立 render `layout.player`；不可再新增 cat placement，否則會重複繪製。人物只以固定 shopkeeper placement 出現。

## 4. Reference paths

| 用途 | 路徑與已知尺寸 | Provenance boundary |
| --- | --- | --- |
| Primary mobile reference | `public/goody-cafe-backdrop-mobile.png`（實檔 `1085x1449`） | visual reference；不是 flattened runtime scene |
| 舊版 runtime-sized mobile concept | `public/goody-cafe-mobile-scene-concept.png`（`1086x1448`） | secondary composition reference；不是目前 `390x844` runtime world，也不是 flattened runtime scene |
| Project style reference | `public/og.png` | style reference |
| Desktop scene concept | `public/goody-cafe-desktop-scene-concept.png` | style/composition reference |

Reference images never become the flattened final runtime scene。runtime 必須以獨立 structural layers、containers、items、actors、animals、weather 及 interaction placements 組合；可替換的 container/content 不得烘在同一張 PNG。

## 5. Mandatory Pro-before-code workflow

在新增 portrait code 或生成 mobile asset 前，依序完成：

1. 以 browser screenshot 取得目前 portrait `390x844`（保留 viewport、console 與 orientation 資訊）。
2. 將這張現況 screenshot 與 `public/goody-cafe-backdrop-mobile.png` 一起上傳 ChatGPT Pro 的 `8-bit website project`。
3. 要求 Pro 只輸出可執行的 exact plan：每個可見物件的 pixel bbox、normalized position、scale、depth、occlusion/遮擋關係及 pastry rows；不要接受只給風格描述的回答。
4. 將計畫逐項對照 `src/runtime/demo.ts`、`RuntimePlacement`、`asset-spec.json`、`asset-manifest.json` 及測試；凡 Pro 與 machine/source truth 衝突，先修正計畫或上游 spec，不直接採納數字。
5. 只有在 plan 經 code/spec 及 browser sanity check 證實後，才進入 implementation。

可複製的 compact prompt：

```text
你是 Goody Pâtisserie 的 8-bit scene layout reviewer。請只根據我上傳的 current portrait 390x844 screenshot 與 mobile reference，提出可直接實作的 portrait plan。貓是唯一 `layout.player`；人物是固定 shopkeeper placement。對每個 wall/floor/counter/container/11 pastries/calendar/menu/cat/stool/shopkeeper，輸出：visible pixel bbox、normalized center x/y（相對 390x844 world）、scale、integer depth、occlusion order、pastry row/column。標記哪些是 reuse、哪些需要 mobile-specific transparent asset。不要提供泛泛風格建議，不要改 desktop geometry，不要把 screenshot 或 reference 做成 flattened final scene；若無法確認請標為 UNKNOWN。
``` 

## 6. Desktop contracts to preserve

Portrait work 不能改寫或回推下列 desktop contract：

- desktop walls/floor 使用目前 projective geometry；同一牆面 local plane 與 floor mesh 的 mapping 保持不變。
- baked side props 以普通 sprite/image 顯示；方向由已核准的可見厚度決定，不由 filename 推斷；runtime 不得再次套 homography。
- 11 個 pastry 共用 `256x256` canvas、anchor `x=.5 / y=.859375`（`x128`）、baseline `y=220`；真實物件尺寸、row gaps、top 5 / bottom 6 的 approved hierarchy 要保留；desktop placement scale 是 `.34`。
- shopkeeper 在 counter 後方固定不動，腿不可露出；cat 是唯一 player，在前景使用全部 8 frames 的 idle loop。
- desktop clipboard 位於 calendar 左側、垂直掛放；top clip 固定 cream paper，紙面有稀疏 lines。
- Calendar/menu 的 click、`C`/`M` interaction 與現有 nearby `E` interaction（`src/game/scene.ts` 的 nearest trigger），以及 modal 開啟時 input freeze、關閉後恢復，都要保留。

不要把 desktop homography、world coordinates 或 placement coordinates 直接複製到 portrait；portrait 應有自己的 plan、asset override 或 projection profile。

## 7. Mobile implementation sequence

建議依以下順序實作，每步完成後保存可讀的 diff 與驗證證據：

1. inventory portrait placements（appliances、display、pastries、calendar、menu、shopkeeper、stools、structural layers），確認其 spawn/action identity；cat player 只記在 `layouts.portrait.player`，不是 placement。
2. 完成第 5 節 Pro plan，逐項標記 source truth、approved contract 或 recommendation。
3. 對每個 asset 決定 reuse 現有 version，或建立 mobile-specific、versioned asset；在 placement 引用前，確認它已存在於 `RuntimeExperience.assets`／released manifest assets，並有 `public/imagegen/asset-manifest.json` delivery entry；否則 validator 會拒絕，或 loader 不會載入。不得先生成再猜 class。
4. 增加 portrait structural layers、containers、contents、actors、animals，並使 container/content 分離；不可做 flattened scene。
5. 在 `RuntimeExperience` manifest 加入 orientation-specific placements、必要的 `assetId` override 與 metadata；若新增 canvas/class，先 bump asset spec，再更新 docs/manifest/migration entries。
6. 補 domain/game tests、typecheck/lint，完成 `390x844` 與較寬手機 browser QA；最後再檢查 desktop regression。

Structural strategy 可以混用：ordinary reusable independent sprites、mobile-specific transparent layers，以及 separately specified portrait projections 可以同時存在。不得重用 desktop projection profile，也不得讓同一素材被 double-project。

## 8. Current mobile depth/occlusion contract

目前已以 source tests 與 live browser 驗證：

- ceiling/backwall 使用 direct depth `0/1`；portrait side walls 使用 projective clip depth `3`，floor 使用 projective clip depth `2`；fixture、fridge、oven、curtain 使用 `12/15/15/16`。Side wall/floor placement neutral position `.5/.5`、scale `1`；projective profiles subdivisions `4x16`，無 guides。
- shopkeeper depth `29`，mobile counter v3 base/top depth `30/31`；canvas `978x486`/`1014x132`，scale `1/3`，logical bboxes base `[32,495,326,162]`、top `[26,463,338,44]`；人物固定在 counter 後方，沒有裁切 actor art。
- display/pastry 位於 depth `33/34`；六張 stools 是 depth `40`；cat player 是 depth `52`，在前景地板活動。
- calendar/menu 維持可 spawn 的 placement 與既有 interaction；若 portrait 新增 placement，click target 即可在同一 spawn identity 上啟用；nearby `E` 仍由 scene nearest trigger 處理。
- 同一 row 的 pastries 不重疊，容器與 pastry 分層；遮擋使用 ordered depth/containers，不在 asset PNG 烘入 pastry。

任何具體 depth 數字、遮擋 row 或 normalized positions 都要以 Pro plan、manifest schema 與實際 browser screenshot 為準。

## 9. Image generation details

先依 `docs/GOODY-8BIT-ART-WORKFLOW.md`：若 `goody-8bit-art` skill 存在，先讀完並使用；若不可用，明確記錄後使用 global `imagegen` built-in default。兩者都先檢查現存 style refs：`public/goody-cafe-backdrop-mobile.png`、`public/goody-cafe-mobile-scene-concept.png`、`public/goody-cafe-desktop-scene-concept.png`、`public/og.png`。沒有明確使用者授權時，不得使用 CLI fallback。生成結果處理為：

1. source 從 `$CODEX_HOME/generated_images` 複製到本次擁有的 staging 目錄；保持原始 reference 不變。
2. 使用 flat `#ff00ff` chroma，尤其是 teal/green-rich transparent assets；移除 chroma、despill、safe trim。
3. 以 nearest-neighbor resize，放入 exact registered canvas，保留 class anchor/padding；檔名使用 version。
4. 驗證 alpha corners、alpha bbox、pixel bounds 與 magenta fringe；通過後才更新 `asset-manifest.json`。

所有 asset prompt 都要明確寫：無 wall、無 floor、無 baked shadow、無文字；scene structural layers 也不得把可替換 content 烘進去。

Common style block：

```text
Goody Pâtisserie textured 16-bit/8-bit pixel art, stepped pixel edges, dark auburn outlines, warm hand-shaded highlights, deep teal, cream, dark red, warm wood and brass, readable real object hierarchy, crisp nearest-neighbor pixel finish. No smooth vector art, no anime rendering, no generic game UI.
```

Transparent isolated sprite block：

```text
Single isolated subject on a flat #ff00ff chroma background for keying. No wall, no floor, no cast shadow, no reflection outside the subject, no text, no labels, no extra objects, no baked container or extra pastries. Keep the full silhouette inside the frame with transparent-safe margin and a clean contact/baseline.
```

## 10. Verified current scripts only

這些是目前已查核用途的 scripts；它們不是 mobile 通用 pipeline：

- `.codex-art-staging/process-pastries.mjs`：處理 11 個 pastry chroma source，移除 magenta、trim、nearest-neighbor 到各自 real size，置入 `256x256` canvas，`x=128`、`baselineY=220`，輸出 landscape pastry `v2` files。
- `.codex-art-staging/process-perspective-props.mjs`：移除 side-prop chroma，依已核准的 local shear/size 輸出 baked perspective wall props；同一 script 也產生 canonical floor texture（`1536x512`、`96x64` pitch、`4px` grout）。
- `.codex-art-staging/process-tabby-cat.mjs`：讀取 `2048x768`（4x2）tabby sheet，逐 frame trim、nearest-neighbor resize、baseline registration，輸出 `512x384` frame grid 的 8-frame cat sheet。
- `.codex-art-staging/knife/process-knife.cjs`：移除 magenta/despill，裁切 source alpha bounds，nearest-neighbor fitted bbox `left=12, top=20, width=197, height=145`，置入 `220x170` knife-rack canvas。
- `.codex-art-staging/clipboard/normalize-clipboard.mjs`：移除 magenta，將 visible subject resize 為 `237x385`，置於 `384x448` canvas 的 `(74,28)`，輸出 normalized clipboard。
- `.codex-art-staging/mobile-portrait/process-mobile-portrait-assets.mjs`：舊版 schema v6 pipeline；讀取九個 mobile source/chroma outputs，transparent asset 先由 global `imagegen` chroma helper 完成 border key、soft matte 與 despill，再以 alpha threshold `64` 取得 subject bbox、nearest-neighbor normalize 到 v1 exact canvas；ceiling/backwall 依 top edge crop，舊 floor 依 exact canvas resize。其 v1 side-wall/floor outputs 只保留 delivery history。
- `.codex-art-staging/mobile-portrait/process-mobile-portrait-v2-assets.mjs`：舊 schema v7 side-wall/floor normalization；outputs 現只保留 immutable delivery history。目前 schema v9 使用 canonical flat wall/floor projection，counter v3 files 由 root-owned versioned delivery 提供，runtime 不得重新啟用 mobile side-wall/floor v3 ids。
- `.codex-art-staging/mobile-portrait/process-mobile-portrait-v3-assets.mjs`：產生 ceiling v2、backwall v2，以及只保留 delivery history 的 baked side-wall/floor v3、counter v2 exact canvases。
- `.codex-art-staging/mobile-portrait/process-mobile-portrait-v4-assets.mjs`：將 reference-matched counter top/base v3 chroma-key sources 去背後，以 alpha bbox 與 nearest-neighbor normalize 為 active `1014x132`／`978x486` files。

新的 mobile asset 若規格改變，必須另建 versioned class/file 或更新 deterministic script；不可假設其他既有 scripts 可直接泛化到 mobile canvas、actor 或 container。

## 11. Per-asset rules 與 prompt templates

- **Pastries**：優先 reuse 現有 11 個 landscape assets；若重新生成，保留 `pastry-display-256`、common baseline、真實尺寸 hierarchy、rows/gaps，不把 display/container 烘進 pastry。
- **Character sheet**：4x2、8 frames、`2048x1536`，每 frame `512x768`、per-frame bottom-center anchor；actor 保持完整 silhouette。
- **Animal sheet**：tabby cat `2048x768`，每 frame `512x384`、baseline registration；保持 8-frame loop。
- **Baked side prop**：只烘一次正確 local perspective/visible thickness；runtime 以普通 image，不再做 skew、homography 或 flip。
- **Clipboard**：`item-wall` `384x448`，center anchor；alpha bbox 必須是 `x=74..310`、`y=28..412`，可見 cream paper、top clip 與 sparse lines；不要放 menu data text 到圖片。
- **Calendar**：沿用 `item-wall` class 與獨立 calendar spawn；mobile 若需新 canvas，另建 versioned class/entry，不把 calendar 融入 wall。
- **Mobile containers**：cabinet/shelf/plate/tray/refrigerator/oven 與 pastries 必須分開 asset/placement；不得 bake pastries。

Prompt templates：

```text
Pastry: [common style block] [isolated sprite block] One [SKU name], realistic pastry proportions, preserve true size hierarchy; centered on a transparent-safe canvas, contact baseline explicit, no plate/container.

Actor sheet: [common style block] [isolated sprite block] One shopkeeper, 4x2 exactly 8 distinct idle/moving frames, full body in every 512x768 cell, same baseline and silhouette, no counter and no cropped legs.

Animal sheet: [common style block] [isolated sprite block] Tabby cat, 4x2 exactly 8 frames, each 512x384, paws/body baseline consistent, no floor or prop.

Baked wall prop: [common style block] [isolated sprite block] [prop], one approved local perspective with visible thickness, no text and no wall texture; output only the prop on transparent canvas, never apply another runtime homography.

Clipboard: [common style block] [isolated sprite block] Vertical wall clipboard, cream paper held by a top clip, sparse writing lines only, no readable menu text; reserve item-wall alpha bbox x74..310/y28..412 on 384x448 canvas.
```

不要在 templates 裡填入未經 Pro/code/spec 驗證的 mobile geometry。

## 12. Runtime integration

使用現有 `RuntimePlacement` contract：

- 每個 orientation 擁有自己的 placements；portrait 可針對同一 spawn 使用不同 normalized position、scale、depth。
- `type: "spawn"` 可保留 spawn identity，同時用 optional `placement.assetId` override 指定同 kind 的 layout-specific visual asset；不要複製或重新命名 content schema。
- 每個 reuse/new mobile asset 都必須先存在 `RuntimeExperience.assets` 及 released manifest assets，並在 `public/imagegen/asset-manifest.json` 有 delivery entry，placement 才能引用；缺少 asset 時 validator 會拒絕，或 runtime loader 不會載入。
- Phaser 初次只 preload 目前 orientation 的 placement、player、fallback 與 weather assets；轉向時才載入另一個 orientation 缺少的檔案，完成後重建 layout。不得為了 rotation support 讓 desktop 首屏預載 mobile-only PNG。
- 保留 spawn ids：`shopkeeper`、`calendar`、`menu-board`、`cat-landscape`，以及 11 個 pastry ids（`pandan-pearl-sugar-choux`、`pandan-thai-tea-saint-honore`、`pandan-thai-tea-saint-honore-6-inch`、`pistachio-cherry-tart`、`muscat-white-wine`、`pandan-thai-tea-cake-roll`、`vanilla-basque-cheesecake-slice`、`vanilla-basque-cheesecake-6-inch`、`pandan-madeleine-2-pack`、`pistachio-cherry-dacquoise`、`vanilla-canele`）。
- 保留既有 Calendar/Menu click interactions、`C`/`M` keyboard keys 與 nearby `E` trigger；React modal/input gate 的 freeze/restore contract 不變。手機 touch controls 也必須驗證 movement press/release、touch interaction 與 modal freeze/restore。
- 加入 portrait placement 才會使該 spawn 在 portrait 具有 render/click target；沒有 placement 不代表要在 game code 寫 hard-coded fallback。
- `asset-manifest.json` 的 `intendedDisplay.portrait` 若已有 portrait metadata，或 asset 實際用於 portrait，必須符合 actual placement scale/canvas；預先規劃 metadata 可以在尚無 current placement 時存在，但不能當作已 render 的 proof。
- 新 class/canvas 必須先 bump `asset-spec.json` schema version，再遷移每個受影響 manifest entry 與文件；不可只改單一 published asset。

## 13. Exact files to inspect/edit

開始下一個 mobile task 前，逐一檢查：

```text
src/runtime/demo.ts
src/content/runtime-experience.ts
src/domain/experience.ts
src/game/scene.ts
public/imagegen/asset-spec.json
public/imagegen/asset-manifest.json
docs/GOODY-ASSET-CLASSES.md
docs/GOODY-8BIT-ART-WORKFLOW.md
tests/game/runtime-scene.test.mjs
tests/game/runtime-animation-assets.test.mjs
tests/domain/runtime-experience.test.ts
tests/domain/runtime-projection.test.ts
```

## 14. Acceptance checklist

本節 canonical QA requirements 的 provenance 是 `docs/GOODY-2D-PLATFORM.md` 的 Verification contract、`package.json` 的 current build scripts，以及目前 user-approved desktop/mobile handoff；它們是必做驗證，不是 Pro 的 inferred geometry。

完成 future mobile task 前，逐項取得 proof：

- tests、typecheck、lint 及 `git diff --check` 通過；執行 `npm run build`，並執行 `npm run deploy:app:build` 產生 OpenNext Worker bundle。
- desktop browser `1440x900` canonical QA 通過，並以 approved `1536x1024` regression screenshot 比對不變；mobile browser `390x844` 及至少一個較寬 phone viewport 都通過；viewport cover、無 stretch、document 不 overflow。
- scene 保持 reference 的整體比例；所有新增 runtime image 都由 `/imagegen/` 載入。
- shopkeeper 固定在 counter 後方且無 feet leak；只有 cat player 可移動；counter、display、pastry、cat 的 depth/occlusion 正確。
- 11 個 pastries 皆顯示，realistic scale、row alignment、無 overlap；container/content 可獨立替換。
- calendar/menu 可見；click、`C`/`M` 及 nearby `E` 可開 modal，modal 期間 input freeze，關閉後 restore；手機 touch movement 的 press/release 與 touch interaction 也通過。
- cat 全部 8-frame idle loop 有可觀察 live frame change；shopkeeper 維持固定 idle；rotation/orientation 不需 reload。
- browser console/page errors 為零。

目前 schema v9 已完成 live browser proof：`390x844` 精確基準、`430x932` 等比置中 cover、無 reload 的 portrait/landscape rotation、desktop `1440x900` 回歸、C/M modal 與關閉後 focus restore 均通過；console 沒有 page error。Source tests 仍保留這些幾何與互動 contract，不能取代後續視覺改動的 browser QA。

## 15. Stop conditions / non-goals

遇到下列任一情況先停，回報 evidence，不要猜數字：

- 不為 mobile fit 而修改 desktop geometry、homography 或 approved placements。
- 不執行 Prettier；不做與 handoff 無關的 reformat/refactor。
- 不覆寫 published assets；新檔一律 versioned。
- 不把 reference、screenshot 或 scene concept 做成 flattened runtime background。
- 不寫入未經 Pro + code/spec + browser 驗證的 mobile bbox、scale、depth、projection 或 occlusion numbers。
- 不對同一 asset 做 runtime double projection；baked prop 不能再套 homography/skew/flip。
