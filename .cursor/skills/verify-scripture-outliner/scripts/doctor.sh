#!/usr/bin/env bash
# Read-only health check for the verification preview this run started.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ ! -f "${STATE_FILE}" ]]; then
  echo "FAIL: no state file at ${STATE_FILE}. Run launch.sh first." >&2
  exit 1
fi

pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["pid"])' "${STATE_FILE}")"
url="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["url"])' "${STATE_FILE}")"
port="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["port"])' "${STATE_FILE}")"

if ! kill -0 "${pid}" 2>/dev/null; then
  echo "FAIL: pid ${pid} is not running." >&2
  exit 1
fi

if command -v ss >/dev/null 2>&1; then
  if ! ss -ltnp 2>/dev/null | grep -E ":${port} .*pid=${pid}" >/dev/null; then
    # ss -p may be empty without privileges; fall back to listen check.
    if ! ss -ltn | grep -q ":${port} "; then
      echo "FAIL: nothing listening on port ${port}." >&2
      exit 1
    fi
  fi
fi

html="$(curl -fsS "${url}")"
if ! grep -q 'id="app"' <<<"${html}"; then
  echo "FAIL: ${url} did not contain #app." >&2
  exit 1
fi
if ! grep -q 'Scripture Outliner' <<<"${html}"; then
  echo "FAIL: ${url} did not contain app title text." >&2
  exit 1
fi

echo "OK pid=${pid} url=${url} title=Scripture Outliner"
