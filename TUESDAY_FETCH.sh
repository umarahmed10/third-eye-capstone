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

echo "== session logs =="
# All of them. The 2026-08-28 session produced three separate runs, and the
# diagnostics that identified the context-truncation bug live in ctx.log and
# stageb.log, not in tuesday.log. A log left on the box is a log that is gone.
for L in tuesday ctx stageb ollama; do
  scp "$BOX:$L.log" "$OUT/dgx_fullscale/$L.log" 2>/dev/null && echo "   $L.log"
done

echo "== ablation comparison, recomputed locally so it is reproducible here =="
ssh "$BOX" 'cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --compare ctx4k ctx16k'   > "$OUT/dgx_fullscale/ctx_ablation_compare.txt" 2>&1 &&   tail -6 "$OUT/dgx_fullscale/ctx_ablation_compare.txt"

echo "== gptscan head-to-head =="
ssh "$BOX" 'cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python -m eval.run_web3bugs --gptscan-set --contests 0 --report-only'   > "$OUT/dgx_fullscale/gptscan_head_to_head.txt" 2>&1 && echo "   captured"

echo
echo "Collected into $OUT/dgx_fullscale/"
ls -la "$OUT/dgx_fullscale/" | head -20
