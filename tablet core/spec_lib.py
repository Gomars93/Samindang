"""Shared YAML loading and show_when/when condition evaluation for the
Samindang tablet core v1.2 validator and simulator.

v1.2 replaces v1.1's undefined "what does an absent field evaluate to"
question with an explicit value_semantics model:
  - missing (field never produced for this profile): no-match on every
    operator except not_exists, INCLUDING neq.
  - null (field produced but explicitly empty): matches eq/neq/in/between/
    regex under ordinary equality (None only equals None).
  - exists / not_exists: new operators that test presence, not value.
A profile dict models "missing" as a genuinely absent key (not a key with
value None) so the two are distinguishable.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

_MISSING = object()


def load_spec(survey_path: str | Path, rules_path: str | Path) -> tuple[dict, dict]:
    survey = yaml.safe_load(Path(survey_path).read_text(encoding="utf-8"))
    rules = yaml.safe_load(Path(rules_path).read_text(encoding="utf-8"))
    return survey, rules


def iter_conditions(node: dict | None):
    """Yield every atomic {field, op, value} leaf in a show_when/when tree."""
    if not node:
        return
    if "all" in node or "any" in node:
        for child in node.get("all", []) + node.get("any", []):
            yield from iter_conditions(child)
    elif "field" in node:
        yield node


def referenced_fields(node: dict | None) -> set[str]:
    return {c["field"] for c in iter_conditions(node)}


def eval_condition(cond: dict, profile: dict) -> bool:
    """Evaluate one atomic condition per survey_core_v1.4.yaml:value_semantics.

    missing (field not a key in `profile`) no-matches every operator except
    not_exists — per `missing_with_neq_rule`, this includes neq. null (key
    present with value None) participates in ordinary equality instead.
    """
    field, op = cond["field"], cond["op"]
    present = field in profile
    if op == "exists":
        return present
    if op == "not_exists":
        return not present
    if not present:
        return False
    actual = profile[field]
    value = cond.get("value")
    if op == "eq":
        return actual == value
    if op == "neq":
        return actual != value
    if op == "in":
        return actual in value
    if op == "between":
        lo, hi = value
        return actual is not None and lo <= actual <= hi
    if op == "regex":
        return actual is not None and re.match(value, str(actual)) is not None
    raise ValueError(f"unknown operator {op!r} in condition {cond!r}")


def eval_tree(node: dict | None, profile: dict) -> bool:
    if not node:
        return True
    if "all" in node:
        return all(eval_tree(c, profile) for c in node["all"])
    if "any" in node:
        return any(eval_tree(c, profile) for c in node["any"])
    if "field" in node:
        return eval_condition(node, profile)
    raise ValueError(f"malformed condition node {node!r}")


def question_output_fields(q: dict) -> set[str]:
    if "output_field" in q:
        return {q["output_field"]}
    if "outputs" in q:
        return set(q["outputs"].values())
    return set()


def question_domain(q: dict) -> set[Any] | None:
    """Best-effort enumeration of values a question's output can take.
    None means "unbounded/unknown" (free text) — callers must treat that
    as a gap, not as an empty domain."""
    if "choices" in q:
        return {c["value"] for c in q["choices"]}
    if "choice_sets" in q:
        vals: set[Any] = set()
        for cs in q["choice_sets"].values():
            vals |= {c["value"] for c in cs}
        return vals
    if q.get("type") == "numeric_scale" and "scale" in q:
        return set(range(q["scale"]["min"], q["scale"]["max"] + 1))
    if q.get("type") == "multi_toggle_group":
        vals = set()
        for item in q.get("items", []):
            vals |= {c["value"] for c in item.get("choices", [])}
        return vals
    return None


def multi_toggle_item_domains(q: dict) -> dict[str, set]:
    """Per-item domain for a multi_toggle_group question (each item is its
    own output field with its own choice list), unlike question_domain()
    which unions everything into one set."""
    if q.get("type") != "multi_toggle_group":
        return {}
    return {item["id"]: {c["value"] for c in item.get("choices", [])} for item in q.get("items", [])}


def all_questions(survey: dict) -> list[dict]:
    return sorted(survey.get("questions", []), key=lambda q: q["order"])


def known_producers(survey: dict, rules: dict) -> dict[str, set[str]]:
    """field -> set of provenance labels (one entry per declaration site).
    A field with >1 provenance label has more than one thing claiming to
    produce it (see v1.2 review finding N-11 / F1 residue)."""
    producers: dict[str, set[str]] = {}

    def add(field: str, label: str):
        producers.setdefault(field, set()).add(label)

    for q in survey.get("questions", []):
        for f in question_output_fields(q):
            add(f, f"question:{q['id']}")

    rc = survey.get("runtime_context_contract", {})
    for f in rc.get("external_fields", {}):
        add(f, "runtime_context_contract.external_fields")
    for f in rc.get("engine_state", {}):
        add(f, "runtime_context_contract.engine_state")

    # computed_fields: deterministic functions of other fields, declared by
    # a bound micro-module's own YAML (see load_module_question_set) and
    # merged onto the survey dict under this key before known_producers is
    # called — not a question output, but still a legitimate producer.
    for f in survey.get("computed_fields", {}):
        add(f, "computed_field")

    for module_id, module in rules.get("module_contracts", {}).items():
        for f in module.get("outputs", []):
            add(f, f"module_contracts:{module_id}")

    return producers


def load_module_question_set(path: str | Path) -> dict:
    """Load a bound micro-module's own question-set YAML (e.g. LBP_V1's
    lbp_v1.0.yaml) — same shape as the core survey (questions/, plus its own
    computed_fields/entry_when)."""
    return yaml.safe_load(Path(path).read_text(encoding="utf-8"))


def merge_module_into_survey(survey: dict, module: dict) -> dict:
    """Combine core questions with one bound module's questions/computed_fields
    into a single dict shaped like `survey`, so every existing check
    (duplicate ids, unknown fields, cycles, reachability...) sees one
    unified question set instead of needing module-aware special-casing.

    Each module question's show_when is AND-combined with the module's own
    entry_when — a module question has no domain-scoping of its own (the
    engine only ever invokes it after routing into the module), so without
    this fold every core-only check (duplicate/reachability/cycle/timing
    floor) would incorrectly treat LBP questions as reachable from any
    domain instead of only MSK+LBP."""
    entry_when = module.get("entry_when")
    merged_questions = list(survey.get("questions", []))
    for q in module.get("questions", []):
        q = dict(q)
        if entry_when:
            q["show_when"] = {"all": [entry_when, q["show_when"]]} if q.get("show_when") else entry_when
        merged_questions.append(q)

    merged = dict(survey)
    merged["questions"] = merged_questions
    merged["computed_fields"] = {**survey.get("computed_fields", {}), **module.get("computed_fields", {})}
    return merged
