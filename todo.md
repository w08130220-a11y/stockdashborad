# Stock Dashboard TODO

## 後端 / API
- [x] 安裝 yfinance Python 套件並建立 Flask 微服務
- [x] 建立 yfinance API 端點（批次股價、Beta、技術指標）
- [x] 建立 tRPC 路由：股票報價、持股 CRUD、觀察清單 CRUD
- [x] 建立 tRPC 路由：現金流 CRUD、停利設定 CRUD
- [x] 資料庫 Schema：holdings、watchlist、cashflows、trailing_stops

## 資料庫
- [x] 設計並推送 drizzle schema（holdings、watchlist、cashflows、trailing_stops）
- [x] 建立 db.ts 查詢 helpers

## 前端框架
- [x] 設定奶油色日間模式 + 深色夜間模式 CSS 變數
- [x] 建立 Tab 導航（總覽/停利/現金流/觀察清單）
- [x] 日夜模式切換按鈕
- [x] RWD 響應式基礎設定（Grid + Flexbox）

## 功能頁面
- [x] 總覽頁面（持股列表、即時股價、漲跌幅、市值分布、Beta 波動分類、Sparkline）
- [x] 移動停利頁面（Trailing Stop 計算、52W 高點、停利線、觸發標記、自定義回撤%）
- [x] 績效現金流頁面（統計卡片、月度長條圖、Excel 上傳、持股績效排名）
- [x] 觀察清單頁面（新增股票、買賣訊號、技術指標、RSI/MA50/MA200）

## 測試
- [x] 後端 API 單元測試（auth.logout、trailingStop、cashflow、holdings）
- [x] tRPC 路由測試

## Bug 修復
- [x] 修復 React 列表重複 key 錯誤（AAPL 重複 symbol key）
- [x] 防止資料庫中存入重複持股（upsert by symbol）
- [x] 清理資料庫中現有的重複持股記錄

## 新功能（v1.3）
- [x] Beta 計算記憶體快取（Flask TTL 快取，Beta/Vol/Sparkline 1小時，股價 30秒）
- [x] 觀察清單訊號 Tooltip 說明（顯示觸發訊號的具體指標）
- [x] 持股批次匯入 CSV/Excel（支援代號、股數、均價、板塊欄位）

## 新功能（v1.4）
- [x] 價格警報通知（設定目標價上下限，觸及時 notifyOwner 推送，觀察清單與停利頁面整合）
- [x] 持股 Inline 編輯（點擊股數/均價儲格直接修改，Enter 確認，Esc 取消）

## Bug 修復（v1.4.1）
- [x] 修復發布環境 OAuth 登入 HTTP 500：yfinance Python 服務在無 Python 環境時優雅降級

## 新功能（v2.0 - 台美股分離 + i18n）
- [x] i18n 多語系框架（繁體中文 / English 切換）
- [x] 後端台股支援（.TW/.TWO 代號、TWD 幣值欄位）
- [x] 資料庫 holdings/watchlist 新增 market 和 currency 欄位
- [x] 前端台美股分離顯示（Sub-Tab 切換台股/美股）
- [x] 幣值符號區分（NT$ / $）、匯率換算總覽
- [x] 語系切換 UI（Header 按鈕）
- [x] 所有頁面文字翻譯（總覽、停利、現金流、觀察清單）
- [x] detectMarket 支援純數字台股代號（2330、6013、00878）

## Bug 修復（v2.0.1）
- [x] 修復發布環境 OAuth 登入後重複跳轉無法進入的問題
  - Express 加入 trust proxy 讓 req.protocol 正確反映 HTTPS
  - cookies.ts 非 localhost 強制 secure=true（SameSite=None 必要條件）
  - oauth.ts 使用 state 中的 origin 做 redirect
  - yfetch timeout 從 30s 降至 15s 避免 gateway 逾時 502

## 新功能（v3.0 - 即時股價 API 對接）
- [x] 用 Manus Data API (YahooFinance) 替代 Python yfinance 微服務
- [x] 後端 stockService.ts：封裝 callDataApi 查詢，支援台股和美股
- [x] 台股中文名稱自動對應（從 API longName 取得 + 本地映射表 200+ 台股）
- [x] 台股板塊分類自動對應（建立台股代號→板塊映射表，含半導體/電子/金融/航運/ETF等）
- [x] 後端記憶體快取（價格 30 秒、歷史數據 1 小時）+ Rate limit 保護
- [x] 計算 Beta、RSI、MA50、MA200、Sparkline（純 Node.js 實作）
- [x] 前端自動從 API 取得即時價格（不再需要手動填寫）
- [x] 新增持股時自動查詢股票名稱和板塊
- [x] 更新單元測試（14 項全部通過）
- [x] 美股板塊映射（Technology/Healthcare/Financial Services 等 30+ 常見美股）
- [x] 資料庫台股代號修復（自動加 .TW 後綴、修正 market/currency）
- [x] API Rate Limit 保護（配額耗盡時暫停 60 秒、負面快取避免重複請求）

## 新功能（v4.0 — 訂閱制 + APP 預留）
- [x] 訂閱方案定義（shared/plans.ts）：Free / Pro / Premium 三級
- [x] LAUNCH_MODE 開關：true = 全員免費享有 Pro 功能
- [x] 資料庫 subscriptions + payment_history 表
- [x] 後端 subscriptionRouter.ts：方案查詢、Checkout、取消、恢復、管理員手動設定
- [x] 前端 SubscriptionContext：方案狀態、功能門檻 hook
- [x] Paywall 彈窗元件：方案比較卡片 + 功能表 + 升級按鈕
- [x] 功能門檻接入 Home.tsx：新增持股/觀察/警報/停利/匯入
- [x] i18n 訂閱翻譯（zh-TW + en）
- [x] Header Launch Mode 免費體驗徽章
- [x] Webhook 佔位符（server/webhooks.ts）：Stripe / Apple IAP / Google Play Billing
- [x] PWA manifest + mobile meta tags
- [x] 平台偵測 platform.ts（web/pwa/ios/android）
- [x] Capacitor 架構預留

## 待辦（收費上線時）
- [ ] 串接 Stripe：填入 STRIPE_SECRET_KEY + Price IDs，實作 webhook handler
- [ ] 把 LAUNCH_MODE 改成 false
- [ ] APP 版：安裝 Capacitor，接入 RevenueCat 統一管理 Apple/Google 訂閱
- [ ] AI 分析功能（Premium 專屬）
- [ ] PDF 報告匯出（Premium 專屬）
