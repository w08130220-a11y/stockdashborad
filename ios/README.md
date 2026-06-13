# Blip — iOS (SwiftUI 原生版)

這是 Blip 的**原生 iOS App**（SwiftUI，非 web 包殼）。畫面與互動全部用 SwiftUI 寫，
透過 HTTP 連到專案根目錄那套 Express + tRPC 後端。

## 需求
- Xcode 15+（iOS 16.0 以上）
- [XcodeGen](https://github.com/yonyz/XcodeGen)（用 yaml 產生 `.xcodeproj`，保證專案檔正確）
  ```bash
  brew install xcodegen
  ```

## 產生並開啟專案
```bash
cd ios
xcodegen generate     # 依 project.yml 產生 Blip.xcodeproj
open Blip.xcodeproj
```
> 若不想用 XcodeGen：在 Xcode 新建一個 iOS App 專案，把 `Blip/` 底下的 Swift 檔
> 全部加入 target，並套用 `Blip/Resources/Info.plist` 的權限說明即可。

## 連到後端
1. 先在專案根目錄啟動後端（需要 MySQL）：
   ```bash
   pnpm dev        # http://localhost:3000
   ```
2. 設定 App 連線位址 `ios/Blip/Networking/Config.swift`：
   - **模擬器**：保持 `http://localhost:3000`
   - **實機**：改成你 Mac 的區網 IP，例如 `http://192.168.0.10:3000`
     （手機要和電腦同一個 Wi-Fi）

開發階段已在 `Info.plist` 開了 `NSAllowsLocalNetworking`，可連 http。
正式上線時把 `baseURL` 換成 https 網域即可。

## 結構
```
ios/Blip/
├── App/            BlipApp(進入點) / RootView / AppState
├── Networking/     TRPCClient(超薄 tRPC client) / API / Models / MediaPrep / Config
├── Location/       LocationManager (CoreLocation, 取得 3km 過濾用座標)
├── Theme/          顏色、漸層、表情常數（美式風格）
└── Views/
    ├── OnboardingView      建立個人介面
    ├── MainTabView         底部導航 + 中央發佈鈕
    ├── NearbyView          附近 3 公里動態
    ├── FollowingView       追蹤中（不受距離）
    ├── RadarView           雷達熱點
    ├── ProfileView         我的個人頁（可編輯）
    ├── UserProfileView     他人個人頁（追蹤入口）
    ├── CreatePostView      發佈照片 / 10 秒影片
    └── Components/         PostCard / ReactionBar / Countdown / Avatar / FeedList
```

## 功能對應
- 附近 3 公里：`LocationManager` 取得座標 → `post.nearby` 後端用 Haversine 過濾
- 24 小時消失：每則貼文顯示 `CountdownView`，後端排程到期銷毀
- 只能相遇後追蹤：`UserProfileView` 只有 `canFollow` 才顯示追蹤鈕，無任何搜尋入口
- 10 秒影片：`CreatePostView` 用 `AVURLAsset` 量測長度，超過 10 秒擋下
- 個人專屬介面：`OnboardingView` 自訂暱稱 / 頭像 / 主題色
- 一鍵表情、雷達、Streak、保存回憶：皆已實作

## 認證
目前後端為開發模式自動登入，iOS 端用 `URLSession` 共享 Cookie 自動維持 session。
之後要接真正登入（Sign in with Apple / OAuth）時，在 `TRPCClient` 加上帶 token 的 header 即可。

> 註：此原生專案在 macOS + Xcode 上建置；在非 macOS 環境（如本 CI 容器）無法編譯
> SwiftUI/UIKit，因此尚未在此環境跑過 build，請在 Xcode 開啟後建置執行。
