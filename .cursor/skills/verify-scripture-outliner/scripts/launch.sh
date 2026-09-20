#!/usr/bin/env bash
# Start an isolated Vite preview for Scripture Outliner verification.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

mkdir -p "${RUN_DIR}" "${EVIDENCE_DIR}"

if [[ -f "${STATE_FILE}" ]]; then
  old_pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pid",""))' "${STATE_FILE}" 2>/dev/null || true)"
  if [[ -n "${old_pid}" ]] && kill -0 "${old_pid}" 2>/dev/null; then
    echo "Already running pid ${old_pid}. Run doctor.sh or cleanup.sh first." >&2
    exit 1
  fi
fi

port="${DEFAULT_PORT}"
host="${DEFAULT_HOST}"
if command -v ss >/dev/null 2>&1 && ss -ltn | grep -q ":${port} "; then
  port="$(python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"
fi

cd "${REPO_ROOT}"
if [[ ! -d node_modules ]]; then
  npm install
fi
python3 scripts/generate-icons.py
VITE_BASE=/ npm run build

: > "${LOG_FILE}"
npm run preview -- --host "${host}" --port "${port}" --strictPort >"${LOG_FILE}" 2>&1 &
pid=$!
url="http://${host}:${port}/"

python3 - <<PY
import json
from pathlib import Path
Path(${STATE_FILE@Q}).write_text(json.dumps({
  "pid": ${pid},
  "host": ${host@Q},
  "port": ${port},
  "url": ${url@Q},
  "repo": ${REPO_ROOT@Q},
  "log": ${LOG_FILE@Q},
}, indent=2) + "\n")
PY

ready=0
for _ in $(seq 1 40); do
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "Preview process ${pid} exited. Log:" >&2
    cat "${LOG_FILE}" >&2
    rm -f "${STATE_FILE}"
    exit 1
  fi
  if curl -fsS "${url}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 0.25
done

if [[ "${ready}" -ne 1 ]]; then
  echo "Preview did not become ready at ${url}" >&2
  cat "${LOG_FILE}" >&2
  kill "${pid}" 2>/dev/null || true
  rm -f "${STATE_FILE}"
  exit 1
fi

echo "Launched Scripture Outliner preview pid=${pid} url=${url}"
echo "${STATE_FILE}"
