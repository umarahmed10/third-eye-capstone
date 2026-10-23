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

# Exactly four models are pulled. More slots than models buys nothing and
# each loaded model carries its own KV cache.
export OLLAMA_MAX_LOADED_MODELS=4

# The specialists are NOT evenly spread across models: qwen2.5-coder:7b carries
# 4 of the 8 roles, llama3.x carries 3, gemma3 carries 1. So at contract
# concurrency C the busiest model sees 4C concurrent requests, not C. 16 slots
# therefore supports C=4 with no queueing. Queueing is not merely slow: queue
# wait counts against the client deadline, a blown deadline fails closed to
# INCONCLUSIVE, and the contracts that blow it are the LARGE ones -- so
# over-subscription biases the scored sample toward simple code while every
# table still looks healthy.
export OLLAMA_NUM_PARALLEL=16

# MEASURED, not assumed. At 16 slots x 32k context the server allocated 34GB
# for qwen2.5-coder:7b and 73GB for llama3.1:8b -- 107GB of 119GB for two
# 5GB models, because the KV cache is slots x context, not model size. gemma3
# had not loaded yet and the council needs all three at once, so A2 would have
# OOM'd partway in. Capping server context at 16384 cuts the cache in half and
# is not a restriction: the largest arm this pipeline runs is num_ctx=16384,
# and the client sends a smaller value per request for the 4k arm.
export OLLAMA_CONTEXT_LENGTH=16384

# Long runs must not pay a reload between stages.
export OLLAMA_KEEP_ALIVE=24h

# THE LOGIC MODEL, SETTLED BY MEASUREMENT 2026-10-09.
#
# business_logic is a role the router runs on EVERY contract, so whichever
# model sits here sets the character of the whole system. llama3.1:8b does not
# fit a 4GB laptop GPU, so the laptop substituted llama3.2:3b and that was
# recorded as a known weakness -- the weakest model on the most-used role.
#
# On arriving at 119GB the obvious move was to "restore" the 8B. That was an
# argument from intent, and it was WRONG. Scoring the two parity arms already
# on this box against each other, 212 contracts paired, same machine:
#
#     3b   acc 73.1%   recall 92.0%   FPR 43.8%   median 18.1s
#     8b   acc 66.5%   recall 99.0%   FPR 62.5%   median 22.6s
#     McNemar on paired correctness: chi2 = 4.69, p = 0.0303
#
# The 8B is SIGNIFICANTLY WORSE. It buys 7 points of recall and pays 19 points
# of false-alarm rate -- and false alarms are the paper's entire subject. A
# model that flags nearly everything is the failure mode this work exists to
# criticise, so adopting it to look rigorous would have argued against our own
# thesis with our own data.
#
# The laptop's substitution was an accidental improvement, not a compromise.
# Keeping 3b also makes every row already on this box valid, rather than
# something to re-run.
export OLLAMA_LOGIC_MODEL=llama3.2:3b

# PINNED DELIBERATELY. This was unset, so services/arbitration.py fell through
# to its hardcoded default of qwen3:8b -- a model that was NOT pulled on this
# box. Every judge call returned 404, the unparseable path failed open with
# verdict=real/upheld=True, all 234 findings were upheld unconditionally, and
# the paper reported "adversarial arbitration yields no held-out gain" as a
# measured result. It was true by construction. A serving config that leaves
# the judge implicit cannot distinguish "the judge agreed" from "there is no
# judge", so the model is named here and `scripts/gate0.sh` should fail if it
# is not present locally.
#
# qwen3:8b is a REASONING model: ~97% of its generated tokens are a thinking
# trace the parser discards, at 23s per call. That is a known, accepted cost,
# not a misconfiguration -- see DECISION_LOG Phase 9. Do not "optimise" it by
# disabling thinking without relabelling the arm, and never set num_predict
# low enough for the thinking trace to exhaust it: an empty response is
# unparseable, and unparseable fails open.
export LOCAL_JUDGE_MODEL=qwen3:8b

# Client-side deadline per specialist call. 240s was a laptop number for
# llama3.2:3b; an 8B model generating under contention needs more, and a
# deadline that fires on healthy work silently filters out the large contracts.
export LLM_TIMEOUT=600

export OLLAMA_HOST=127.0.0.1:11434
