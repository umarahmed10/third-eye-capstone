# Campus GPU runbook — session of 2026-09-26

**Budget:** ~210 min on the DGX. **Goal:** close the one experiment blocking the
MSR submission, and strengthen the weakest finding if time allows.

Everything below is paste-ready **bash, in the MobaXterm window logged into the
box**. Not PowerShell. Every block is idempotent — re-running is always safe
because checkpoints resume.

| task | priority | why | est. |
|---|---|---|--:|
| **T0** pre-flight | must | last session lost 2.5 h to an undetected outage | 10 min |
| **T1** safe-class context ablation | **P0** | the only experiment that can still move a headline number | ~120 min |
| **T2** extend vulnerable context arm | P1 | RQ3 rests on n=20; weakest finding in the paper | ~40 min |
| **T3** fetch everything | must | the box is unreachable off-campus | 10 min |

Buffer: ~30 min. **If you only do one thing, do T1.**

---

## T0 — Pre-flight (10 min, do not skip)

### T0.1 Ship the fixed runner

The old `run_ctx_ablation.py` checkpointed backend failures as results and reused
them on resume — that is what destroyed last session. **Without this step, a
second outage silently poisons the run again.**

Use the MobaXterm **SFTP panel on the left**: drag
`C:\Users\umara\Downloads\ThirdEye\backend\eval\run_ctx_ablation.py`
into `~/thirdeye/backend/eval/`, overwriting.

Then confirm the fix is live:

```bash
grep -c "QUARANTINED" ~/thirdeye/backend/eval/run_ctx_ablation.py
```

**Expect `2`.** If you get `0`, the file did not transfer — stop and re-drag.

### T0.2 Is Ollama actually alive?

```bash
pgrep -af ollama | head -3; echo "---"; curl -s -m 5 http://localhost:11434/api/tags | head -c 200; echo; echo "---"; free -g | head -2
```

**Expect:** a process line, a JSON blob listing models, and free memory.
**If the curl returns nothing**, Ollama is down — start it and wait 30 s:

```bash
setsid nohup ollama serve > ~/ollama.log 2>&1 & sleep 30; curl -s -m 5 http://localhost:11434/api/tags | head -c 120; echo
```

### T0.3 Purge the poisoned checkpoints

145 + 108 rows on disk are "N/N specialists failed". They must be quarantined or
resume will reuse them.

```bash
cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python -c "
import json,glob,os,shutil
for arm in ('ctx4k_safe','ctx16k_safe','ctx4k','ctx16k'):
    d='eval/checkpoints/ctx_%s'%arm
    if not os.path.isdir(d): continue
    t=d+'/_transient'; os.makedirs(t,exist_ok=True); n=0
    for f in glob.glob(d+'/*.json'):
        try: r=json.load(open(f))
        except Exception: continue
        if r.get('specialists_errored'):
            shutil.move(f,os.path.join(t,os.path.basename(f))); n+=1
    print('%-14s quarantined %3d, kept %3d'%(arm,n,len(glob.glob(d+'/*.json'))))
"
```

**Expect roughly:** `ctx4k_safe` keep ~31 · `ctx16k_safe` keep ~68.
Those kept rows are sound and will be reused — you only pay for the failures.

### T0.4 Smoke test — 3 contracts, ~3 min

**Do not skip this.** It is the cheapest possible check that the backend
survives real load before you commit two hours to it.

```bash
cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --arm smoketest --num-ctx 16384 --label safe --n 3 --max-tokens 12230 --sample-seed 0 --concurrency 2 2>&1 | tail -8
```

**PASS:** three lines showing `GO` or `NO-GO` with latencies.
**FAIL:** any `QUARANTINED` line → the backend is unhealthy. Restart Ollama
(T0.2) and retry. **Do not proceed to T1 on a failing smoke test.**

Clean up: `rm -rf ~/thirdeye/backend/eval/checkpoints/ctx_smoketest`

---

## T1 — Safe-class context ablation (P0, ~120 min)

**Why this is the blocker.** RQ3 is currently established on the vulnerable class
only. The safe class is where the paper's headline 29.9% false-alarm rate lives,
and the partial signal suggested a correct context window makes false alarms
*much* worse. Until this runs, the paper must say "29.9% may be an
under-estimate by an amount we do not bound" — which is the single most
attackable sentence in it.

**Design.** Two arms, identical contracts, one variable (`num_ctx`). Sampling is
nested and seeded, so `--n 120` is a strict superset of what already ran.
`--max-tokens 12230` is **not optional** — it reproduces the exact 176-contract
pool the existing sound checkpoints were drawn from. Omit it and you draw from a
190-contract pool, silently changing the population.

**Concurrency 3, not 4.** Last session died at 4. A slower run that completes
beats a fast one that quarantines 60% of itself.

```bash
cd ~/thirdeye/backend && setsid nohup sh -c '
~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --arm ctx4k_safe  --num-ctx 4096  --label safe --n 120 --max-tokens 12230 --sample-seed 0 --concurrency 3 --max-minutes 110 &&
~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --arm ctx16k_safe --num-ctx 16384 --label safe --n 120 --max-tokens 12230 --sample-seed 0 --concurrency 3 --max-minutes 40
' > ~/ctx_safe_v2.log 2>&1 & echo "started pid $!"
```

### T1.1 Monitor — run this every ~20 min

**The quarantine count is the number that matters.** If it climbs, the backend is
dying and the run is worthless.

```bash
cd ~/thirdeye/backend/eval/checkpoints && for a in ctx_ctx4k_safe ctx_ctx16k_safe; do echo "$a: sound=$(ls $a/*.json 2>/dev/null | wc -l) quarantined=$(ls $a/_transient/*.json 2>/dev/null | wc -l)"; done; echo "--- alive? ---"; pgrep -f run_ctx_ablation >/dev/null && echo RUNNING || echo "NOT RUNNING"; tail -3 ~/ctx_safe_v2.log
```

**Healthy:** `sound` climbing, `quarantined` flat.
**ABORT if `quarantined` climbs by more than ~5 between checks:**

```bash
pkill -f run_ctx_ablation; echo killed
```
then restart Ollama (T0.2), re-run T0.3, and restart T1. Nothing is lost.

### T1.2 Result

```bash
cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --compare ctx4k_safe ctx16k_safe 2>&1 | tee ~/ctx_safe_result.txt
```

**Read `scored in BOTH arms` first.** Everything else is meaningless if it is
small.

| scored in both | verdict |
|--:|---|
| **≥ 80** | publishable — this closes RQ3 |
| 40–79 | reportable with a stated power caveat |
| < 40 | **another outage. Do not cite. Check quarantine counts.** |

Send me the full output either way.

---

## T2 — Extend the vulnerable context arm (P1, ~40 min)

Only if T1 finished and you have >60 min left. RQ3's vulnerable arm is
**20 paired contracts** — the thinnest number carrying the most dramatic claim
in the paper (recall 12.5% → 81.2%). A reviewer will call it underpowered.

### T2.1 Recover the original sampling parameters first

The vulnerable arms (`ctx4k` / `ctx16k`) were run before parameters were
recorded. **Do not guess the ceiling** — extending under a different one breaks
the pairing.

```bash
cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python eval/reconstruct_ctx_sample.py ctx16k 2>&1 | tail -12
```

**Expect a `MATCH` block** printing `--max-tokens`, `--n`, `--sample-seed`.
**If it prints `NO EXACT MATCH`, stop and skip T2** — the arm cannot be safely
extended and I will need to look at it.

### T2.2 Extend using the recovered values

Substitute `<MT>` with the `--max-tokens` value T2.1 printed:

```bash
cd ~/thirdeye/backend && setsid nohup sh -c '
~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --arm ctx4k  --num-ctx 4096  --n 90 --max-tokens <MT> --sample-seed 0 --concurrency 3 --max-minutes 35 &&
~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --arm ctx16k --num-ctx 16384 --n 90 --max-tokens <MT> --sample-seed 0 --concurrency 3 --max-minutes 20
' > ~/ctx_vuln_v2.log 2>&1 & echo started

# then
cd ~/thirdeye/backend && ~/thirdeye/venv/bin/python -m eval.run_ctx_ablation --compare ctx4k ctx16k 2>&1 | tee ~/ctx_vuln_result.txt
```

---

## T3 — Fetch everything (must, 10 min)

**Run before you leave campus.** The box is on a private address and is
unreachable from anywhere else — anything left on it is stranded until the next
visit.

```bash
cd ~/thirdeye/backend/eval && tar czf ~/ctx_ckpts.tar.gz checkpoints/ctx_* && ls -lh ~/ctx_ckpts.tar.gz
```

Then pull these to the laptop with the MobaXterm SFTP panel (drag right→left):

- `~/ctx_safe_result.txt`
- `~/ctx_vuln_result.txt` (if T2 ran)
- `~/ctx_ckpts.tar.gz`
- `~/thirdeye/backend/eval/results/ctx_*.json`
- `~/ctx_safe_v2.log`

Drop them in `C:\Users\umara\Downloads\ThirdEye\backend\eval\results\dgx_fullscale\`.

---

## Not on the GPU — parallel work

These need no box and can run while T1 does.

| # | task | who | why |
|---|---|---|---|
| **N1** | Second rater on `docs/FP_REVIEW_SAMPLE.md` — same 21 contracts, independent verdicts, no peeking | Tarun or Lakshitha, ~1 h | The 70% label-noise bound is currently **self-assessed by the tool's own authors**. One independent rater and a Cohen's κ closes the single softest number in the paper. |
| **N2** | Read arXiv **2609.08765** (Berriche et al.) end-to-end | Umar | Our entire novelty claim rests on "their benchmarks are QA, so they have no negative class." I asserted that from the abstract and structure. If a reviewer knows that paper better than we do, that is where we lose. |
| **N3** | Read **2601.17833** (Heimdallr) and **2605.11163** (COMPSAC) end-to-end | Anvita | Both are cited but marked unverified in `RELATED_WORK.md`. Cited figures must come from the papers, not summaries. |
| **N4** | Settle author order | all four | Draft carries a proposal, not a decision. |

And for me, no GPU needed:

- **RQ4 diagnostic.** Cross-machine accuracy differs 0.722 vs 0.622 — ten points
  is more than nondeterminism should produce on identical digests. Either
  something systematic differs between hosts or the effect needs a different
  name. Re-scorable from the parity checkpoints.
- **RQ1 complexity controls.** Size already runs opposite to the effect
  (§5.1), but cyclomatic complexity and external-call count are uncontrolled.

---

## Decision table for the session

| situation | do this |
|---|---|
| Smoke test (T0.4) fails twice | **Abandon the session for GPU work.** Message me; it is a box problem, not a code problem. |
| T1 quarantine count climbing | Abort, restart Ollama, purge, restart T1 at `--concurrency 2` |
| T1 gives `scored in both` ≥ 80 | **Done — this is the win.** Skip T2 if tired, run T3, send me the output. |
| T1 gives `scored in both` < 40 | Do not cite anything from it. Run T3 anyway so I can diagnose. |
| T1 finished, >60 min left | Run T2 |
| < 20 min left, anything running | Let it run, do T3 now, leave the process alive |

---

## The one thing to remember

Last session produced a clean-looking result — FPR 9.7% → 54.8%, p = 0.0005 —
that was **entirely invalid**, because 145 of 176 rows were backend failures
silently checkpointed as results. The numbers looked better than the truth, not
worse. That is why T0.4 and T1.1 exist: **check the quarantine count, not the
p-value.**

## Pulling results off the box (do this at the END of every session)

Checkpoints are gitignored, so nothing on the box is backed up by committing.
On 2026-10-24 every result of the day -- both held-out seeds, the whole basis
for closing C3 -- lived ONLY on shared campus hardware for about seven hours.
The box is rebooted and re-auth'd by other people; treat it as scratch.

    ssh $THIRDEYE_DGX_HOST 'cd ~/thirdeye/backend/eval && tar czf - checkpoints'       > /tmp/dgx_ckpt.tgz
    mkdir -p backend/eval/checkpoints/_dgx_snapshot_$(date +%Y%m%d)
    tar xzf /tmp/dgx_ckpt.tgz -C backend/eval/checkpoints/_dgx_snapshot_$(date +%Y%m%d)

26 MB on the box compresses to ~500 KB, so this costs seconds.

**Pull into a DATED snapshot, never over the existing trees.** The local
`council/` and `seed0` trees are from earlier, different runs; the counts
differ because the runs differ. Merging to make two numbers agree destroys
data.

**Then read it back.** Re-score one known result off the copy and check it
matches the box. A backup that has never been read is not a backup; the
2026-10-24 snapshot was verified by reproducing C3's four dJ values exactly
(+1.4, -2.7, +2.6, +0.6).
