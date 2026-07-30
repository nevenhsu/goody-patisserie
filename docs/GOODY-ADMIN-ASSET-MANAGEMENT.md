# Goody Admin Asset Management

## 目的與範圍

CMS asset library 必須支援具名、分類的 runtime images。Administrator 可以建立 asset record，並在不修改 Phaser code 的情況下更新 image、name 或 category。本文件也定義以結構化欄位編輯 scene、layout、互動內容、排程與 release 的管理 contract；不代表所有管理 UI 或後續 milestone 已完成。

## Asset 欄位與 library 行為

每個 asset record 必須包含：

- 穩定的 asset id。
- 必填的 display name。
- 必填的 category。
- 必填的 image。
- Runtime asset class 與 asset-spec version。

管理者可以：

- 建立含 image、name、category 的 asset。
- 在 asset list 查看 image preview、name 與 category。
- 依 name 搜尋 asset。
- 依 category 篩選 asset。
- 編輯時替換 image、修改 name 或修改 category。

Categories 是 CMS data，不是 hard-coded Phaser allowlist。Category management UI 不在本文件範圍內，但新增或調整 category 仍須符合現有 CMS validation 與 release manifest contract。

Validation 必須拒絕空 name、遺漏 image 或遺漏 category。Runtime class、canvas、anchor 與 spec version 必須能對應 `public/imagegen/asset-spec.json`；實際檔案與 class 另記錄於 `public/imagegen/asset-manifest.json`。

## Scene 與 orientation layout 編輯

Administrator 以結構化欄位編輯 scene 與 scene variants，不把所有內容 flatten 成單一 café image。每個 scene 可編輯：

- Landscape 與 portrait layout，以及各自的 world dimensions。
- Movement bounds、camera data 與 normalized placements。
- Ordered scene layers、entity depth 與 spawn points。
- 每個背景、家具、appliance、display、tray、pastry、wall art 與 floor asset 的 asset id、anchor、placement、scale 與 z-index。

Landscape 與 portrait 可以重用相同 asset，但 placement 與 scale 可分開設定。預期可獨立替換的 container 與內容必須使用分開的 asset 與 placement；例如 oven、cabinet、shelf、plate 或 tray 不得把可替換 pastry 烘在同一張 PNG。

## Characters、animals、items、actions 與 modal content

管理者可以在 release manifest 的內容範圍內編輯：

- Characters 與 animals 的 asset/entity id、placement、depth、behavior 或 animation loop。
- Items 的 asset/entity id、placement、可互動範圍與 nearby interaction。
- Typed actions、action targets、loop animations 與 interaction key。
- Weather mappings、weather effect 與 particle loop。
- 供 React 顯示的 modal payloads，包括 calendar schedule 與 current-week pastry menu。

Items 宣告 actions；Phaser 只發出離散 interaction event，React 負責 accessible modal。任何 modal payload、action target、spawn、weather 或 asset reference 失效，都必須在保存或發布前被指出，不得讓 dangling id 進入 released manifest。

## Weekly 與日期排程

所有排程以 `Asia/Taipei` 解讀。管理者可以建立 weekly schedule，以及單日或 inclusive date range 的 dated override，為指定期間選擇 effective scene/variant。

Resolver 順序固定為：

1. 較高 priority。
2. 較具體的 date/range。
3. 較晚的 release timestamp。

日期、時區、scene/variant reference 或 schedule state 不完整時，validation 必須拒絕儲存或發布；不可讓 client 自行猜測時區或有效版本。

## Draft preview

Draft authoring records 永遠不直接供 live client 使用。管理者需要能在不改變 active release 的前提下檢查 draft scene、orientation layout、characters、animals、items、weather、actions、modal payloads 與排程結果。

Draft preview 的日期解析必須使用 `Asia/Taipei`，並顯示所選日期會解析出的 scene/variant 與 release metadata。日期草稿預覽是平台計畫中的後續 milestone；本文件先固定隔離 active release 的 contract，不得把尚未交付的 UI 宣稱為完成。

## Validation、publish、activate 與 rollback

Validation 至少檢查：

- Asset 的 name、category、image、class、spec version 與檔案 reference。
- 所有 scene、layout、layer、entity、spawn 與 placement reference。
- Normalized coordinates、canvas、anchor、scale 與 z-index 的有效性。
- Sprite frame、grid 與 animation loop 的有效性。
- Action target、interaction、weather 與 modal payload reference。
- Schedule 的 `Asia/Taipei` date/range、priority 與有效 scene/variant。

Publish 先驗證完整內容，再建立 immutable release snapshot，最後變更 active release pointer。Activate 只能指向已驗證且已發布的 snapshot；既有 released snapshot 不得被 asset image、scene 欄位或內容編輯原地突變。

Rollback 只把 active pointer 改回既有 immutable snapshot，不修改舊 snapshot，也不覆寫已發布檔案。替換 released image 必須建立 versioned file；後續 publish 才能建立引用新 asset record 的新 snapshot。

## Admin access 與最小 audit metadata

`/admin` 僅供 authenticated administrator 使用。新 database 建立第一位 administrator 時，使用受保護的一次性 `GOODY_BOOTSTRAP_SECRET`；建立後立即移除部署環境中的 secret，後續 user creation 需要 authenticated admin。

每個重要管理動作保留最小 audit metadata：actor administrator id、action、target type/id、timestamp，以及相關的 release/version（若動作涉及 release）。Audit metadata 用於追蹤 asset、content、schedule、publish、activate 與 rollback，不延伸成未定義的審批流程。

## 後續 milestone 與本文件範圍外

下列項目已在 [`GOODY-2D-PLATFORM.md`](GOODY-2D-PLATFORM.md) 標為後續 milestone 或目前 scope 外；本文件不提前設計其 schema 或 UI：

- Visual CMS drag-and-drop editing。
- Aseprite atlas validation、automatic atlas packing。
- Tiled `.tsj` ingestion、resolution 與 inlining。
- S3/R2 storage adapter、immutable release artifact upload 與 production publishing。
- Live push/SSE 更新。
- 以核准素材取代 placeholder graphics，以及付費 Workers environment 的部署驗證。

## 驗收條件

- 可建立含 image、name、category 的 asset。
- 可重新讀取已重新命名 asset 的新 name。
- 可修改 category，並在新 category 篩選到該 asset。
- 可替換 image 並看到新 preview。
- 缺少 image、name 或 category 時拒絕 record。
- 可編輯 landscape/portrait scene layout 與 normalized placements，且 container 與 replaceable content 分離。
- 可編輯 characters、animals、items、actions、weather 與 React modal payloads，並拒絕 dangling references。
- 可用 `Asia/Taipei` weekly/date schedule 解析 effective scene/variant。
- Draft preview 不改變 active release。
- Publish/activate 產生 immutable snapshot；rollback 只切換 pointer。
- 已發布 snapshot 仍指向原始 versioned asset。
- 未登入或非 administrator 不可使用 admin 管理操作，且重要動作留下最小 audit metadata。
