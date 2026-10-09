#!/bin/bash
# Progress check. Safe to run any time, as often as you like.
# Host is NOT committed: it is a shared campus machine on a private network.
# Run from anywhere: these paths are repo-root-relative, and this script
# now lives in scripts/ rather than at the root.
cd "$(dirname "$0")/.." || exit 1

# The box address lives in .dgx_host (gitignored) so it never has to be typed
# or remembered, and never lands in a public repo: it is a shared campus
# machine on a private 10.x network. An explicit THIRDEYE_DGX_HOST in the
# environment still wins.
if [ -z "${THIRDEYE_DGX_HOST:-}" ] && [ -f .dgx_host ]; then
  . ./.dgx_host
  export THIRDEYE_DGX_HOST
fi
BOX="${THIRDEYE_DGX_HOST:?set THIRDEYE_DGX_HOST=user@host, or create .dgx_host from .dgx_host.example}"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$BOX" '
cd ~/thirdeye/backend/eval/checkpoints 2>/dev/null || exit 1
c () { ls "$1"/*.json 2>/dev/null | wc -l; }
echo "stage A  8B ablation      $(c parity_full8b)/233"
echo "stage B  full benchmark   $(c benchmark/ollama_noarb/seed0)/2250   (quarantined: $(c benchmark/ollama_noarb/seed0/_transient))"
echo "stage C  np=1 control     $(c parity_full3b_np1)/233"
echo "stage D  web3bugs         $(c web3bugs)/102"
echo
echo "--- current stage ---"; grep "###\|SESSION" ~/tuesday.log 2>/dev/null | tail -3
echo "--- alive? ---"; pgrep -f "eval\.run_" >/dev/null && echo RUNNING || echo "NOT RUNNING"
echo "--- last 3 lines ---"; tail -3 ~/tuesday.log 2>/dev/null
' 2>&1
