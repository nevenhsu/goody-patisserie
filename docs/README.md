# Goody 文件導覽

本文件是 Goody 專案唯一的文件入口。先依工作類型閱讀下列文件，再修改對應的規格、內容或實作；不要把架構決策、資產尺寸或 CMS 行為只留在聊天紀錄。

## 文件角色

| 工作 | 應閱讀或更新的文件 |
| --- | --- |
| 架構、runtime、scene、內容替換、互動、排程與 release contract | [`GOODY-2D-PLATFORM.md`](GOODY-2D-PLATFORM.md) |
| runtime image class、canvas、anchor 與版本規則 | [`GOODY-ASSET-CLASSES.md`](GOODY-ASSET-CLASSES.md)；尺寸機器來源是 `public/imagegen/asset-spec.json` |
| 8-bit 素材生成、處理、命名與交付 | [`GOODY-8BIT-ART-WORKFLOW.md`](GOODY-8BIT-ART-WORKFLOW.md) |
| CMS asset library、場景與內容編輯、草稿、驗證、發布及管理權限 | [`GOODY-ADMIN-ASSET-MANAGEMENT.md`](GOODY-ADMIN-ASSET-MANAGEMENT.md) |

## 來源優先序

1. `public/imagegen/asset-spec.json` 是 asset class 的 machine source of truth，包含 canvas、frame、grid、anchor 與可選的 tile 設定。
2. `public/imagegen/asset-manifest.json` 記錄實際檔案、class、spec version、anchor 與交付 metadata。
3. 已發布且 immutable 的 Payload runtime manifest 是 live client 的 runtime source of truth；draft authoring record 不得直接供 live client 使用。
4. [`GOODY-2D-PLATFORM.md`](GOODY-2D-PLATFORM.md) 定義跨 session 的產品、runtime、互動、排程與 release contract。
5. [`GOODY-ASSET-CLASSES.md`](GOODY-ASSET-CLASSES.md) 是 `asset-spec.json` 的人類可讀對照；workflow 與 admin 文件分別定義素材交付與 CMS 操作。

若 machine source、released manifest 與人類文件不一致，先停止發布，依上述優先序修正並完成驗證；不可用文件內容猜測尺寸或 runtime 行為。

## 跨文件更新規則

- 修改產品或 runtime contract，先更新 [`GOODY-2D-PLATFORM.md`](GOODY-2D-PLATFORM.md)，再同步受影響的 admin、asset class 或 art workflow 文件，以及程式中的 schema、validator、manifest 與測試。
- 修改 canvas、frame、grid 或 anchor，必須先更新 `asset-spec.json` 的 schema version，再遷移每個受影響的 runtime manifest entry；同步更新 [`GOODY-ASSET-CLASSES.md`](GOODY-ASSET-CLASSES.md)。
- 新增或重新生成素材，依 [`GOODY-8BIT-ART-WORKFLOW.md`](GOODY-8BIT-ART-WORKFLOW.md) 處理，並同步 `asset-manifest.json`；不得覆寫已發布檔案。
- 修改 CMS 可編輯欄位、權限、草稿預覽、排程或 release 行為，同步 [`GOODY-ADMIN-ASSET-MANAGEMENT.md`](GOODY-ADMIN-ASSET-MANAGEMENT.md) 與平台 contract；若屬後續里程碑，明確標示，不得宣稱已完成。
- 每次文件更新後，檢查相對連結、技術識別字與路徑是否仍正確；Markdown 主文使用繁體中文，命令、路徑、route、type、schema、class、field 與產品名稱保留原文。
