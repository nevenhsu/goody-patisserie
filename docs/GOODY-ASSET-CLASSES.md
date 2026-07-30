# Goody Runtime Asset Classes

本文件是 runtime image class 的人類可讀 reference。`public/imagegen/asset-spec.json` 是 machine-readable source of truth。

建立或重新生成檔案時，遵循 [`GOODY-8BIT-ART-WORKFLOW.md`](GOODY-8BIT-ART-WORKFLOW.md)。

| Class | Canvas | Anchor | Purpose |
| --- | --- | --- | --- |
| `scene-landscape` | 1536x1024 | center | 全視窗橫向背景 |
| `scene-portrait` | 1086x1448 | center | 全視窗直向背景 |
| `wall-panel` | 512x1024 | bottom-center | 左、中或右牆模組 |
| `appliance-tall` | 384x704 | bottom-center | Refrigerator 或 oven |
| `counter-base` | 1536x384 | bottom-center | 櫃檯／桌體 |
| `counter-top` | 1536x192 | bottom-center | 櫃檯檯面 |
| `counter-display` | 512x384 | bottom-center | Pastry 展示與桌面群組 |
| `tray-wide` | 512x256 | bottom-center | 空的烘焙／展示托盤 |
| `pastry-small` | 192x192 | bottom-center | 單一可替換 pastry |
| `wall-art` | 256x320 | center | Tokyo／Melbourne 相框藝術 |
| `floor-tile` | 512x512 | center | 可重複鋪設的地面表面 |
| `character-static` | 512x768 | bottom-center | 單一全身角色 |
| `character-sheet-4x4` | 1024x1536 | per-frame bottom-center | 4x4 sprite sheet；每格 256x384 |
| `animal-static` | 512x384 | bottom-center | 單一動物 |
| `item-wall` | 384x448 | center | Calendar 與牆面物件 |
| `item-floor` | 384x512 | bottom-center | Menu board 與地面物件 |
| `weather-particle` | 64x64 | center | 重複播放的 weather particle |

修改任何 canvas、frame、grid 或 anchor，都必須建立新的 `public/imagegen/asset-spec.json` schema version，並遷移每個受影響的 runtime manifest entry。不得只在原地調整單一已發布 asset 的尺寸。
