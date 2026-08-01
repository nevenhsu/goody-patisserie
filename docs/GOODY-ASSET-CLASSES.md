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
| `scene-portrait` | 1086x1448 | center | 舊版全視窗直向背景 class；不代表目前 portrait world 高度 |
| `scene-portrait-ceiling-backwall` | 1086x809 | center | 手機版天花板、teal crown band 與中央紅牆 structural layer |
| `scene-portrait-side-wall` | 99x930 | center | v1 手機單側牆 delivery class；保留 immutable history |
| `scene-portrait-floor` | 1086x349 | center | v1 手機地板 delivery class；保留 immutable history |
| `scene-portrait-side-wall-v2` | 99x998 | center | v2 手機單側牆 delivery class；保留 immutable history |
| `scene-portrait-floor-v2` | 1086x1251 | center | v2 手機地板 delivery class；保留 immutable history |
| `scene-portrait-ceiling-v2` | 1170x252 | center | 目前 390x844 ceiling，runtime scale 1/3 |
| `scene-portrait-backwall-v2` | 918x1467 | center | 目前 390x844 backwall，runtime scale 1/3 |
| `scene-portrait-side-wall-v3` | 165x1770 | center | v3 手機單側牆 delivery class；保留 immutable history，不是目前 runtime source |
| `scene-portrait-floor-v3` | 1170x843 | center | v3 手機地板 delivery class；保留 immutable history，不是目前 runtime source |
| `wall-panel` | 512x1024 | bottom-center | 左、中或右牆模組 |
| `appliance-tall` | 384x704 | bottom-center | Refrigerator 或 oven |
| `appliance-portrait-fridge` | 215x364 | center | 手機版窄長 refrigerator |
| `appliance-portrait-oven` | 150x450 | center | 手機版窄長 double-deck oven |
| `counter-base` | 1536x384 | bottom-center | 櫃檯／桌體 |
| `counter-top` | 1536x192 | bottom-center | 櫃檯檯面 |
| `counter-base-portrait` | 980x301 | center | 手機版 teal counter base 與紅色右端板 |
| `counter-top-portrait` | 948x83 | center | 手機版獨立 cream countertop slab |
| `counter-base-portrait-v2` | 978x486 | center | v2 手機 counter base delivery class；保留 immutable history |
| `counter-top-portrait-v2` | 1014x132 | center | v2 手機 counter top delivery class；保留 immutable history |
| `counter-base-portrait-v3` | 978x486 | center | 目前 390x844 counter base，runtime scale 1/3；logical bbox x32/y495/w326/h162 |
| `counter-top-portrait-v3` | 1014x132 | center | 目前 390x844 counter top，runtime scale 1/3；logical bbox x26/y463/w338/h44 |
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
| `item-wall-portrait-fixture` | 417x360 | center | 手機版窄長 hanging ceiling fixture |
| `item-portrait-curtain` | 300x452 | center | 手機版獨立 teal oven curtain set |
| `item-floor` | 384x512 | bottom-center | Menu board 與地面物件 |
| `weather-particle` | 64x64 | center | 重複播放的 weather particle |

修改任何 canvas、frame、grid 或 anchor，都必須建立新的 `public/imagegen/asset-spec.json` schema version，並遷移每個受影響的 runtime manifest entry。不得只在原地調整單一已發布 asset 的尺寸。

Landscape 左右側牆本體仍使用 canonical wall texture 與 runtime Mesh2D/projective clip。上述 `side-prop-*` 只用於已烘焙 fake3D 的牆上 props，placement 不得再套 projection。

Portrait ceiling/backwall 與 appliance layers 仍使用獨立 mobile assets。Side wall 與 floor 改用 fully opaque canonical `scene-projective-wall`/`scene-projective-floor-16x8` textures，於 runtime 以 portrait-only projective clip profiles 投影；v3 mobile side-wall/floor entries 只保留 immutable delivery history。Counter 使用 schema v9 的 v3 classes，runtime scale 為 `1/3`；v1/v2 counter entries 保留 history。冰箱、烤箱、門簾、counter base/top 與所有可替換內容仍各自獨立。
