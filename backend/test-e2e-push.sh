#!/usr/bin/env bash
# Sends 3 locations for a fresh session while test-socket.js listens.
set -e
OUT=$(curl -s -X POST http://localhost:3000/api/sessions)
SID=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['sessionId'])")
TOK=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['trackerToken'])")
SHARE=$(echo "$OUT" | python3 -c "import sys,json;print(json.load(sys.stdin)['shareId'])")
echo "shareId=$SHARE sessionId=$SID"

node test-socket.js "$SHARE" > /tmp/opencode/socket-test.log 2>&1 &
SOCKET_PID=$!
sleep 2

for i in 1 2 3; do
  curl -s -X POST "http://localhost:3000/api/sessions/$SID/locations" \
    -H "content-type: application/json" -H "x-tracker-token: $TOK" \
    -d "{\"seq\":$i,\"lat\":52.10$(printf '%02d' $i),\"lng\":4.90$(printf '%02d' $i),\"accuracy\":7,\"deviceTimestamp\":$(date +%s000)}" >/dev/null
  sleep 0.7
done

wait $SOCKET_PID
echo "--- socket test output:"
cat /tmp/opencode/socket-test.log
