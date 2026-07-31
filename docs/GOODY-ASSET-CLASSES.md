# Goody Runtime Asset Classes

本文件是 runtime image class 的人類可讀 reference。`public/imagegen/asset-spec.json` 是 machine-readable source of truth。

建立或重新生成檔案時，遵循 [`GOODY-8BIT-ART-WORKFLOW.md`](GOODY-8BIT-ART-WORKFLOW.md)。

| Class | Canvas | Anchor | Purpose |
| --- | --- | --- | --- |
| `scene-landscape` | 1536x1024 | center | 全視窗橫向背景 |
| `scene-landscape-layer` | 1536x1024 | center | 透明、full-canvas、可獨立替換的 landscape structural layer |
| `scene-projective-wall` | 384x1024 | center | 正視牆面／壁板材質；由 guided wall profile 投影 |
| `scene-projective-floor` | 1536x512 | center | 正視地板材質；由 floor mesh 投影 |
| `scene-projective-floor-16x8` | 1536x512 | center | 16x8 正視地板；96x64 pitch、4px grout，由 floor mesh 投影 |
| `scene-portrait` | 1086x1448 | center | 全視窗直向背景 |
| `wall-panel` | 512x1024 | bottom-center | 左、中或右牆模組 |
| `appliance-tall` | 384x704 | bottom-center | Refrigerator 或 oven |
| `counter-base` | 1536x384 | bottom-center | 櫃檯／桌體 |
| `counter-top` | 1536x192 | bottom-center | 櫃檯檯面 |
| `counter-display` | 512x384 | bottom-center | Pastry 展示與桌面群組 |
| `tray-wide` | 512x256 | bottom-center | 空的烘焙／展示托盤 |
| `pastry-small` | 192x192 | bottom-center | 單一可替換 pastry |
| `pastry-display-256` | 256x256 | 0.5, 0.859375 | 桌機展示架 pastry；水平置中、共同接觸基準 y=220 |
| `wall-art` | 256x320 | center | Tokyo／Melbourne 相框藝術 |
| `floor-tile` | 512x512 | center | 可重複鋪設的地面表面 |
| `character-static` | 512x768 | bottom-center | 單一全身角色 |
| `character-sheet-4x2-8` | 2048x1536 | per-frame bottom-center | 4x2、8-frame sprite sheet；每格 512x768 |
| `character-sheet-4x4` | 1024x1536 | per-frame bottom-center | 4x4 sprite sheet；每格 256x384 |
| `animal-static` | 512x384 | bottom-center | 單一動物 |
| `animal-sheet-4x2-8` | 2048x768 | per-frame bottom-center | 4x2、8-frame sprite sheet；每格 512x384 |
| `side-prop-pan-pair-perspective` | 220x300 | 0.5, 0.54 | 已烘焙左牆透視的 pan pair；以普通 image 顯示 |
| `side-prop-utensil-rail-perspective` | 260x250 | 0.5, 0.56 | 已烘焙左牆透視的 utensil rail 與工具；以普通 image 顯示 |
| `side-prop-magnetic-knife-rack-perspective` | 220x170 | 0.5, 0.3411764706 | 已烘焙左牆透視的磁吸刀架；刀條左低右高、三把刀保持垂直，以普通 image 顯示 |
| `side-prop-frame-perspective` | 160x200 | center | 已烘焙右牆方向的 Tokyo／Melbourne 相框；以普通 image 顯示 |
| `side-prop-plant-shelf-perspective` | 300x280 | 0.5, 0.86 | 已烘焙右牆透視的 plant+shelf；以普通 image 顯示 |
| `item-wall` | 384x448 | center | Calendar 與牆面物件 |
| `item-floor` | 384x512 | bottom-center | Menu board 與地面物件 |
| `weather-particle` | 64x64 | center | 重複播放的 weather particle |

修改任何 canvas、frame、grid 或 anchor，都必須建立新的 `public/imagegen/asset-spec.json` schema version，並遷移每個受影響的 runtime manifest entry。不得只在原地調整單一已發布 asset 的尺寸。

Landscape 左右側牆本體仍使用 canonical wall texture 與 runtime Mesh2D/projective clip。上述 `side-prop-*` 只用於已烘焙 fake3D 的牆上 props，placement 不得再套 projection。
