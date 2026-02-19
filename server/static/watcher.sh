#!/usr/bin/env bash
# ast-watcher.sh — Agentic Street proposal watcher
# Runs via system crontab. Zero LLM tokens when idle.
# Dependencies: curl, jq

set -euo pipefail

API_KEY="${AST_API_KEY:?Set AST_API_KEY}"
HOOK_TOKEN="${OPENCLAW_HOOK_TOKEN:?Set OPENCLAW_HOOK_TOKEN}"
API_URL="${AST_API_URL:-https://agenticstreet.ai}"
HOOK_URL="${OPENCLAW_HOOK_URL:-http://127.0.0.1:18789}"
CHANNEL="${AST_CHANNEL:-last}"

# Poll for pending events (silent exit on network error — cron retries)
RESPONSE=$(curl -sf --max-time 10 \
  -H "Authorization: Bearer $API_KEY" \
  "${API_URL}/api/notifications/pending" 2>/dev/null) || exit 0

COUNT=$(echo "$RESPONSE" | jq -r '.count // 0')
[ "$COUNT" -eq 0 ] && exit 0

EVENTS=$(echo "$RESPONSE" | jq -c '.events')
LAST_ID=$(echo "$RESPONSE" | jq -r '.events[-1].id')

# Wake agent via isolated session
curl -sf --max-time 15 -X POST "${HOOK_URL}/hooks/agent" \
  -H "Authorization: Bearer $HOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg msg "AGENTIC STREET ALERT: ${COUNT} pending event(s). Events: ${EVENTS}" \
    --arg key "hook:agenticstreet:batch-${LAST_ID}" \
    --arg ch "$CHANNEL" \
    '{
      message: $msg,
      name: "AgenticStreet",
      sessionKey: $key,
      wakeMode: "now",
      deliver: true,
      channel: $ch,
      timeoutSeconds: 90
    }')" 2>/dev/null || true

# Acknowledge receipt (if this fails, next poll re-delivers — agent deduplicates via sessionKey)
curl -sf --max-time 5 -X POST "${API_URL}/api/notifications/ack" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"lastEventId\": $LAST_ID}" 2>/dev/null || true
