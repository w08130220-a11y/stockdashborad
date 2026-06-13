# Blip — 後端 API (Express + tRPC)

Blip 的後端，從原本的 monorepo 拆分出來。

- API 路由 / 伺服器：`server/`
- 資料庫 schema + migration：`drizzle/`
- 前後端共用型別／工具：`shared/`

## 需求
- Node.js ≥ 18、pnpm ≥ 10、MySQL ≥ 8

## 開發 / 啟動
```bash
pnpm install
cp .env.example .env   # 設定 DATABASE_URL / JWT_SECRET 等
pnpm db:push           # 建立資料表
pnpm start             # 正式模式啟動 API（建議）
# 或
pnpm dev               # 開發模式
```

環境變數：
```env
DATABASE_URL=mysql://user:pass@localhost:3306/blip
JWT_SECRET=your-secret-key
VITE_APP_ID=blip
OWNER_OPEN_ID=local-owner
```

## 注意（monorepo 拆分後的小調整）
原本後端在 **開發模式** 會透過 Vite middleware 一起服務網頁前端。拆成純 API 後，
前端在另一個 repo（**blipweb**），所以：

- **建議用 `pnpm start`（production 模式）跑 API**，純提供 `/api/trpc`。
- 若要用 `pnpm dev`，請把 `server/_core/index.ts` 裡開發模式那段
  `await setupVite(app, server)` 改成只跑 API（移除或改成 `serveStatic` 的 no-op），
  因為這個 repo 不含前端檔案。

媒體檔（限時圖片／影片）會存到 `uploads/`，並由排程每 5 分鐘清掉過期內容。
