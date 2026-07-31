# Goody 專案指引

所有架構、runtime、CMS、scene、asset 工作，先閱讀
[`docs/README.md`](docs/README.md)；該文件是唯一文件入口，並說明各文件角色與來源優先序。

## 研究工具

- 研究工作優先使用 browser 開啟 ChatGPT Pro 的 `8-bit website project`，把研究題目交給 GPT Pro 進行研究；採用研究結果前，仍須依本專案原始碼與文件驗證。

## Runtime 硬性規則

- `/` 提供唯一公開的全視窗、持續循環 8-bit 體驗；桌面與行動版都必須覆蓋視窗且不拉伸素材。
- 已發布 manifest 可替換 scene、角色、動物、物件、天氣與 action，不得把 demo asset id 寫死成完整 schema。
- 可點擊物件由內容宣告 action；Phaser 發出離散事件，React 負責可存取 modal。modal 開啟時停用 Phaser 輸入，關閉後恢復輸入與 focus。
- 需要獨立替換的 container 與內容必須分開；display cabinet、shelf、plate、tray、refrigerator、oven 不得把可替換 pastry 烘進同一張 PNG，每個 pastry 都是獨立 placement/spawn。
