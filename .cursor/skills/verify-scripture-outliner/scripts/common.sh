# Shared paths for Scripture Outliner verification helpers.
# Sourced by launch/doctor/cleanup. Not executed on its own.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SKILL_DIR}/../../.." && pwd)"
RUN_DIR="${SKILL_DIR}/.run"
STATE_FILE="${RUN_DIR}/state.json"
LOG_FILE="${RUN_DIR}/preview.log"
EVIDENCE_DIR="${SKILL_DIR}/evidence"
DEFAULT_PORT="${VERIFY_PORT:-4173}"
DEFAULT_HOST="${VERIFY_HOST:-127.0.0.1}"
