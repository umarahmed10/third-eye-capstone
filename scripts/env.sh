# Serving configuration for the campus box. Sourced by gate0.sh and run_all.sh.
#
# This file exists because the box has NO OLLAMA_* exports in its profile --
# gate0 originally demanded them from the environment and would have failed for
# the wrong reason on a perfectly good machine. Config belongs in the repo,
# where it is versioned and reviewable, not in somebody's .bashrc.
#
# No secrets here, by construction: inference is entirely local and needs no key.

# Our own flag, read by services/council.py. Unset, the council schedules its
# eight specialists as three SEQUENTIAL per-model groups -- a protection for a
# 4GB laptop where loading several models thrashes. On 119GB of unified memory
# that costs ~3x per-contract latency and buys nothing.
export OLLAMA_MODELS_RESIDENT=1

# Four distinct models are pulled; 8 slots leaves headroom and costs nothing
# when fewer are in use.
export OLLAMA_MAX_LOADED_MODELS=8

# The specialists are NOT evenly spread across models: qwen2.5-coder:7b carries
# 4 of the 8 roles, llama3.x carries 3, gemma3 carries 1. So at contract
# concurrency C the busiest model sees 4C concurrent requests, not C. 16 slots
# therefore supports C=4 with no queueing. Queueing is not merely slow: queue
# wait counts against the client deadline, a blown deadline fails closed to
# INCONCLUSIVE, and the contracts that blow it are the LARGE ones -- so
# over-subscription biases the scored sample toward simple code while every
# table still looks healthy.
export OLLAMA_NUM_PARALLEL=16

# Long runs must not pay a reload between stages.
export OLLAMA_KEEP_ALIVE=24h

# THE MODEL THAT CHANGES THE RESULT. business_logic is a role the router runs on
# EVERY contract. llama3.1:8b (4.9GB) does not fit a 4GB laptop GPU -- measured
# ~190s for a three-word prompt, and under memory pressure the load fails
# outright -- so the laptop substituted llama3.2:3b and every number the project
# has published was produced with the weakest model on the most-used role.
# 119GB removes that constraint entirely. This is the single highest-value
# difference between the laptop runs and this one.
export OLLAMA_LOGIC_MODEL=llama3.1:8b

# Client-side deadline per specialist call.
export LLM_TIMEOUT=240

export OLLAMA_HOST=127.0.0.1:11434
