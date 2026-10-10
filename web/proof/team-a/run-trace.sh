#!/bin/bash
# Runs ONE streamed query and records the raw SSE stream with ms timestamps per line. Never prints the key.
set -u
KEY=$(grep '^ONDEMAND_API_KEY=' /tmp/wt-teamA/web/.env | cut -d= -f2- | tr -d '"')
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 bcap-portfolio-intelligence/1.0'
BASE=https://api.on-demand.io
OUT=/tmp/wt-teamA/web/proof/team-a
SESSION=$(curl -sS -X POST "$BASE/chat/v1/sessions" -H "apikey: $KEY" -H "User-Agent: $UA" -H 'content-type: application/json' -d '{"externalUserId":"team-a-agent11","pluginIds":[]}')
SID=$(echo "$SESSION" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("data",{}).get("id") or d.get("id") or "")')
echo "session_id=$SID" > "$OUT/sse-trace.meta.txt"
echo "$SESSION" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d)[:400])' >> "$OUT/sse-trace.meta.txt"
BODY='{"query":"Compare the latest funding news of Fervo Energy and Ormat Technologies and then summarise which one raised more recently.","endpointId":"predefined-deepseek-flash","responseMode":"stream","pluginIds":["plugin-1741871229","plugin-1751872652"],"reasoningMode":"medium"}'
T0=$(date +%s%3N)
curl -sS -N --max-time 240 -X POST "$BASE/chat/v1/sessions/$SID/query" -H "apikey: $KEY" -H "User-Agent: $UA" -H 'accept: text/event-stream' -H 'content-type: application/json' -d "$BODY" 2>&1 \
 | while IFS= read -r line; do echo "$(( $(date +%s%3N) - T0 )) $line"; done > "$OUT/sse-trace.raw.log"
echo "exit=$? lines=$(wc -l < "$OUT/sse-trace.raw.log")" >> "$OUT/sse-trace.meta.txt"
