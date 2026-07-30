# Goody 2D Scene Platform

Goody 是為 Goody Pâtisserie 打造的全視窗、持續循環 8-bit 遊戲風格網站，採用 Next.js App Router、Payload CMS、Phaser 4、Cloudflare D1/R2 與 OpenNext for Cloudflare。

React DOM 負責 SEO、導覽、長文內容、dialog、form 與 accessibility；Phaser 只負責互動 scene、角色、移動、collision、camera 與短暫的場景互動。

完整文件地圖、來源優先序與跨文件更新規則見 [`docs/README.md`](docs/README.md)。

## 本機開發

需求：

- Node.js `>=22.13.0`
- 本機 `.env.local`，其中 `PAYLOAD_SECRET` 與 `GOODY_BOOTSTRAP_SECRET` 必須是彼此獨立且強度足夠的值

```bash
npm install
npm run dev
```

可用 route：

- `/` — 全視窗 Goody live experience
- `/admin` — Payload admin
- `/api/runtime/bootstrap` — 版本化 runtime bootstrap fixture
- `/api/*` — Payload REST routes

## 驗證

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

`npm run preview` 會建置 OpenNext Worker 並啟動本機 Cloudflare preview。正式部署前，必須在 `wrangler.jsonc` 以正式的 D1 database id 與 R2 bucket 取代 placeholder。

全新 database 建立第一位 administrator 時，對 `/api/users` 發送 `POST` request，並在 `x-goody-bootstrap-secret` header 傳入一次性 secret。administrator 建立後，立即從部署環境移除 `GOODY_BOOTSTRAP_SECRET`；之後建立 user 必須先通過 authenticated admin。

`npm run deploy` 會先確認 Worker bundle 建置成功，再套用 database migration，最後發布完全相同的 bundle。每個 production migration 都要與目前已部署的 Worker 保持 backward-compatible，因為 migration 與 publish 無法包成單一 atomic transaction。

## 架構

- `payload.config.ts` 將 Payload 嵌入同一個 Next application。
- `src/collections/` 放置 assets、character parts 與 presets、scenes、variants、schedules、interactions、releases、media 與 admin users 的初始 content model。
- `src/domain/` 放置可測試的 schedule、asset、character、release 與 runtime modules；production I/O 由 adapters 注入。
- `src/game/` 放置 Phaser scene、離散 React↔Phaser bridge 與 bootstrap contract。
- `components/game/` 是僅供 client 使用的 Phaser seam。
- D1 儲存 Payload records 與 publishing metadata。
- R2 儲存 media；後續 milestone 也會存放 immutable Tiled maps、atlases 與 release artifacts。

Workers target 停用 GraphQL。Phaser 固定為 `4.2.0`，只在 client effect 中載入，因此不會進入 server bundle。

## 目前 milestone

目前 repository 已具備 production shell、初始 CMS schema、domain interfaces、版本化 static bootstrap，以及可用鍵盤／觸控移動並支援 accessibility notice/calendar dialog 的 Goody scene。

目前不宣稱完整 platform 已完成。後續 milestone：

1. 將 runtime bootstrap 連接至 active Payload release records。
2. 實作 atomic validate → publish → activate 與 rollback workflow。
3. 加入 Aseprite atlas validation，以及 Tiled `.tsj` 的 resolution/inlining。
4. 將 immutable release artifacts 上傳至 R2，並加入 draft date preview。
5. 以核准的 Goody pixel assets 取代專案自有 placeholder graphics。
6. 在已部署的付費 Workers environment 驗證 D1 migrations、R2 uploads、Worker bundle limits 與 publish-to-live 行為。

既有兩張 café raster 圖片目前只作為未使用的 art reference；重用或由其衍生 production assets 前，先確認其權利歸屬。
