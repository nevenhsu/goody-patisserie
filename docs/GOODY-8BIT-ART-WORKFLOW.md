# Goody 8-Bit Art Workflow

每次新增或重新生成 runtime image 都依下列 workflow：

1. Prompt 前先檢查這些 reference：
   - `public/goody-cafe-backdrop.png`
   - `public/goody-cafe-backdrop-mobile.png`
   - `public/og.png`
2. 若 `goody-8bit-art` skill 可用，先讀完其完整 `SKILL.md` 並遵循；若不可用，明確說明，再使用 global `imagegen` skill 搭配 reference images。不得宣稱使用不存在的 skill。
3. 維持既有風格：textured 16-bit/8-bit pixel art、stepped pixel edges、dark auburn outlines、warm hand-shaded highlights、deep teal、cream、dark red、warm wood 與 brass。不可改成 flat vector art、CSS-drawn scenery、smooth anime art 或 generic game assets。
4. 將 reference images 視為 style inputs，保持原檔不變。
5. 每張 runtime image 放在 `public/imagegen/`。Runtime manifests 只能使用 `/imagegen/...` URLs；除非另有 storage adapter 需求，不得加入 S3/R2 asset URLs。
6. 生成前檢查 `public/imagegen/asset-spec.json` 與 [`GOODY-ASSET-CLASSES.md`](GOODY-ASSET-CLASSES.md)。每個 asset 都必須指定已註冊的 class 與 spec version，不得發明 one-off dimensions。
7. Generated source size 不是 delivery size。移除 chroma key、妥善 trimming、以不變形方式 scaling，再放到 exact registered canvas；保留 transparent padding 與 anchor position。
8. 使用 versioned filenames：`goody-<class>-<name>-v<number>.png`。永不覆寫已發布 asset。
9. 在 `public/imagegen/asset-manifest.json` 記錄 file path、class、canvas size、anchor 與 intended display size。
10. 檢查最終 alpha 與 pixel edges。完成 visual work 前，使用真實 browser 驗證 desktop 與 portrait runtime screenshots。
