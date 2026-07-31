# Goody 2D Scene Platform

狀態：實作進行中。本文件是後續 Codex session 的 canonical plan。

## 產品 contract

Goody 是為 Goody Pâtisserie 打造的全視窗、持續循環 8-bit 遊戲風格網站，不是把小型遊戲 canvas 包在傳統 marketing page 外的網站。

- `/` render live experience。
- `/` 是唯一公開的全視窗體驗。
- 桌面與直向行動版都填滿 visual viewport，且不拉伸 art。
- Phaser 負責 rendering、movement、animation loop、weather、hit target 與 scene entity。
- React DOM 負責 accessible navigation、status、dialog、focus 與 content。
- 開啟 modal 會暫停 Phaser input 並防止 click-through；關閉後恢復 input 與 focus。

## 可替換內容

已發布的 Payload snapshot 可在不修改 Phaser code 的情況下替換下列類別：

1. Scene 與 scene variants。
2. 出現的 characters 及其 placement。
3. Weather presentation。
4. Items 與 interactive objects。
5. Actions 與 loop animations。
6. Animals 及其 behavior。

Immutable released manifest 是 runtime source of truth。Draft authoring collections 不得直接供 live client 使用。

## Runtime seam

`RuntimeExperience` 是 Payload releases 與 Phaser 之間唯一的 versioned interface，包含：

- Release id 與 version。
- Asset descriptors 與 load type（`image`、`spritesheet` 或 `atlas`）。
- Landscape 與 portrait layouts。
- World dimensions、movement bounds、camera data、spawn points 與 normalized placements。
- 有序的 scene layers 與 entity depth。
- Characters、animals、items、weather mappings、actions 與 interactions。
- 供 React 使用的 modal payloads。

Runtime asset URLs 目前使用 `/imagegen/...`。未來 S3/R2 工作只修改 URI adapter 或 manifest values，不修改 Phaser interpreter。

目前 runtime schema version 3 可在 orientation layout 宣告 `projective-quad` profile。桌機側牆使用單一 local plane；`horizontalGuides` 為同一 plane 增加共享橫向控制列，牆底材質與牆上物件都走同一 mapping，避免素材先烘焙透視後又被二次投影。正視地板材質則由獨立 floor mesh 產生透視。Projective placement 不接受 spritesheet；動畫角色仍使用一般 sprite placement。

Projective scene 需要 WebGL。Client 明確以 Phaser WebGL renderer 啟動；裝置不支援 WebGL 時顯示啟動錯誤，不得靜默退回無法繪製 Mesh2D 的 Canvas renderer。

Payload lookup 順序：

1. 讀取 `site-settings.defaultReleaseKey`。
2. 找到相符的 `release-manifests` record。
3. 只接受 custom status `released` 且通過 Payload published state 的 record。
4. 將 manifest 驗證為 `RuntimeExperience`。
5. 只有在本機 CMS 資料不存在或無法取得時，才使用 typed demo adapter。

頁面載入或 focus 時 refresh。Live push/SSE 不在目前 scope。

## Scene composition

不得把一張 flattened café image 作為最終 runtime scene。既有的 `public/goody-cafe-backdrop*.png` 與 `public/og.png` 只作為 style reference。

下列 initial demo kit 用來說明獨立資產，不是封閉清單，也不是必須使用的 id。只要符合已註冊 class 且 reference 有效，任何 layer 都可以加入更多 assets。

### Background

- 左牆。
- 中央牆。
- 右牆。
- Refrigerator。
- Oven。

### Stage

- Counter/table body。
- Countertop。
- Tabletop pastry/display items。
- Individual tabletop pastries。
- Oven 內可見的 pastries。
- Calendar。
- Tokyo framed painting。
- Melbourne framed painting。

### Foreground

- Floor surface。
- Weather particle/effect。
- Animal。
- Weekly-menu board。

### Actors

- Player/appearing character。
- 後續 character outfits 與 sprite sheets。

每個 item 都有自己的 file、asset id、class、canvas、anchor、normalized placement、z-index 與 version。Landscape 與 portrait layouts 可以重用相同 asset，但使用不同 normalized placement 與 scale。

未來內容可加入更多 walls、appliances、furniture、pastries、oven contents、plants、lamps、windows、props、animals、weather、effects 或 actors。加入既有類型的 asset/entity 只改變 content；新增 canvas shape 則新增 versioned asset class，不得增加 hard-coded Phaser branch。

Container/content 規則：預期可獨立變更的內容必須使用分開的 asset 與 placement。Empty display cabinet、shelf、plate、baking tray、refrigerator 或 oven 不得在 PNG 中包含可替換 pastries。每個 tart、cake、croissant、canele 或其他 pastry 都使用 `pastry-small` class，並佔用 manifest 定義的 slot。同一 pastry 可出現在 counter、cabinet 或 oven tray，不必重新生成 container。

## Demo weekly menu（2026-07-31）

來源：[Goody Instagram weekly post](https://www.instagram.com/p/DbYEIBjk4Lo/?img_index=11)。販售期間為 `07/31(五)－08/02(日)`，營業時間為 `13:00-18:00`。

Demo 以 11 個獨立 SKU asset 對齊菜單。`斑蘭瑪德蓮 2入` 是一個兩入 SKU，因此單一 SKU asset 內顯示兩顆；其餘每個 SKU asset 只包含一份甜點。6 吋品項與單人份使用不同 asset id，後台可分別換圖與排程。

| SKU | 品項 | 售價 | 註記 |
| --- | --- | ---: | --- |
| 01 | 斑蘭珍珠糖泡芙 | $120 | 新品 |
| 02 | 斑蘭泰奶聖多諾 | $220 | 建議當天吃完 |
| 03 | 斑蘭泰奶聖多諾 6吋 | $1300 | 建議當天吃完 |
| 04 | 開心果櫻桃塔 | $220 | |
| 05 | 麝香白酒 | $200 | 含酒 |
| 06 | 斑蘭泰奶蛋糕捲 | $450 | |
| 07 | 香草巴斯克乳酪 切片 | $130 | |
| 08 | 香草巴斯克乳酪 6吋 | $750 | |
| 09 | 斑蘭瑪德蓮 2入 | $100 | |
| 10 | 開心果櫻桃達克瓦茲 | $90 | |
| 11 | 香草可麗露 | $80 | |

## Asset 規則

- [`GOODY-8BIT-ART-WORKFLOW.md`](GOODY-8BIT-ART-WORKFLOW.md) 定義生成與交付 workflow。
- [`GOODY-ADMIN-ASSET-MANAGEMENT.md`](GOODY-ADMIN-ASSET-MANAGEMENT.md) 定義 CMS asset library 行為。
- 所有 runtime images 位於 `public/imagegen/`。
- [`GOODY-ASSET-CLASSES.md`](GOODY-ASSET-CLASSES.md) 是人類可讀的 class reference。
- `public/imagegen/asset-spec.json` 是 size registry。
- `public/imagegen/asset-manifest.json` 記錄實際檔案與 classes。
- Generated source dimensions 一律不直接接受。Runtime 使用前必須完成 chroma removal、safe trimming、nearest-neighbor scaling、transparent padding 與 exact canvas placement。
- Released files 使用 versioned names，且永不覆寫。
- 修改 class dimension 必須建立新的 spec version，並完成 manifest migration。
- 有 `goody-8bit-art` 時使用它。若無法使用，改用 global `imagegen`，並明確指定現有三張 public image 作 style reference；不得宣稱使用不存在的 skill。

視覺語言：textured 16-bit/8-bit pixel art、stepped pixels、dark auburn outlines、warm hand-shaded light、deep teal、cream、dark red、wood 與 brass。

## Animation

Runtime interpreter 支援 data-driven continuous loops：

- 未來 sheets/atlases 的 sprite frame loops。
- idle bob、oven glow、cat movement、sign movement 等 tween loops。
- 重複播放的 weather particle loops。

Actions reference asset/entity ids。Validation 會拒絕 dangling ids、invalid frames、invalid normalized coordinates 與不相容的 actions。

Camera cover algorithm：

```text
zoom = max(viewportWidth / worldWidth, viewportHeight / worldHeight)
```

Camera 保持置中。Landscape 與 portrait layouts 都預先載入。Resize 與 orientation change 重新計算 layout，不拉伸 assets，也不洩漏 listeners。全視窗指 browser visual viewport（`100vw` × `100dvh`），不呼叫 Fullscreen API。Manifest 持有分開的 landscape 與 portrait world sizes；寬度大於或等於高度時選 landscape，否則選 portrait。Live resize 不 reload 即可切換 layout，接著套用 centered cover zoom，teardown 時移除所有 resize listeners。

## Interactions

Items 宣告 typed actions。Phaser 不負責 modal markup。

```text
click item
  -> Phaser 發出離散 interaction key
  -> bridge 停用 game input
  -> React 以 manifest payload 開啟命名 modal
  -> close 恢復 game input 與 runtime focus
```

必要的 demo interactions：

- Calendar：以 schedule 開啟 calendar modal。
- Menu/list board：開啟 current-week pastry menu。
- Keyboard `E`：提供等效的 nearby interaction。

## Scheduling 與 releases

既有 resolver 順序保持不變：

1. 較高 priority。
2. 較具體的 date/range。
3. 較晚的 release timestamp。

Timezone 是 `Asia/Taipei`。Weekly schedule 與 dated overrides 選出 effective scene/variant。Publishing 會驗證所有 asset/action/spawn/weather references，建立 immutable snapshot，再變更 active release pointer。Rollback 只變更 pointer，永不 mutate 舊 release。

## Verification contract

完成前必須通過：

- Typecheck、lint、domain tests、game tests。
- Next production build 與 OpenNext Worker bundle。
- 於 1440x900 與 390x844 執行 browser test。
- Exact viewport coverage，且 document 不 overflow。
- 所有 runtime image requests 都來自 `/imagegen/`。
- Frames 之間可觀察到 visible continuous loop change。
- Character、animal、item、weather 與 layered scene 都有 render。
- Calendar 與 menu 開啟正確 modal。
- Modal 開啟期間 movement 與 clicks 都保持 frozen。
- Close 後恢復 input 與 focus。
- Resize/orientation change 後維持 full-viewport。
- Browser console/page errors 為零。
- 人工檢查最終 screenshots。

## Implementation 順序

1. 完成 asset registry 與獨立 normalized files。
2. 完成 `RuntimeExperience` contract、validation、demo adapter 與 released Payload adapter。
3. 以 generic Phaser interpreter 取代 hard-coded procedural scene。
4. 讓 `/` 成為 full-viewport live experience。
5. 串接 modal registry 與 input gate。
6. 執行完整 automated 與 visual verification。

完成上述 vertical slice 後，不得宣稱完整 platform 已完成。Visual CMS editing、automatic atlas packing、Tiled ingestion、S3/R2 publishing 與 live push updates 仍是後續 milestone。
