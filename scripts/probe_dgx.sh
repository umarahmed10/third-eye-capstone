#!/usr/bin/env bash
# Counts TERMINAL and QUARANTINED separately. The terminal count alone goes
# DOWN when run_benchmark moves an unsound row (GO + errored specialist) into
# _transient/, which twice looked like data loss and was not. The quarantine
# count is also the only honest fault counter: grepping the log for HTTP 500
# reported 3 faults when 13 rows had been quarantined.
cd ~/thirdeye/backend/eval/checkpoints || exit 1
date +%H:%M:%S
for s in 1 2; do
  d=benchmark/ollama_noarb/seed$s
  t=$(ls $d/*.json 2>/dev/null | wc -l)
  q=$(ls $d/_transient/*.json 2>/dev/null | wc -l)
  printf "seed%s: terminal=%s quarantined=%s attempted=%s/360\n" "$s" "$t" "$q" "$((t+q))"
done
printf "council: %s/303\n" "$(find council -name '*.json' | wc -l)"

# LIVENESS, not progress. The council tail writes one row every 28-58 min, so a
# flat count proves nothing either way. Two signals that do:
#   - age of the newest checkpoint, against that known band
#   - GPU sampled REPEATEDLY. A single nvidia-smi read returned 0% on a job
#     that was inferencing fine; utilisation is bursty between batches, so one
#     sample is not a liveness signal.
newest=$(find council -name '*.json' -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
if [ -n "$newest" ]; then
  printf "  newest council row: %d min ago (band 28-58)\n" \
    "$(( ($(date +%s) - ${newest%.*}) / 60 ))"
fi
printf "  gpu:"; for i in 1 2 3 4 5 6; do printf " %s" "$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader 2>/dev/null)"; sleep 4; done; echo
printf "  ollama log written %s min ago\n" \
  "$(( ($(date +%s) - $(stat -c %Y ~/ollama_run.log)) / 60 ))"

ps -u student-9 -o pid,etime,cmd | grep -E "eval\.run_" | grep -v grep || echo "  NONE RUNNING"
