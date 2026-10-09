#!/usr/bin/env bash
# ThirdEye: the whole remaining evaluation, as one unattended pipeline.
#
# WHY THIS EXISTS. Five hours on the box is a LAUNCH WINDOW, not a compute
# budget. Exhaustive testing is roughly 11,800 contract-runs, which is 6-15 GPU
# hours depending on where calibration lands. No five-hour plan can contain it
# and none should pretend to. What five hours CAN do is verify the box, close
# the one blocking stage while a person is watching, and then start everything
# else as a single resumable process that keeps running after the laptop is
# unplugged and walks home.
#
# STAGE ORDER IS VALUE ORDER, WHICH IS ALSO ABORT ORDER. The box may die at any
# point -- a shared machine, three admins, another student. So the stages run
# most-valuable-first, and the invariant is that aborting after stage N always
# leaves the best paper obtainable from N stages. Dying after stage 5 leaves the
# blocking stage closed, a complete headline, and a strengthened RQ3: a
# publishable paper. Under the obvious ordering (cheap things first, seeds
# early) the same death would leave variance estimates for a headline that does
# not exist.
#
# EVERY STAGE IS RESUMABLE AND GATED. Each runner checkpoints per contract, so
# re-running costs zero inference for work already done. Between stages,
# `python -m eval.guard <stage>` refuses to continue if the previous stage
# aborted or quarantined more than a quarter of its rows. Without that gate one
# outage at hour three silently poisons every stage after it, and the only
# evidence is a counter nobody is awake to read.
#
# Usage, on the box:
#     cd ~/thirdeye
#     setsid nohup bash scripts/run_all.sh > ~/run_all.log 2>&1 < /dev/null &
#     disown
#     tail -f ~/run_all.log
#
# `setsid` matters: without it the pipeline is in the SSH session's process
# group and dies with the session, which is the whole thing we are trying to
# avoid. Status, from anywhere:
#     python3 ~/thirdeye/backend/eval/progress.py
#
# To run a subset:  STAGES="a2 a1 a3" bash scripts/run_all.sh
# To stop early:    touch ~/thirdeye/STOP   (checked between stages)

set -u -o pipefail

ROOT="${THIRDEYE_ROOT:-$HOME/thirdeye}"
PY="${THIRDEYE_PY:-$ROOT/venv/bin/python}"
BACKEND="$ROOT/backend"
LOGDIR="${THIRDEYE_LOGS:-$HOME/thirdeye_logs}"
CONC="${CONC:-6}"            # overwritten by calibrate's recommendation below
STOPFILE="$ROOT/STOP"

mkdir -p "$LOGDIR"

# Same reason as gate0: serving config lives in the repo, not a profile.
[ -f "$ROOT/scripts/env.sh" ] && . "$ROOT/scripts/env.sh"

say() { printf '\n==== %s  %s\n' "$(date '+%F %T')" "$*"; }

# ---------------------------------------------------------------- preconditions
#
# Checked once, loudly, before anything spends GPU time. Each of these has
# already cost a session at least once.
preconditions() {
  say "preconditions"
  [ -x "$PY" ] || { echo "FATAL no interpreter at $PY"; exit 1; }
  cd "$BACKEND" || exit 1

  # OLLAMA_MODELS_RESIDENT is the single highest-leverage variable on this box.
  # Unset, the council schedules its eight specialists as three SEQUENTIAL
  # per-model groups, because on a 4GB laptop loading eight models at once
  # thrashes. On 120GB of unified memory that protection costs ~3x per-contract
  # latency for nothing.
  if [ "${OLLAMA_MODELS_RESIDENT:-}" != "1" ]; then
    echo "FATAL OLLAMA_MODELS_RESIDENT is not 1."
    echo "      The council will serialise into 3 sequential model groups and the"
    echo "      whole pipeline will take about three times as long. Export it,"
    echo "      along with OLLAMA_NUM_PARALLEL and OLLAMA_KEEP_ALIVE, and relaunch."
    exit 1
  fi

  # Contract concurrency x 8 specialists is the real request rate at Ollama.
  # Above OLLAMA_NUM_PARALLEL the surplus QUEUES, queue wait counts against the
  # client deadline, and a blown deadline fails closed to INCONCLUSIVE. The
  # contracts that blow it are the large ones, so over-concurrency does not just
  # slow the run -- it biases the scored sample toward simple code while every
  # table still looks healthy.
  if [ -z "${OLLAMA_NUM_PARALLEL:-}" ]; then
    echo "FATAL OLLAMA_NUM_PARALLEL is unset. Set it explicitly; the default is 1"
    echo "      on some builds, which would queue every specialist behind the last."
    exit 1
  fi

  "$PY" -c 'import eval.provenance as p; print(p.summarise(p.collect([])))' \
    2>&1 | tail -3 || { echo "FATAL provenance collection failed"; exit 1; }
  echo "ok  conc=$CONC  NUM_PARALLEL=$OLLAMA_NUM_PARALLEL  RESIDENT=$OLLAMA_MODELS_RESIDENT"
}

# ------------------------------------------------------------------- the gate
#
# Returns non-zero when the previous stage left the backend in a state that
# makes the next stage worthless. Run between every pair of stages.
gate() {
  "$PY" -m eval.guard "$1" || return 1
  [ -e "$STOPFILE" ] && { echo "STOP file present -- halting cleanly after $1"; return 1; }
  return 0
}

stage() {
  local name="$1"; shift
  if ! gate "$name"; then
    say "SKIPPED $name (gate refused)"
    return 1
  fi
  say "START $name"
  ( cd "$BACKEND" && "$@" ) 2>&1 | tee "$LOGDIR/$name.log"
  local rc=${PIPESTATUS[0]}
  say "END $name rc=$rc"
  return $rc
}

# -------------------------------------------------------------------- stage 0
#
# Ten minutes here buys hours later, and it is the only thing that can tell us
# what concurrency this box actually wants. Nothing is checkpointed, so a
# calibration row can never be scored as a result.
calibrate() {
  # A relaunch should not re-measure. Calibration takes ~5 minutes of a finite
  # campus window, and the answer does not change unless the serving config
  # does -- so pass SKIP_CALIBRATE=1 with an explicit CONC when restarting a
  # pipeline for an unrelated reason.
  if [ "${SKIP_CALIBRATE:-}" = "1" ]; then
    say "calibrate SKIPPED (SKIP_CALIBRATE=1), using CONC=$CONC"
    return 0
  fi
  say "calibrate"
  cd "$BACKEND" || return 1
  "$PY" -m eval.calibrate --n 12 --levels 2,4,8,16,24 2>&1 | tee "$LOGDIR/calibrate.log"
  local rec
  rec=$(grep -o 'RECOMMENDED  --concurrency [0-9]*' "$LOGDIR/calibrate.log" \
        | tail -1 | awk '{print $NF}')
  if [ -n "$rec" ]; then
    CONC="$rec"
    # Ceiling from the serving config. An earlier version of this divided by 4,
    # reasoning that qwen2.5-coder:7b carries 4 of the 8 roles so the busiest
    # model sees 4x the contract concurrency. MEASUREMENT SAYS OTHERWISE: on
    # 2026-10-09 calibrate ran 2/4/8/16/24 and found ZERO abstentions at every
    # level, p95 35.2s against a 240s timeout at concurrency 16, and throughput
    # 20.15/min there against 9.14/min at 4. The /4 cap was costing 2.2x for a
    # queueing collapse that does not occur -- the router runs a subset of the
    # council per contract and generation staggers, so the 4x pile-up is not
    # realised. The rate guard in eval/guard.py is the real protection against
    # the bias that argument was worried about, and unlike a static cap it
    # triggers on evidence.
    ceil="$OLLAMA_NUM_PARALLEL"
    [ "$ceil" -lt 1 ] && ceil=1
    if [ "$CONC" -gt "$ceil" ]; then
      echo "calibrate said $CONC but NUM_PARALLEL=$OLLAMA_NUM_PARALLEL caps it at $ceil; using $ceil"
      CONC="$ceil"
    fi
    echo "adopting calibrated concurrency $CONC"
  else
    echo "WARNING calibrate produced no recommendation; keeping CONC=$CONC"
  fi
}

# ------------------------------------------------------------------ the stages
#
# 1. A2 ctx ablation -- THE BLOCKER, and the only stage that must be watched.
#    Every number the project has ever reported was produced at num_ctx=4096,
#    where an over-long prompt is silently TRUNCATED rather than rejected. 540
#    of 2,250 contracts (24.0%) overflow, and the overflow is not class-balanced
#    (350 vulnerable vs 190 safe, because real buggy contracts are larger), so
#    truncation suppresses RECALL specifically -- the direction that flatters a
#    paper about false alarms. Until this is measured, nothing else is safe to
#    report, which is why it is first and why it runs while a human is present.
#    --max-tokens 12230 and --sample-seed 0 are not optional: they define the
#    paired sample.
s_a2() {
  stage a2_ctx4k_safe "$PY" -m eval.run_ctx_ablation --arm ctx4k_safe \
      --num-ctx 4096 --label safe --n 120 --max-tokens 12230 --sample-seed 0 \
      --concurrency "$CONC" --max-minutes 110
  stage a2_ctx16k_safe "$PY" -m eval.run_ctx_ablation --arm ctx16k_safe \
      --num-ctx 16384 --label safe --n 120 --max-tokens 12230 --sample-seed 0 \
      --concurrency "$CONC" --max-minutes 40
  ( cd "$BACKEND" && "$PY" -m eval.run_ctx_ablation --compare ctx4k_safe ctx16k_safe ) \
      2>&1 | tee "$LOGDIR/a2_compare.log"
}

# 2. A1 full corpus, seed 0 -- the headline. 2,250 contracts, the first run ever
#    to cover the whole corpus: the shipped figure is 1,154 of 2,250 and marked
#    partial. longest-first cuts makespan against a 171x latency spread; it is
#    only sound for a run intended to FINISH, because a truncated longest-first
#    run is size-biased, hence --max-minutes 0.
s_a1() {
  stage a1_full "$PY" -m eval.run_benchmark --backend ollama --seed 0 \
      --limit-per-tier 0 --sample-seed 0 --no-arbitration \
      --concurrency "$CONC" --schedule longest-first --max-minutes 0
}

# 3. A3 vulnerable-class ctx arm. The safe arm (stage 1) answers "does
#    truncation invent false alarms"; this answers "does it hide real bugs",
#    which is the half that actually threatens the thesis.
s_a3() {
  stage a3_ctx4k_vuln "$PY" -m eval.run_ctx_ablation --arm ctx4k \
      --num-ctx 4096 --n 90 --max-tokens 12230 --sample-seed 0 \
      --concurrency "$CONC" --max-minutes 45
  stage a3_ctx16k_vuln "$PY" -m eval.run_ctx_ablation --arm ctx16k \
      --num-ctx 16384 --n 90 --max-tokens 12230 --sample-seed 0 \
      --concurrency "$CONC" --max-minutes 30
  ( cd "$BACKEND" && "$PY" -m eval.run_ctx_ablation --compare ctx4k ctx16k ) \
      2>&1 | tee "$LOGDIR/a3_compare.log"
}

# 4. Web3Bugs, all 2,733 slices across 102 projects. Only 7 of 102 projects are
#    currently checkpointed, so the published contest recall rests on 7
#    projects. This is the largest single block of work in the pipeline and the
#    one most exposed to an overnight outage -- it is also, until today, the one
#    that had neither a breaker nor quarantining.
s_web3() {
  stage web3bugs "$PY" -m eval.run_web3bugs --backend ollama --seed 0 \
      --max-slices 40 --concurrency "$CONC"
}

# 5. Baselines over the full backbone. Slither is deterministic and cheap;
#    single_llm and council are the comparison rows the ablation table needs.
s_baselines() {
  stage baselines "$PY" -m eval.run_baselines \
      --baselines slither,single_llm,council \
      --datasets smartbugs_curated,access_control_slice \
      --llm-backend ollama --seed 0
}

# 6. The access-control ablation. Small (24 contracts x 3 configs) but it is the
#    only table with real negative-class signal, and until today a backend
#    failure in it was checkpointed as a NEGATIVE PREDICTION, permanently.
s_ablation() {
  stage ablation "$PY" -m eval.run_ablation
}

# 7. Arbitration sweep. Needs a judge, so it runs after the headline exists
#    (it sweeps the council's NO-GO set) and makes ~2x the calls per contract.
s_arb() {
  stage arbitration "$PY" -m eval.arbitration_sweep --arb-backend ollama
}

# 8. Seeds 1 and 2 -- LAST, deliberately. Variance across seeds is a nice-to-
#    have; a headline is not. Nested seeded sampling means these are strict
#    supersets, so stopping midway still leaves a usable partial seed.
s_seeds() {
  stage a1_seed1 "$PY" -m eval.run_benchmark --backend ollama --seed 1 \
      --limit-per-tier 0 --sample-seed 0 --no-arbitration \
      --concurrency "$CONC" --schedule longest-first --max-minutes 0
  stage a1_seed2 "$PY" -m eval.run_benchmark --backend ollama --seed 2 \
      --limit-per-tier 0 --sample-seed 0 --no-arbitration \
      --concurrency "$CONC" --schedule longest-first --max-minutes 0
}

# ------------------------------------------------------------------------ main
STAGES="${STAGES:-a2 a1 a3 web3 baselines ablation arb seeds}"

preconditions
calibrate

for s in $STAGES; do
  [ -e "$STOPFILE" ] && { say "STOP file present -- halting before $s"; break; }
  case "$s" in
    a2)        s_a2 ;;
    a1)        s_a1 ;;
    a3)        s_a3 ;;
    web3)      s_web3 ;;
    baselines) s_baselines ;;
    ablation)  s_ablation ;;
    arb)       s_arb ;;
    seeds)     s_seeds ;;
    *)         echo "unknown stage: $s" ;;
  esac
done

say "pipeline finished"
cd "$BACKEND" && "$PY" eval/progress.py
echo
echo "stage health log:"
cat "$BACKEND/eval/results/stage_health.jsonl" 2>/dev/null || echo "  (none)"
