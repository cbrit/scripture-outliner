#!/usr/bin/env bash
# Tear down the preview this run started. Leaves evidence/ intact.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"

if [[ ! -f "${STATE_FILE}" ]]; then
  echo "No verification instance to clean up."
  exit 0
fi

pid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("pid",""))' "${STATE_FILE}")"
if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
  pkill -P "${pid}" 2>/dev/null || true
  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 20); do
    if ! kill -0 "${pid}" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  if kill -0 "${pid}" 2>/dev/null; then
    kill -9 "${pid}" 2>/dev/null || true
  fi
  echo "Stopped pid ${pid}"
fi

rm -f "${STATE_FILE}"
rm -f "${LOG_FILE}"
# Keep the run dir if empty-ish; evidence is never deleted.
echo "Cleanup done. Evidence remains in ${EVIDENCE_DIR}"
