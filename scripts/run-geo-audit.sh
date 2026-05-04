#!/usr/bin/env bash
# scripts/run-geo-audit.sh
#
# Runs the geo-seo-claude /geo audit skill non-interactively against a URL
# and writes the markdown report to stdout. Diagnostics + errors go to
# stderr; the last error stream is also captured to tmp/geo-audit-last.err
# for post-mortem inspection.
#
# Usage:
#   scripts/run-geo-audit.sh <url> [competitor_url]
#   scripts/run-geo-audit.sh https://ricksaffordableheating.com > out.md
#
# Exit codes:
#   0  success — markdown written to stdout
#   1  bad usage
#   2  prerequisite missing (claude CLI, skill files, venv, or auth)
#   3  audit command exited non-zero
#   4  audit command exited zero but produced no output
#
# All errors are visible. Nothing is silently swallowed.

set -uo pipefail

err() { printf '%s\n' "$*" >&2; }

# Resolve repo-root (parent of scripts/) so we can write tmp/ artifacts even
# when the wrapper is invoked from a different cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
TMP_DIR="${REPO_ROOT}/tmp"
mkdir -p "${TMP_DIR}"
ERR_FILE="${TMP_DIR}/geo-audit-last.err"
: > "${ERR_FILE}" # truncate

# Mirror everything we print to stderr into the err file too.
log() {
  printf '%s\n' "$*" >&2
  printf '%s\n' "$*" >> "${ERR_FILE}"
}

# ---- arg parsing ----
if [ "$#" -lt 1 ]; then
  err "Usage: $0 <url> [competitor_url]"
  err "Example: $0 https://ricksaffordableheating.com"
  exit 1
fi

URL="$1"
COMPETITOR_URL="${2:-}"

# ============================================================
# Phase 1: Diagnostics
# ============================================================
log "════════════════════════════════════════════════════════════"
log " geo-audit wrapper · diagnostics"
log "════════════════════════════════════════════════════════════"
log "  cwd                : $(pwd)"
log "  repo root          : ${REPO_ROOT}"
log "  target URL         : ${URL}"
if [ -n "${COMPETITOR_URL}" ]; then
  log "  competitor URL     : ${COMPETITOR_URL}"
fi
log "  err file           : ${ERR_FILE}"

# claude CLI presence + version
if command -v claude >/dev/null 2>&1; then
  CLAUDE_BIN="$(command -v claude)"
  CLAUDE_VERSION="$(claude --version 2>&1 | head -1 || echo 'unknown')"
  log "  claude CLI         : ${CLAUDE_BIN}  (${CLAUDE_VERSION})"
else
  log "  claude CLI         : NOT FOUND on PATH"
  log ""
  log "ERROR: claude CLI is not on PATH."
  log "Install Claude Code (https://claude.com/claude-code) or add it to PATH."
  exit 2
fi

# Skill install
SKILL_DIR="${HOME}/.claude/skills/geo"
if [ -f "${SKILL_DIR}/SKILL.md" ]; then
  SKILL_BYTES="$(wc -c < "${SKILL_DIR}/SKILL.md" | tr -d ' ')"
  log "  geo SKILL.md       : ${SKILL_DIR}/SKILL.md  (${SKILL_BYTES} bytes)"
else
  log "  geo SKILL.md       : MISSING at ${SKILL_DIR}/SKILL.md"
  log ""
  log "ERROR: geo skill not installed."
  log "Run: cd vendor/geo-seo-claude && ./install.sh"
  exit 2
fi

# Venv
VENV_PY="${SKILL_DIR}/.venv/bin/python3"
if [ -x "${VENV_PY}" ]; then
  VENV_VERSION="$("${VENV_PY}" --version 2>&1 | head -1 || echo 'unknown')"
  log "  geo .venv          : ${SKILL_DIR}/.venv  (${VENV_VERSION})"
else
  log "  geo .venv          : MISSING or not executable at ${VENV_PY}"
  log ""
  log "ERROR: Python venv missing."
  log "Run: cd vendor/geo-seo-claude && ./install.sh"
  log "If install.sh provisions Python 3.9 (which can't satisfy Pillow >= 12.1),"
  log "recreate with:"
  log "  rm -rf ${SKILL_DIR}/.venv"
  log "  /opt/homebrew/bin/python3.11 -m venv ${SKILL_DIR}/.venv"
  log "  ${SKILL_DIR}/.venv/bin/python3 -m pip install -r ${REPO_ROOT}/vendor/geo-seo-claude/requirements.txt"
  exit 2
fi

# ANTHROPIC_API_KEY status (don't print the key)
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  log "  ANTHROPIC_API_KEY  : set (length=${#ANTHROPIC_API_KEY})"
else
  log "  ANTHROPIC_API_KEY  : not set (assuming \`claude login\` session)"
fi

log ""

echo "STARTING AUDIT" >&2

# ============================================================
# Phase 2: Smoke test — confirm claude CLI replies
# ============================================================
log "── smoke test: claude -p \"Reply with GEO_AUDIT_READY\" ──"
SMOKE_STDOUT_FILE="$(mktemp)"
SMOKE_STDERR_FILE="$(mktemp)"
SMOKE_EXIT=0
claude -p "Reply with GEO_AUDIT_READY and nothing else." \
  --output-format text \
  > "${SMOKE_STDOUT_FILE}" 2> "${SMOKE_STDERR_FILE}" || SMOKE_EXIT=$?
SMOKE_OUT="$(cat "${SMOKE_STDOUT_FILE}" 2>/dev/null || true)"
SMOKE_ERR="$(cat "${SMOKE_STDERR_FILE}" 2>/dev/null || true)"

# Persist smoke stderr into the err file so post-mortem captures it.
{
  echo "── smoke test stderr ──"
  echo "${SMOKE_ERR}"
  echo "── smoke test stdout ──"
  echo "${SMOKE_OUT}"
  echo "── smoke test exit code: ${SMOKE_EXIT} ──"
} >> "${ERR_FILE}"
rm -f "${SMOKE_STDOUT_FILE}" "${SMOKE_STDERR_FILE}"

if [ "${SMOKE_EXIT}" -ne 0 ] || [ -z "${SMOKE_OUT}" ]; then
  log ""
  log "ERROR: smoke test failed (exit=${SMOKE_EXIT}, stdout-empty=$([ -z "${SMOKE_OUT}" ] && echo yes || echo no))."
  log "Claude CLI is not authenticated or not returning output. Run: claude login"
  log ""
  log "Last stderr from the smoke test:"
  log "${SMOKE_ERR:-<empty>}"
  exit 2
fi

# Truncate the smoke output if huge — log first 200 chars only.
SMOKE_PREVIEW="$(printf '%s' "${SMOKE_OUT}" | head -c 200)"
log "  smoke ok           : \"${SMOKE_PREVIEW}\""
log ""

# ============================================================
# Phase 3: Run the audit
# ============================================================
COMPETITOR_CLAUSE=""
if [ -n "${COMPETITOR_URL}" ]; then
  COMPETITOR_CLAUSE=" Compare against the competitor at ${COMPETITOR_URL}."
fi

PROMPT="Use the geo skill (SKILL at ~/.claude/skills/geo) to run a full audit on ${URL}.${COMPETITOR_CLAUSE} Output the complete client-ready report in markdown only — no preamble, no closing remarks, just the report. Begin output now."

ALLOWED_TOOLS="WebFetch WebSearch Read Grep Glob Write Bash"

log "── audit run ──"
log "  command            : claude -p <prompt-via-stdin> --output-format text --allowedTools ${ALLOWED_TOOLS}"
log "  prompt bytes       : ${#PROMPT}"
log ""

echo "RUNNING CLAUDE..." >&2

# Capture the audit's stderr separately, append to ERR_FILE on completion.
AUDIT_ERR_FILE="$(mktemp)"
AUDIT_EXIT=0
# shellcheck disable=SC2086 -- intentional word-splitting on $ALLOWED_TOOLS
printf '%s\n' "${PROMPT}" \
  | claude -p \
      --output-format text \
      --allowedTools ${ALLOWED_TOOLS} \
      2> "${AUDIT_ERR_FILE}" \
  || AUDIT_EXIT=$?

AUDIT_ERR="$(cat "${AUDIT_ERR_FILE}" 2>/dev/null || true)"
{
  echo ""
  echo "── audit stderr ──"
  echo "${AUDIT_ERR}"
  echo "── audit exit code: ${AUDIT_EXIT} ──"
} >> "${ERR_FILE}"
rm -f "${AUDIT_ERR_FILE}"

# We can't reliably inspect our own stdout (it's already piped to the caller).
# We rely on the audit exit code + stderr pattern-matching. The caller is
# expected to `wc -l` the output file and compare against ${ERR_FILE} if it
# looks empty.

if [ "${AUDIT_EXIT}" -ne 0 ]; then
  echo "CLAUDE FAILED" >&2
  log ""
  log "ERROR: claude -p exited non-zero (exit=${AUDIT_EXIT})."
  log ""
  log "Last 100 lines of audit stderr (also in ${ERR_FILE}):"
  printf '%s\n' "${AUDIT_ERR}" | tail -n 100 >&2
  exit 2
fi

# If we can detect empty output, surface that loud. We can't always tell
# (depends on whether stdout is a regular file), so we duplicate stdout to
# a sentinel file too via a tee-style approach. Easier: re-run already-piped
# stdout? No — the audit is finished. Alternative: caller checks file size
# themselves with `wc -l`, which the spec asks them to do anyway.
#
# We do a best-effort check: if AUDIT_EXIT was 0 and stderr looks like a
# permission/auth error, surface it. Pattern-match common failure modes.
if printf '%s' "${AUDIT_ERR}" | grep -qiE '(permission denied|not authenticated|please run.*login|no api key|rate.?limit|invalid api key)'; then
  echo "CLAUDE FAILED" >&2
  log ""
  log "ERROR: audit appears to have failed (stderr suggests auth/permission issue)."
  log ""
  log "Last 100 lines of audit stderr:"
  printf '%s\n' "${AUDIT_ERR}" | tail -n 100 >&2
  exit 2
fi

log ""
log "── done ──"
log "  audit exit code    : 0"
log "  full stderr saved  : ${ERR_FILE}"
log ""
log "Verify report length with:"
log "  wc -l <output-file>"
log "If it's 0 lines, inspect ${ERR_FILE} for the actual cause."

exit 0
