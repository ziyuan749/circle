#!/bin/zsh
cd "$(dirname "$0")"

PORT=$(python3 - <<'PY'
import socket

for port in [3000, 5173, 8000, 8080, 9000]:
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", port))
        print(port)
        break
    except OSError:
        pass
    finally:
        s.close()
else:
    print(0)
PY
)

if [ "$PORT" = "0" ]; then
  echo "没有找到可用端口。请先关闭其他本地网站窗口，再重新打开这个文件。"
  read "?按回车退出"
  exit 1
fi

URL="http://127.0.0.1:$PORT/#/login"
echo "circle 正在启动..."
echo ""
echo "如果浏览器没有自动打开，请复制这个地址："
echo "$URL"
echo ""

open "$URL"
python3 -m http.server "$PORT" --bind 127.0.0.1
