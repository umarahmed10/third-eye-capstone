#!/usr/bin/env bash
# GATE 0 — runs ON the box. Answers one question: is this machine usable for a
# real run right now? Prints a verdict and exits non-zero if not.
#
# Every check here corresponds to a specific way a previous session was lost.
# None of them costs more than a few seconds, and skipping them has cost hours.

set -u
ROOT="${THIRDEYE_ROOT:-$HOME/thirdeye}"
PY="${THIRDEYE_PY:-$ROOT/venv/bin/python}"
fail=0
ok()   { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }
warn() { printf '  warn  %s\n' "$*"; }

echo "GATE 0  $(hostname)  $(date '+%F %T')"

# 1. The GPU, and how much of it is actually free. This box is shared with
#    another student and three admins; 120GB on paper is not 120GB available.
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader | sed 's/^/  gpu   /'
  used=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
  tot=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
  if [ -n "${used:-}" ] && [ -n "${tot:-}" ] && [ "$tot" -gt 0 ]; then
    free_pct=$(( 100 - 100 * used / tot ))
    [ "$free_pct" -ge 60 ] && ok "GPU ${free_pct}% free" \
      || bad "only ${free_pct}% of GPU memory free — somebody else is on this box"
  fi
else
  # The GB10 reports through unified memory, so no nvidia-smi is not fatal.
  warn "no nvidia-smi; relying on provenance for the device"
fi

# 2. Ollama up, and the eight models present. A missing model does not error at
#    startup -- it errors per contract, at which point the run is half spent.
if curl -fsS --max-time 5 http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  ok "ollama responding"
  present=$(curl -fsS http://127.0.0.1:11434/api/tags | tr ',' '\n' | grep -c '"name"')
  ok "$present models pulled"
else
  bad "ollama is not answering on 11434 — nothing can run"
fi

# 3. The serving configuration. This is the difference between a 6-hour
#    pipeline and an 18-hour one, and between a clean run and a size-biased
#    one. OLLAMA_MODELS_RESIDENT=1 lets the council fan out to all eight
#    specialists at once instead of three sequential per-model groups;
#    OLLAMA_NUM_PARALLEL must exceed contract-concurrency x 8 or the surplus
#    queues against the client deadline and the big contracts get discarded.
for v in OLLAMA_MODELS_RESIDENT OLLAMA_NUM_PARALLEL OLLAMA_MAX_LOADED_MODELS OLLAMA_KEEP_ALIVE; do
  val="${!v:-}"
  [ -n "$val" ] && ok "$v=$val" || bad "$v is unset"
done
[ "${OLLAMA_MODELS_RESIDENT:-}" = "1" ] || bad "OLLAMA_MODELS_RESIDENT must be exactly 1"

# 4. Disk. 11,800 checkpoints plus logs is small, but a full home directory
#    fails every write silently-ish and looks like a backend problem.
avail=$(df -Pm "$HOME" | awk 'NR==2{print $4}')
[ "${avail:-0}" -ge 2048 ] && ok "${avail}MB free in \$HOME" || bad "only ${avail}MB free in \$HOME"

# 5. The code, the corpus, and provenance. Provenance records model digests, the
#    git SHA and the serving env at run START -- if it cannot run, nothing
#    downstream is attributable to a known configuration.
[ -x "$PY" ] || bad "no interpreter at $PY"
if [ -x "$PY" ]; then
  cd "$ROOT/backend" || exit 1
  n=$("$PY" -c 'from eval.loaders import thirdeye_bench as t; print(len(t.load()))' 2>/dev/null)
  [ "${n:-0}" -eq 2250 ] && ok "corpus loads: $n contracts" \
    || bad "corpus loaded $n contracts, expected 2250 — the datasets did not sync"
  "$PY" -c 'import eval.provenance as p; print("  prov ", p.summarise(p.collect([])))' \
    2>/dev/null || bad "provenance collection failed"
fi

# 6. One real contract, end to end. Everything above can pass on a box that
#    still cannot produce a verdict. This is the only check that proves it can.
if [ -x "$PY" ]; then
  echo "  smoke: one contract end to end (up to 5 min)..."
  if "$PY" -m eval.run_ctx_ablation --arm smoketest --num-ctx 16384 --label safe \
        --n 1 --max-tokens 12230 --sample-seed 0 --concurrency 1 2>&1 | tail -4; then
    ok "smoke run completed"
  else
    bad "smoke run failed — do not start the pipeline"
  fi
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "GATE 0 PASSED — the box is usable. Launch with scripts/run_all.sh"
else
  echo "GATE 0 FAILED — fix the FAIL lines above before spending GPU time."
fi
exit "$fail"
