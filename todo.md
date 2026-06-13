# Blip TODO — 附近限時社群

## ✅ 已完成（MVP）

### 後端
- [x] 移除原股票相關程式（stockService / 訂閱 / yfinance）
- [x] 資料庫 schema：users / profiles / posts / reactions / encounters / follows
- [x] db.ts 查詢 helpers（profile、post、reaction、encounter、follow）
- [x] 媒體儲存模組 media.ts（base64 → 本機磁碟，含大小限制）
- [x] tRPC 路由 profile：me / get / save / checkUsername
- [x] tRPC 路由 post：create / nearby / following / mine / react / unreact / save / delete
- [x] tRPC 路由 follow：follow / unfollow（必須相遇過才能追蹤）
- [x] 附近 3 公里過濾（bounding box 粗篩 + Haversine 精算）
- [x] 24 小時自動銷毀排程（scheduler.ts，每 5 分鐘清理，刪檔）
- [x] 相遇紀錄：載入附近動態即記錄 encounter → 解鎖追蹤
- [x] /uploads 靜態服務

### 前端
- [x] 美式風格主題（bold / vibrant，深色預設）
- [x] Onboarding 建立個人介面（暱稱、頭像、主題色）
- [x] 底部導航 + 中央發佈按鈕
- [x] 附近動態（定位 + 3 公里）
- [x] 追蹤中動態（不受距離限制）
- [x] 雷達視圖（附近熱點）
- [x] 個人頁（自己 + 編輯）與他人頁（追蹤入口）
- [x] 發佈圖片 / 10 秒影片（含影片長度驗證、圖片壓縮）
- [x] 一鍵表情回應、消失倒數、連續 Streak、保存回憶
- [x] TypeScript 通過、production build 通過、伺服器啟動冒煙測試通過

## 🔜 之後可以做
- [ ] 真實 OAuth 登入（目前開發環境自動登入）
- [ ] 影片伺服器端轉碼 / 縮圖（目前直接存原檔）
- [ ] 媒體改存雲端物件儲存（S3 / R2），搭配 CDN
- [ ] 推播通知（有人對你的分享回應 / 附近有新分享）
- [ ] 限定追蹤好友的限時私訊（DM）
- [ ] 檢舉 / 封鎖與內容審核
- [ ] 單元測試（geo 距離、24h 銷毀、相遇→追蹤權限）
