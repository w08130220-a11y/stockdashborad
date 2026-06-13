#!/usr/bin/env bash
#
# Blip monorepo → 3 個獨立 GitHub repo
# ────────────────────────────────────────────────────────────
#   ios/   → https://github.com/w08130220-a11y/BLIP.git
#   web    → https://github.com/w08130220-a11y/blipweb.git   (client/ + shared/)
#   api    → https://github.com/w08130220-a11y/blip-api.git  (server/ + shared/ + drizzle/)
#
# 用法（在「你自己有 GitHub 登入」的電腦上）：
#   1. git clone -b claude/location-social-app-plan-wwq35b \
#        https://github.com/w08130220-a11y/stockdashborad.git
#   2. cd stockdashborad
#   3. bash deploy/split-and-push.sh
#
# 需求：git、node。會用 --force 初始化推送（目標 repo 目前是空的）。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
echo "→ 工作目錄：$TMP"

BLIP_URL="https://github.com/w08130220-a11y/BLIP.git"
WEB_URL="https://github.com/w08130220-a11y/blipweb.git"
API_URL="https://github.com/w08130220-a11y/blip-api.git"

EMAIL="$(git config user.email 2>/dev/null || echo blip@example.com)"
NAME="$(git config user.name 2>/dev/null || echo Blip)"

push_dir() { # $1=dir  $2=url  $3=message
  ( cd "$1"
    git init -q -b main
    git add -A
    git -c user.email="$EMAIL" -c user.name="$NAME" commit -q -m "$3"
    git remote add origin "$2"
    echo "→ 推送到 $2"
    git push -u origin main --force
  )
}

# 用 node 把 root package.json 改名 + 換 scripts（保留完整 deps，確保能裝）
rewrite_pkg() { # $1=outfile  $2=name  $3=scripts-json
  node -e '
    const fs=require("fs");
    const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
    p.name=process.argv[3];
    p.version="1.0.0";
    p.scripts=JSON.parse(process.argv[4]);
    fs.writeFileSync(process.argv[2], JSON.stringify(p,null,2)+"\n");
  ' "$ROOT/package.json" "$1" "$2" "$3"
}

# ─── 1) iOS → BLIP ───
IOS="$TMP/blip-ios"; mkdir -p "$IOS"
cp -R "$ROOT/ios/." "$IOS/"
[ -f "$ROOT/deploy/ios.gitignore" ] && cp "$ROOT/deploy/ios.gitignore" "$IOS/.gitignore"
push_dir "$IOS" "$BLIP_URL" "Blip iOS native app (SwiftUI)"

# ─── 2) Web 前端 → blipweb ───
WEB="$TMP/blip-web"; mkdir -p "$WEB"
cp -R "$ROOT/client" "$WEB/client"
cp -R "$ROOT/shared" "$WEB/shared"
for f in vite.config.ts tsconfig.json components.json .gitignore .prettierrc .prettierignore pnpm-lock.yaml; do
  [ -e "$ROOT/$f" ] && cp -R "$ROOT/$f" "$WEB/"
done
[ -d "$ROOT/patches" ] && cp -R "$ROOT/patches" "$WEB/"
rewrite_pkg "$WEB/package.json" "blipweb" '{"dev":"vite","build":"vite build","preview":"vite preview","check":"tsc --noEmit","format":"prettier --write ."}'
cp "$ROOT/deploy/web.README.md" "$WEB/README.md"
push_dir "$WEB" "$WEB_URL" "Blip web frontend (React + Vite)"

# ─── 3) 後端 → blip-api ───
API="$TMP/blip-api"; mkdir -p "$API"
cp -R "$ROOT/server" "$API/server"
cp -R "$ROOT/shared" "$API/shared"
cp -R "$ROOT/drizzle" "$API/drizzle"
for f in drizzle.config.ts tsconfig.json vitest.config.ts .gitignore .prettierrc .prettierignore setup-local.sh pnpm-lock.yaml; do
  [ -e "$ROOT/$f" ] && cp -R "$ROOT/$f" "$API/"
done
[ -d "$ROOT/patches" ] && cp -R "$ROOT/patches" "$API/"
rewrite_pkg "$API/package.json" "blip-api" '{"dev":"cross-env NODE_ENV=development tsx watch server/_core/index.ts","build":"esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist","start":"cross-env NODE_ENV=production node dist/index.js","check":"tsc --noEmit","db:push":"drizzle-kit push","db:generate":"drizzle-kit generate","db:migrate":"drizzle-kit migrate","test":"vitest run"}'
cp "$ROOT/deploy/api.README.md" "$API/README.md"
cp "$ROOT/deploy/api.env.example" "$API/.env.example"
push_dir "$API" "$API_URL" "Blip backend API (Express + tRPC)"

echo ""
echo "✅ 完成！三個 repo 都已推送："
echo "   iOS  → $BLIP_URL"
echo "   Web  → $WEB_URL"
echo "   API  → $API_URL"
