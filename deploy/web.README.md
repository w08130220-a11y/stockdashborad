# Blip — Web 前端 (React + Vite)

Blip 的網頁前端，從原本的 monorepo 拆分出來。

- 介面與元件：`client/`
- 前後端共用型別／工具：`shared/`

## 開發
```bash
pnpm install
pnpm dev          # 啟動 Vite 開發伺服器
```

> 這個前端會呼叫後端 API（tRPC，路徑 `/api/trpc`）。後端在另一個 repo：
> **blip-api**（https://github.com/w08130220-a11y/blip-api）。
> 本機開發時，請讓後端跑在 `http://localhost:3000`，或在 `vite.config.ts` 加
> `server.proxy` 把 `/api` 轉到後端位址；正式部署時把前端打包後交給後端 `serveStatic`
> 或獨立部署並設定 API base URL。

## 建置
```bash
pnpm build        # 產出 dist/public
```
