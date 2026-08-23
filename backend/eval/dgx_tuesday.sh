#!/bin/bash
# ONE COMMAND for the next campus session. Everything below is resumable:
# every stage checkpoints per contract, so a shutdown costs one contract.
#
# Order is by what needs THIS machine most:
#   1. finish the 8B ablation  (~223/233 already computed, minutes to close out)
#   2. the NUM_PARALLEL=1 control (decides whether the parity finding is real)
#   3. web3bugs (only if the laptop has not already finished it)
set -u
cd ~/thirdeye/backend
PY=~/thirdeye/venv/bin/python
M=~/thirdeye/backend/eval/parity_manifest_full.json
export OLLAMA_URL=http://127.0.0.1:11434 LLM_TIMEOUT=300

start_ollama () {   # $1 = num_parallel
  pkill -f "olla""ma serve" 2>/dev/null || true; sleep 4
  OLLAMA_HOST=127.0.0.1:11434 OLLAMA_CONTEXT_LENGTH=4096 \
  OLLAMA_NUM_PARALLEL="$1" OLLAMA_MAX_LOADED_MODELS=6 OLLAMA_KEEP_ALIVE=2h \
  setsid nohup ~/.local/bin/ollama serve > ~/ollama.log 2>&1 < /dev/null &
  sleep 12
  echo "ollama up: $(curl -s http://127.0.0.1:11434/api/version)  parallel=$1"
}

echo "##### 1/3  finish 8B ablation, n=233  $(date) #####"
start_ollama 4
export OLLAMA_LOGIC_MODEL=llama3.1:8b
$PY -u -m eval.run_parity --arm full8b --seed 0 --concurrency 4 --manifest "$M"
unset OLLAMA_LOGIC_MODEL

echo "##### 2/3  CONTROL: num_parallel=1, serial  $(date) #####"
# Reproduces the laptop's serving config exactly, leaving GPU + Ollama build as
# the only remaining differences. Serial on purpose -- concurrency here would
# reintroduce the very batching effect being tested.
start_ollama 1
$PY -u -m eval.run_parity --arm full3b_np1 --seed 0 --concurrency 1 --manifest "$M"

echo "##### 3/3  web3bugs, 102 contests  $(date) #####"
start_ollama 4
$PY -u -m eval.run_web3bugs --contests 0 --max-slices 25 --backend ollama --seed 0

echo "##### ALL DONE $(date) #####"
