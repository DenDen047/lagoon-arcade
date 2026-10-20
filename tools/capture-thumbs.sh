#!/bin/bash
# 一覧ページのサムネイルを撮り直す。
#
#   ./tools/capture-thumbs.sh            # games/ 配下すべて
#   ./tools/capture-thumbs.sh noclip     # 指定したゲームだけ
#
# 各ゲームの読み込み直後の画面をヘッドレス Chrome で 1280x800 で撮り、
# assets/thumbs/<slug>.jpg (960x600) に書き出す。
# --virtual-time-budget は付けない。付けると requestAnimationFrame が
# 一度も発火せず、canvas が真っ黒のまま写る。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8802}"
RAW="$ROOT/.thumbs-raw"

[ -x "$CHROME" ] || { echo "Chrome が見つかりません: $CHROME" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg が必要です (pixi global install ffmpeg)" >&2; exit 1; }

mkdir -p "$RAW" "$ROOT/assets/thumbs"

python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
sleep 1

if [ $# -gt 0 ]; then
  slugs=("$@")
else
  slugs=()
  for d in "$ROOT"/games/*/; do slugs+=("$(basename "$d")"); done
fi

for slug in "${slugs[@]}"; do
  png="$RAW/$slug.png"
  rm -f "$png"
  profile="$(mktemp -d)"
  "$CHROME" --headless=new --incognito --disable-gpu --hide-scrollbars \
    --user-data-dir="$profile" --window-size=1280,800 \
    --screenshot="$png" \
    "http://127.0.0.1:$PORT/games/$slug/index.html?cb=$RANDOM" >/dev/null 2>&1 &
  chrome_pid=$!
  # Chrome はスクショを書いたあとも終了しないので、ファイルが埋まったら落とす
  for _ in $(seq 1 60); do
    [ -s "$png" ] && { sleep 0.3; break; }
    sleep 0.5
  done
  kill $chrome_pid 2>/dev/null || true
  wait $chrome_pid 2>/dev/null || true
  rm -rf "$profile"

  if [ -s "$png" ]; then
    ffmpeg -y -i "$png" -vf scale=960:600 -q:v 4 "$ROOT/assets/thumbs/$slug.jpg" -loglevel error
    echo "OK   $slug"
  else
    echo "FAIL $slug" >&2
  fi
done

echo
echo "撮れた画像は目で確認すること。タイトル画面ではなく設定フォームが写ることがある。"
