#!/bin/bash
# ═══════════════════════════════════════════════════════
# 📍 Blip — 一鍵安裝腳本（附近限時社群）
# ═══════════════════════════════════════════════════════
set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
step() { echo -e "\n${CYAN}▶ $1${NC}"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

echo ""
echo "═══════════════════════════════════════════════════════"
echo " 📍 Blip — 本地安裝"
echo "═══════════════════════════════════════════════════════"

# ─── 1. 環境檢查 ───
step "檢查必要工具..."
command -v node >/dev/null 2>&1 || fail "找不到 Node.js (需要 ≥ 18): https://nodejs.org"
NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -ge 18 ] || fail "Node.js 版本需 ≥ 18，目前: $(node -v)"
ok "Node.js $(node -v)"
command -v pnpm >/dev/null 2>&1 || { warn "pnpm 不存在，正在安裝..."; npm install -g pnpm; }
ok "pnpm $(pnpm -v)"

# ─── 2. 安裝依賴 ───
step "安裝 Node.js 依賴..."
pnpm install --no-frozen-lockfile 2>&1 | tail -5
ok "Node.js 依賴安裝完成"

# ─── 3. 建立 .env ───
step "建立 .env 設定檔..."
if [ -f ".env" ]; then
  warn ".env 已存在，跳過"
else
  cat > .env << 'ENVEOF'
# ─── Database ───
DATABASE_URL=mysql://blip:blippass123@localhost:3306/blip

# ─── Auth ───
JWT_SECRET=my-local-dev-secret-key-change-me
VITE_APP_ID=blip
OWNER_OPEN_ID=local-owner
ENVEOF
  ok ".env 已建立"
fi

# ─── 4. MySQL ───
step "設定 MySQL..."
echo "  [1] 用 Docker 自動建立 (推薦)"
echo "  [2] 使用現有的 MySQL"
echo "  [3] 跳過"
read -p "  選擇 [1/2/3]: " DB_CHOICE
case $DB_CHOICE in
  1)
    command -v docker >/dev/null 2>&1 || fail "Docker 未安裝"
    if docker ps -a --format '{{.Names}}' | grep -q "blip_mysql"; then
      docker start blip_mysql 2>/dev/null || true
      warn "MySQL 容器已存在，啟動中..."
    else
      docker run -d --name blip_mysql \
        -e MYSQL_ROOT_PASSWORD=rootpass123 \
        -e MYSQL_DATABASE=blip \
        -e MYSQL_USER=blip \
        -e MYSQL_PASSWORD=blippass123 \
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

# ─── 5. 建立資料庫表 ───
step "建立資料庫表..."
pnpm db:push 2>&1 | tail -5 && ok "資料庫表建立完成" || warn "失敗，稍後請手動: pnpm db:push"

# ─── 完成 ───
echo ""
echo "═══════════════════════════════════════════════════════"
echo -e " ${GREEN}✅ 安裝完成！${NC}"
echo "═══════════════════════════════════════════════════════"
echo ""
echo -e " ${CYAN}啟動：${NC} pnpm dev"
echo "   瀏覽器打開: http://localhost:3000"
echo ""
echo " 📝 開發環境自動登入，不需要輸入帳密"
echo " 📍 需要允許瀏覽器定位才能看到附近 3 公里的分享"
echo "═══════════════════════════════════════════════════════"
