#!/usr/bin/env bash
# GO — run this ON THE LAPTOP, on campus, once. Then walk away.
#
#     export THIRDEYE_DGX_HOST=user@10.1.72.54
#     ./scripts/GO.sh
#
# Syncs the code, runs GATE 0 on the box, and only if the gate passes launches
# the full pipeline detached. Closing the laptop or dropping wifi does not kill
# it: `setsid` puts the pipeline in its own session, outside the SSH process
# group that dies with the connection.
#
#   status   ssh $THIRDEYE_DGX_HOST 'cd thirdeye/backend && python3 eval/progress.py'
#   collect  ./scripts/TUESDAY_FETCH.sh     <- BEFORE leaving campus
#   stop     ssh $THIRDEYE_DGX_HOST 'touch thirdeye/STOP'   (halts between stages)

cd "$(dirname "$0")/.." || exit 1
set -u

BOX="${THIRDEYE_DGX_HOST:?set THIRDEYE_DGX_HOST=user@host (see .env.example)}"

echo "== 1. reachable? =="
ssh -o BatchMode=yes -o ConnectTimeout=10 "$BOX" 'echo ok' >/dev/null 2>&1 || {
  echo "CANNOT REACH $BOX."
  echo "  - is the box powered on?"
  echo "  - are you on the campus network? (it is a private 10.x address)"
  exit 1
}
echo "   reachable"

echo "== 2. sync code + scripts =="
# backend/.env is excluded DELIBERATELY and permanently: it holds a live API key
# and that box is shared with another student and three admins. The pipeline is
# all-local inference and needs no key.
tar czf - --exclude='.env' --exclude='venv*' --exclude='__pycache__' \
          --exclude='*.pyc' --exclude='eval/checkpoints' --exclude='*.db' \
    backend/eval backend/services backend/requirements.txt scripts datasets/gptscan 2>/dev/null \
  | ssh "$BOX" 'mkdir -p ~/thirdeye && tar xzf - -C ~/thirdeye && chmod +x ~/thirdeye/scripts/*.sh && echo "   code synced"' \
  || { echo "sync FAILED"; exit 1; }

echo "== 3. GATE 0 on the box =="
# Interactive -t so the serving env from the box's profile is actually loaded;
# a non-login shell would report every OLLAMA_* variable as unset and fail the
# gate for the wrong reason.
if ! ssh -t "$BOX" 'bash -lc "~/thirdeye/scripts/gate0.sh"'; then
  echo
  echo "GATE 0 did not pass. NOT launching. Fix the FAIL lines and re-run ./scripts/GO.sh"
  exit 1
fi

echo "== 4. launch the pipeline, detached =="
ssh "$BOX" 'bash -lc "cd ~/thirdeye && rm -f STOP && setsid nohup bash scripts/run_all.sh > ~/run_all.log 2>&1 < /dev/null & disown; sleep 2; echo launched pid=\$!"'

echo
echo "LAUNCHED. The box keeps running after you unplug."
echo "  watch    ssh $BOX 'tail -f ~/run_all.log'"
echo "  status   ssh $BOX 'cd thirdeye/backend && python3 eval/progress.py'"
echo "  COLLECT BEFORE LEAVING CAMPUS:  ./scripts/TUESDAY_FETCH.sh"
