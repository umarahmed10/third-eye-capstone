# MSR 2027 submission sources

| file | what it is |
|---|---|
| `main.tex` | Full technical paper. Target: 10 pp body + 2 pp references. |
| `summary.tex` | Standalone 2-page summary of the same work. |
| `refs.bib` | Shared bibliography, 12 entries. |

Content is derived from `../docs/PAPER_MSR2027.md` and every figure traces to
`../docs/PAPER_FACTS.md`. Nothing here is typed from memory.

## Building

Both files need the ACM `acmart` class, which is **not** installed on the dev
laptop. Two options:

**Overleaf (recommended).** New project → *ACM Conference Proceedings Primary
Article Template*, then upload `main.tex`, `summary.tex`, `refs.bib` and delete
the template's own `.tex`. Compiles as-is.

**Locally**, with a TeX Live install that has `acmart`:

```bash
latexmk -pdf main.tex && latexmk -pdf summary.tex
```

## Before submitting

1. **Anonymise.** MSR technical papers are reviewed double-anonymous. Add
   `anonymous` to `\documentclass[sigconf,nonacm]{acmart}` and replace the GitHub
   URL in §10 / the summary's Artifact section with an anonymised archive
   (Zenodo supports this). The repository name identifies an author.
2. **Drop `nonacm`** once the submission is accepted and rights info is assigned.
3. **Check the page count after the first compile.** The source is ~5,600 words
   across 10 tables, which should land near 10 pages but has not been compiled
   here. If it runs long, `tab:rq2class` and `tab:splits` are the two most
   compressible.
4. **Settle author order.** The current order is the proposal from
   `../docs/PAPER_MSR2027.md`, not a decision.
5. **SRNs confirmed 2026-09-28.** Tarun is `PES2UG23CS644`. The `CS646` in the
   earlier markdown draft is wrong; do not copy it forward.

## Open items that change the text

- The safe-class arm of RQ3 is unsound (backend outage) and §5.3 currently says
  so explicitly. If the re-run in `../docs/RUNBOOK_CAMPUS.md` succeeds, that
  paragraph and the abstract's framing of the 29.9% figure both change.
- The 70% label-noise bound in §3.2 is self-assessed. A second rater would let
  §3.2 report a Cohen's κ instead of a caveat.
