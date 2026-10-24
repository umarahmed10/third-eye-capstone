"""Evaluation-integrity invariants.

Each test corresponds to a defect that once produced plausible-but-wrong
numbers (docs/DECISION_LOG.md Phases 0-1). They are cheap; the failures they
prevent cost multi-day reruns.
"""
import os, sys, json, random
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from eval import guard
from services.suppression import contract_profile, suppress, blocking_findings
from services.llm import preanalyze_code


class TestNestedSampling:
    """Defect 6: `items[:N]` clustered by filename, so a 'sample' was 263
    consecutive OpenZeppelin files. Sampling must be random AND nested."""

    @staticmethod
    def sample(items, n, seed="0:b:t"):
        r = random.Random(seed); it = list(items); r.shuffle(it); return it[:n]

    def test_smaller_sample_is_subset_of_larger(self):
        items = list(range(200))
        assert set(self.sample(items, 10)) <= set(self.sample(items, 25))
        assert set(self.sample(items, 25)) <= set(self.sample(items, 50))

    def test_sampling_is_deterministic(self):
        items = list(range(200))
        assert self.sample(items, 30) == self.sample(items, 30)

    def test_sample_is_not_the_first_n(self):
        items = list(range(200))
        assert self.sample(items, 20) != items[:20], "sampling collapsed back to first-N"

    def test_different_seeds_differ(self):
        items = list(range(200))
        assert self.sample(items, 20, "0:a:a") != self.sample(items, 20, "9:z:z")


class TestSuppressionIsRecallSafe:
    """Suppression may only drop findings the contract structurally cannot
    have. Anything broader costs recall (measured: the dos_gas rule did)."""

    LIB = "library L { function add(uint a, uint b) internal pure returns (uint) { return a + b; } }"
    VAULT = """contract V {
        mapping(address => uint) balances;
        function withdraw() public payable {
            (bool ok,) = msg.sender.call{value: balances[msg.sender]}("");
            require(ok);
            balances[msg.sender] = 0;
        }
    }"""

    def test_pure_library_is_detected_as_stateless(self):
        p = contract_profile(self.LIB, preanalyze_code(self.LIB))
        assert p["is_library"] and p["stateless_fund_free"]

    def test_vault_is_not_treated_as_stateless(self):
        p = contract_profile(self.VAULT, preanalyze_code(self.VAULT))
        assert not p["stateless_fund_free"], "a fund-holding contract must never be suppressed"

    def test_value_class_finding_suppressed_on_pure_library(self):
        kept, dropped = suppress([{"type": "reentrancy", "confidence": 0.9}],
                                 self.LIB, preanalyze_code(self.LIB))
        assert kept == [] and len(dropped) == 1
        assert "suppressed_reason" in dropped[0]

    def test_real_finding_on_a_vault_survives(self):
        kept, dropped = suppress([{"type": "reentrancy", "confidence": 0.9}],
                                 self.VAULT, preanalyze_code(self.VAULT))
        assert len(kept) == 1 and dropped == []

    def test_suppression_never_invents_findings(self):
        kept, dropped = suppress([], self.VAULT, preanalyze_code(self.VAULT))
        assert kept == [] and dropped == []

    def test_dropped_findings_are_returned_not_deleted(self):
        """Suppressed findings still reach the report; they only stop blocking."""
        f = [{"type": "reentrancy", "confidence": 0.9}]
        kept, dropped = suppress(f, self.LIB, preanalyze_code(self.LIB))
        assert len(kept) + len(dropped) == len(f)


class TestSeveritySplit:
    def test_low_severity_is_non_blocking(self):
        out = blocking_findings([{"severity": "low"}, {"severity": "high"}])
        assert len(out) == 1 and out[0]["severity"] == "high"

    def test_unknown_severity_still_blocks(self):
        # Fail-closed: an unlabelled finding must not be silently downgraded.
        assert len(blocking_findings([{"severity": ""}])) == 1


class TestCheckpointContract:
    """Defect 2/3: what may be treated as a terminal result.

    These tests call eval.guard.default_terminal. They used to RE-IMPLEMENT
    the rule in each test body and assert on their own arithmetic, so they
    could not fail: guard was never executed, and a regression there would
    have left all three green. A check that cannot fail is not a check --
    which is the defect this whole project is about, found in its own tests.
    """

    def test_go_with_errored_specialist_is_not_terminal(self):
        assert not guard.default_terminal({"verdict": "GO", "specialists_errored": 1}), \
            "a clean GO from a partial council must never be trusted"

    def test_nogo_with_errored_specialist_is_terminal(self):
        assert guard.default_terminal({"verdict": "NO-GO", "specialists_errored": 1}), \
            "a missing specialist cannot have invented the finding that was raised"

    def test_inconclusive_is_never_terminal(self):
        assert not guard.default_terminal({"verdict": "INCONCLUSIVE", "specialists_errored": 0})

    def test_clean_go_is_terminal(self):
        assert guard.default_terminal({"verdict": "GO", "specialists_errored": 0})

    def test_go_with_unrecorded_health_is_not_terminal(self):
        """The case the inline copy could never have caught. A row that never
        recorded council health is UNKNOWN, not healthy; .get() made it falsy
        and so indistinguishable from an intact council."""
        assert not guard.default_terminal({"verdict": "GO"}), \
            "a GO must prove an intact council, not merely fail to report a broken one"

    def test_nogo_with_unrecorded_health_is_still_terminal(self):
        """The asymmetry survives: a dead specialist can only suppress a
        flag, so an unrecorded council cannot have fabricated the NO-GO."""
        assert guard.default_terminal({"verdict": "NO-GO"})


def test_evidence_gate_counts_fabricated_quotes():
    """F2 was unanswerable because the gate discarded silently.

    Stored rows are POST-gate: every surviving finding's quote appears in the
    source BY CONSTRUCTION, so cached data can only ever show a 0% fabrication
    rate however often a model invents a quote. The gate must therefore report
    its own rejections, by reason."""
    from services import council

    code = "contract A { function f() public { uint x = 1; } }"
    base = {"severity": "high", "model": "m", "llm_error": False,
            "provider": "p", "property": ""}
    res = [
        {**base, "found": True, "confidence": 0.9, "type": "arithmetic",
         "evidence_quote": "uint x = 1;"},                      # kept
        {**base, "found": True, "confidence": 0.9, "type": "access_control",
         "evidence_quote": "selfdestruct(msg.sender);"},        # FABRICATED
        {**base, "found": True, "confidence": 0.9, "type": "dos_gas",
         "evidence_quote": ""},                                 # no quote
        {**base, "found": False, "confidence": 0.0, "type": "proxy",
         "evidence_quote": ""},                                 # not found
        {**base, "found": True, "confidence": 0.01, "type": "mev",
         "evidence_quote": "uint x = 1;"},                      # below bar
    ]
    kept = council._aggregate(res, code)
    assert [k["type"] for k in kept] == ["arithmetic"]

    g = council._LAST_GATE
    assert g["proposed"] == 5
    assert g["not_found"] == 1
    assert g["below_conf"] == 1
    assert g["quote_empty"] == 1
    # The number F2 asks for.
    assert g["quote_not_in_code"] == 1
    # And a sample, so the claim is inspectable and not just a count.
    assert [s["role"] for s in g["fabricated_sample"]] == ["access_control"]
    assert g["fabricated_sample"][0]["quote"] == "selfdestruct(msg.sender);"


def test_gate_sample_is_bounded():
    """A per-contract diagnostic must not grow without limit."""
    from services import council

    code = "contract A {}"
    res = [{"found": True, "confidence": 0.9, "type": f"r{i}", "severity": "high",
            "model": "m", "llm_error": False, "provider": "p", "property": "",
            "evidence_quote": f"fabricated line {i};"} for i in range(50)]
    council._aggregate(res, code)
    assert council._LAST_GATE["quote_not_in_code"] == 50
    assert len(council._LAST_GATE["fabricated_sample"]) == 8


def test_load_checkpoints_finds_seeded_rows(tmp_path, monkeypatch):
    """A seeded baseline run must not read as an absent one.

    run_baselines --seed N writes <baseline>/<dataset>/seedN/. The loader
    globbed one level above that and returned {}, which main() printed as
    "no checkpoints on this machine" -- hiding ~580 completed rows including
    21h of council GPU time."""
    import json as _json
    from eval import build_reports

    root = tmp_path / "checkpoints"
    d = root / "council" / "smartbugs_curated" / "seed0"
    d.mkdir(parents=True)
    (d / "abc.json").write_text(_json.dumps({"status": "ok", "predicted_label": "vulnerable"}))
    monkeypatch.setattr(build_reports, "CHECKPOINT_ROOT", root)

    got = build_reports._load_checkpoints("council", "smartbugs_curated")
    assert set(got) == {"abc"}, "seeded rows must load"


def test_load_checkpoints_does_not_pool_seeds(tmp_path, monkeypatch, capsys):
    """Two seeds hold rows for the SAME contract, so pooling would let one
    silently overwrite the other and score a mixture no run produced."""
    import json as _json
    from eval import build_reports

    root = tmp_path / "checkpoints"
    for s, label in ((0, "vulnerable"), (1, "likely_safe")):
        d = root / "council" / "smartbugs_curated" / f"seed{s}"
        d.mkdir(parents=True)
        (d / "abc.json").write_text(_json.dumps({"status": "ok", "predicted_label": label}))
    monkeypatch.setattr(build_reports, "CHECKPOINT_ROOT", root)

    got = build_reports._load_checkpoints("council", "smartbugs_curated")
    # Lowest seed, explicitly, and it must say so rather than pick quietly.
    assert got["abc"]["predicted_label"] == "vulnerable"
    assert "not pooled" in capsys.readouterr().out

    got1 = build_reports._load_checkpoints("council", "smartbugs_curated", seed=1)
    assert got1["abc"]["predicted_label"] == "likely_safe"


def test_checkpoint_lookup_survives_id_sanitizing(tmp_path, monkeypatch):
    """Filenames are _safe_id(contract_id); lookups used the raw id.

    Every sb:/w3b: id therefore missed its own checkpoint. smartbugs_curated
    ids need no sanitizing, so one dataset worked and the bug stayed hidden
    while access_control_slice scored 0 of 307 rows."""
    import json as _json
    from eval import build_reports
    from eval.run_baselines import _safe_id

    raw = "sb:0xdeadbeef.sol"
    assert _safe_id(raw) != raw, "precondition: this id needs sanitizing"

    root = tmp_path / "checkpoints"
    d = root / "council" / "access_control_slice" / "seed0"
    d.mkdir(parents=True)
    (d / f"{_safe_id(raw)}.json").write_text(
        _json.dumps({"status": "ok", "predicted_label": "vulnerable",
                     "predicted_categories": ["access_control"]}))
    monkeypatch.setattr(build_reports, "CHECKPOINT_ROOT", root)

    ck = build_reports._load_checkpoints("council", "access_control_slice")
    assert ck.get(_safe_id(raw)) is not None
    assert ck.get(raw) is None, "stored under the sanitized name, as run_baselines writes it"

    # The REAL EvalItem, not a stub. A hand-rolled fake that drifts from the
    # schema is the same defect this test exists to catch, one layer up: the
    # first version of this test used a stub without vuln_categories and
    # failed inside metrics rather than testing the lookup.
    from eval.schema import EvalItem

    item = EvalItem(
        contract_id=raw,
        source_dataset="access_control_slice",
        code_paths=[],
        ground_truth_label="vulnerable",
    )
    _, coverage = build_reports.build_baseline_dataset_report(
        "council", "access_control_slice", [item])
    assert coverage["n_ok"] == 1, "a sanitized id must resolve to its own row"
    assert coverage["status_counts"].get("missing", 0) == 0
