# 📍 Blip

只跟**附近 3 公里**的人，用 **24 小時就消失**的照片與 10 秒影片交流的社群 App。
找不到搜尋框 —— 唯一認識新朋友的方式，是在附近遇到對方的分享。

> **iOS 原生版**在 [`ios/`](./ios)（SwiftUI，非 web 包殼）。本資料夾的 Express + tRPC
> 後端同時供 iOS App 連線；啟動 `pnpm dev` 後依 `ios/README.md` 用 Xcode 開啟即可。

## ✨ 功能

- **限時分享** — 照片或最長 10 秒的影片，發佈滿 24 小時自動銷毀
- **附近 3 公里** — 只看得到自己周圍 3 公里內的分享（用裝置定位 + Haversine 過濾）
- **追蹤不受距離限制** — 追蹤過的人，跑到 3 公里外也能在「追蹤中」看到
- **相遇才能追蹤** — 只有在附近看過對方的分享後才會出現追蹤按鈕，**不能用搜尋追蹤**
- **個人專屬介面** — 自訂頭像、暱稱、自我介紹與主題色
- **一鍵表情回應** — 🔥❤️😂👀😮💯，取代留言、輕鬆不易吵架
- **消失倒數** — 每則分享顯示距離銷毀的剩餘時間
- **雷達** — 用雷達圖呈現附近正在分享的熱點
- **連續分享 Streak** — 每天分享累積 🔥 天數
- **保存自己的回憶** — 消失前可把自己的貼文保存到本人封存頁

> 設計走美式社群風格：大膽粗體字、鮮豔漸層、全螢幕卡片。

## 🏗️ 技術架構

```
┌─────────────────────────┐
│  React + TypeScript     │  ← 前端 (Vite + Tailwind + shadcn/ui)
│  tRPC Client            │
└──────────┬──────────────┘
           │ tRPC
┌──────────▼──────────────┐
│  Express + tRPC Server  │  ← 後端 (Node.js)
│  Drizzle ORM            │
│  本機磁碟媒體儲存 + 排程  │  ← /uploads，24h 自動銷毀
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│  MySQL 8.0              │  ← 資料庫
└─────────────────────────┘
```

## 🚀 快速開始

### 必要條件

- Node.js ≥ 18
- pnpm ≥ 10
- MySQL ≥ 8.0（或 Docker）

### 一鍵安裝

```bash
chmod +x setup-local.sh
./setup-local.sh
```

腳本會：安裝依賴、建立 `.env`、用 Docker 起 MySQL、執行 `pnpm db:push` 建表。

### 啟動

```bash
pnpm dev
```

瀏覽器打開 **http://localhost:3000**，允許定位權限即可看到附近的分享。

> 開發環境自動登入，第一次進入會引導你建立個人介面。

## 📁 專案結構

```
├── client/src/
│   ├── pages/
│   │   ├── Home.tsx        # 主畫面（附近 / 追蹤 / 雷達 / 我）
│   │   ├── CreatePost.tsx  # 發佈圖片 / 10 秒影片
│   │   └── UserProfile.tsx # 別人的個人頁（追蹤入口）
│   ├── components/
│   │   ├── Onboarding.tsx  # 建立個人介面
│   │   ├── PostCard.tsx    # 貼文卡片
│   │   ├── ReactionBar.tsx # 一鍵表情回應
│   │   ├── Countdown.tsx   # 消失倒數
│   │   └── BottomNav.tsx   # 底部導航
│   ├── hooks/useGeolocation.ts
│   └── lib/media.ts        # 圖片壓縮、影片長度量測
├── server/
│   ├── routers.ts          # tRPC API（profile / post / follow）
│   ├── db.ts               # Drizzle 資料庫操作
│   ├── media.ts            # 本機磁碟媒體儲存
│   └── scheduler.ts        # 24 小時自動銷毀排程
├── shared/geo.ts           # Haversine 距離 / bounding box（前後端共用）
└── drizzle/schema.ts       # users / profiles / posts / reactions / encounters / follows
```

## ⚙️ 環境變數

```env
DATABASE_URL=mysql://user:pass@localhost:3306/blip
JWT_SECRET=your-secret-key
VITE_APP_ID=blip
OWNER_OPEN_ID=local-owner
```

## 📝 License

MIT
