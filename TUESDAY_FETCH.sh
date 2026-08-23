#!/bin/bash
# Collect everything. RUN THIS BEFORE LEAVING CAMPUS — the box is on a private
# campus address and is unreachable from anywhere else.
set -u
BOX=student-9@10.1.72.54
OUT=backend/eval/results
mkdir -p "$OUT/dgx_fullscale"

echo "== reports =="
scp "$BOX:thirdeye/backend/eval/results/*.json" "$OUT/dgx_fullscale/" 2>/dev/null && echo "   pulled reports"
scp "$BOX:thirdeye/backend/eval/results/*.md"   "$OUT/dgx_fullscale/" 2>/dev/null

echo "== raw checkpoints (so nothing needs re-running) =="
# The DGX benchmark tree is kept SEPARATE from the laptop's on purpose: they are
# different platforms and the two disagree, so merging them would silently blend
# two populations into one table.
ssh "$BOX" 'cd ~/thirdeye/backend/eval && tar czf - checkpoints 2>/dev/null' \
  > "$OUT/dgx_fullscale/dgx_checkpoints.tar.gz" && \
  echo "   $(du -h "$OUT/dgx_fullscale/dgx_checkpoints.tar.gz" | cut -f1) of checkpoints"

echo "== session log =="
scp "$BOX:tuesday.log" "$OUT/dgx_fullscale/tuesday.log" 2>/dev/null

echo
echo "Collected into $OUT/dgx_fullscale/"
ls -la "$OUT/dgx_fullscale/" | head -20
