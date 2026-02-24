#!/bin/bash
# ═══════════════════════════════════════════════════════
# 📦 Stock Dashboard v4 — 一鍵安裝腳本
# ═══════════════════════════════════════════════════════
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step() { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo " 📦 Stock Dashboard v4 — 本地安裝"
echo "═══════════════════════════════════════════════════════"

# ─── 1. 環境檢查 ───
step "檢查必要工具..."
command -v node >/dev/null 2>&1 || fail "找不到 Node.js (需要 ≥ 18): https://nodejs.org"
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || fail "Node.js 版本需 ≥ 18，目前: $(node -v)"
ok "Node.js $(node -v)"
command -v pnpm >/dev/null 2>&1 || { warn "pnpm 不存在，正在安裝..."; npm install -g pnpm; }
ok "pnpm $(pnpm -v)"
command -v python3 >/dev/null 2>&1 && ok "Python3 $(python3 --version 2>&1 | awk '{print $2}') (yfinance 備援可用)" || warn "Python3 未安裝 (yfinance 備援不可用，需使用 Twelve Data API)"

# ─── 2. 安裝 Node.js 依賴 ───
step "安裝 Node.js 依賴..."
pnpm install --no-frozen-lockfile 2>&1 | tail -5
ok "Node.js 依賴安裝完成"

# ─── 3. Python 虛擬環境 ───
step "建立 Python 虛擬環境 & 安裝 yfinance..."
[ -d "venv" ] || python3 -m venv venv
source venv/bin/activate 2>/dev/null || . venv/bin/activate
pip install -q flask flask-cors yfinance numpy pandas 2>&1 | tail -3
ok "Python 套件安裝完成"

# ─── 4. 建立 .env ───
step "建立 .env 設定檔..."
if [ -f ".env" ]; then
  warn ".env 已存在，跳過"
else
  cat > .env << 'ENVEOF'
# ─── Database ───
DATABASE_URL=mysql://dashboard:dashpass123@localhost:3306/stock_dashboard

# ─── Auth ───
JWT_SECRET=my-local-dev-secret-key-change-me
VITE_APP_ID=stock-dashboard
OWNER_OPEN_ID=local-owner

# ─── Stock Data: Twelve Data API (primary) ───
# Get your free API key: https://twelvedata.com/pricing
# Free = US stocks only (8 req/min)
# Pro ($99/mo) = Taiwan stocks + US stocks (610 req/min)
TWELVE_DATA_API_KEY=

# ─── Stock Data: yfinance fallback (optional) ───
YFINANCE_API_URL=http://localhost:5001
ENVEOF
  ok ".env 已建立"
  echo ""
  read -p "  輸入 Twelve Data API Key (或按 Enter 跳過使用 yfinance): " TD_KEY
  if [ -n "$TD_KEY" ]; then
    sed -i "s/^TWELVE_DATA_API_KEY=$/TWELVE_DATA_API_KEY=$TD_KEY/" .env
    ok "Twelve Data API Key 已設定"
  else
    warn "未設定 Twelve Data Key，將使用 yfinance 備援（需啟動 Python 服務）"
  fi
fi

# ─── 5. MySQL ───
step "設定 MySQL..."
echo "  [1] 用 Docker 自動建立 (推薦)"
echo "  [2] 使用現有的 MySQL"
echo "  [3] 跳過"
read -p "  選擇 [1/2/3]: " DB_CHOICE
case $DB_CHOICE in
  1)
    command -v docker >/dev/null 2>&1 || fail "Docker 未安裝"
    if docker ps -a --format '{{.Names}}' | grep -q "stock_dashboard_mysql"; then
      docker start stock_dashboard_mysql 2>/dev/null || true
      warn "MySQL 容器已存在，啟動中..."
    else
      docker run -d --name stock_dashboard_mysql \
        -e MYSQL_ROOT_PASSWORD=rootpass123 \
        -e MYSQL_DATABASE=stock_dashboard \
        -e MYSQL_USER=dashboard \
        -e MYSQL_PASSWORD=dashpass123 \
        -p 3306:3306 mysql:8.0 \
        --default-authentication-plugin=mysql_native_password
      echo "  等待 MySQL 啟動 (~15s)..."
      sleep 15
    fi
    ok "MySQL Docker 運行中"
    ;;
  2) ok "使用現有 MySQL (確認 .env 裡的 DATABASE_URL 正確)" ;;
  3) warn "跳過，稍後請手動設定" ;;
esac

# ─── 6. DB Migration ───
step "建立資料庫表..."
pnpm db:push 2>&1 | tail -5 && ok "資料庫表建立完成" || warn "Migration 失敗，稍後請手動: pnpm db:push"

# ─── 完成 ───
echo ""
echo "═══════════════════════════════════════════════════════"
echo -e " ${GREEN}✅ 安裝完成！${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo -e " ${CYAN}啟動步驟：${NC}"
echo ""
echo "   方案 A — 使用 Twelve Data API（推薦）:"
echo "     pnpm dev"
echo "     # 確認 .env 裡 TWELVE_DATA_API_KEY 已設定"
echo ""
echo "   方案 B — 使用 yfinance 備援（兩個終端機）:"
echo "     終端機 1: source venv/bin/activate && python3 server/yfinance_service.py"
echo "     終端機 2: pnpm dev"
echo ""
echo "   瀏覽器打開: http://localhost:3000"
echo ""
echo " ─────────────────────────────────────────────"
echo " 📝 自動登入管理員帳號，不需要輸入帳密"
echo " 📈 Twelve Data API: US 即時 / 台股 EOD"
echo " 📈 yfinance 備援: 免費無限量 (可選)"
echo " 💎 訂閱系統 LAUNCH_MODE = 全功能免費"
echo "═══════════════════════════════════════════════════════"
