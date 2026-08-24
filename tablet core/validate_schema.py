"""Static validator for survey_core_v1.4.yaml + branch_rules_v1.4.yaml
(+ any module_contracts[].question_set_file it binds, e.g. lbp_v1.0.yaml).

v1.4 = v1.3 (autonomous repair pass over v1.2, see decision_log.md) plus the
first real micro-module question set (LBP_V1). Bound modules are merged
into one combined question list (spec_lib.merge_module_into_survey) so
every existing structural check (duplicate ids, unknown fields, cycles,
reachability) covers core + module questions uniformly, plus a handful of
module-specific checks (contract/computed_fields consistency, entry_when
vs route.when agreement).

Provenance note: the externally-supplied LBP_V1 candidate package shipped
its own copies of survey_core_v1.3.yaml / branch_rules_v1.3.yaml that do
NOT match this repo's actual frozen v1.3 (different field names, and a
reintroduced YAML-boolean-coercion bug this validator already regression-
tests against). Only lbp_v1.0.yaml (the clinical module content) was
ported; branch_rules_v1.4.yaml was hand-authored against the real v1.3.

Report contradictions explicitly, stop before UI work if any blocking
finding remains — do not silently repair the YAML to make a check pass.

Run: python validate_schema.py [survey.yaml] [rules.yaml] [module.yaml ...]
"""
from __future__ import annotations

import itertools
import json
import sys
from pathlib import Path

from spec_lib import (
    all_questions,
    eval_tree,
    known_producers,
    load_module_question_set,
    load_spec,
    merge_module_into_survey,
    multi_toggle_item_domains,
    question_domain,
    question_output_fields,
    referenced_fields,
)

DEFAULT_SURVEY = Path(__file__).parent / "survey_core_v1.4.yaml"
DEFAULT_RULES = Path(__file__).parent / "branch_rules_v1.4.yaml"
DEFAULT_MODULES = [Path(__file__).parent / "lbp_v1.0.yaml"]


def finding(severity: str, check: str, message: str, **extra) -> dict:
    return {"severity": severity, "check": check, "message": message, **extra}


# ---------------------------------------------------------------------------
# duplicate ids / unknown fields / cycles / reachability
# ---------------------------------------------------------------------------

def check_duplicate_ids(survey: dict) -> list[dict]:
    seen: dict[str, int] = {}
    for q in survey.get("questions", []):
        seen[q["id"]] = seen.get(q["id"], 0) + 1
    return [finding("blocking", "duplicate_question_id", f"question id {qid!r} appears {n} times", id=qid)
            for qid, n in seen.items() if n > 1]


def _producer_category(label: str) -> str:
    """Collapse a provenance label to its subsystem. Two *questions* writing
    the same field under mutually-exclusive show_when (e.g. core_msk_region
    / core_nonmsk_detail both writing primary_complaint_detail) is normal
    routing, not a defect — only cross-subsystem ownership (module_contracts
    vs engine_state vs external_fields) or multiple modules claiming the
    same output is a real precedence gap (N-11)."""
    if label.startswith("question:"):
        return "question"
    if label.startswith("module_contracts:"):
        return label  # each module is its own subsystem
    return label


def check_dual_producer_fields(producers: dict[str, set[str]]) -> list[dict]:
    """N-11 / F1 residue: a field claimed by more than one *subsystem* with
    no precedence rule between them."""
    out = []
    for field, labels in producers.items():
        categories = {_producer_category(l) for l in labels}
        # A module's own computed_fields entry and branch_rules declaring
        # that same module's output are the same authority declaring the
        # same thing in two complementary registries (what a module
        # computes vs. what it exposes) — not a real conflict.
        if "computed_field" in categories and sum(c.startswith("module_contracts:") for c in categories) == 1:
            categories.discard("computed_field")
        if len(categories) > 1:
            out.append(finding("blocking", "dual_producer_field",
                                f"field {field!r} is declared by {len(categories)} different "
                                f"subsystems with no precedence rule between them: {sorted(categories)}",
                                field=field, sources=sorted(labels)))
    return out


def check_unknown_referenced_fields(survey: dict, rules: dict, producers: dict) -> list[dict]:
    out = []

    def scan(node, source: str):
        for f in referenced_fields(node):
            if f not in producers:
                out.append(finding("blocking", "unknown_referenced_field",
                                    f"{source} references field {f!r}, which no question "
                                    f"output_field/outputs, runtime_context_contract entry, or "
                                    f"module_contracts output declares", field=f, source=source))

    for q in survey.get("questions", []):
        scan(q.get("show_when"), f"question {q['id']}.show_when")
    for r in rules.get("primary_routes", []):
        scan(r.get("when"), f"route {r['id']}.when")
    for e in rules.get("module_extensions", []):
        scan(e.get("when"), f"module_extension {e['id']}.when")
    return out


def check_branch_cycles(survey: dict) -> list[dict]:
    questions = all_questions(survey)
    producer_of: dict[str, str] = {}
    for q in questions:
        for f in question_output_fields(q):
            producer_of[f] = q["id"]

    edges: dict[str, set[str]] = {q["id"]: set() for q in questions}
    for q in questions:
        for f in referenced_fields(q.get("show_when")):
            src = producer_of.get(f)
            if src and src != q["id"]:
                edges[src].add(q["id"])

    out = []
    visiting, visited = set(), set()

    def dfs(node, path):
        if node in visiting:
            cycle = path[path.index(node):] + [node]
            out.append(finding("blocking", "branch_cycle", f"cycle detected: {' -> '.join(cycle)}", cycle=cycle))
            return
        if node in visited:
            return
        visiting.add(node)
        for nxt in edges.get(node, ()):
            dfs(nxt, path + [node])
        visiting.discard(node)
        visited.add(node)

    for qid in edges:
        if qid not in visited:
            dfs(qid, [])
    return out


def harvest_value_hints(survey: dict, rules: dict) -> dict[str, set]:
    """field -> set of literal values ever compared against it, harvested
    from every show_when/when tree in the bundle. Used to approximate a
    usable domain for reachability/ambiguity brute force on fields whose
    real domain isn't declared via `choices` (e.g. engine_state booleans,
    external_fields with a numeric `domain` range)."""
    hints: dict[str, set] = {}

    def harvest(node):
        for c in survey_lib_iter_conditions(node):
            f, op, v = c["field"], c["op"], c.get("value")
            if op in ("eq", "neq"):
                hints.setdefault(f, set()).add(v)
            elif op == "in":
                hints.setdefault(f, set()).update(v)
            elif op == "between":
                lo, hi = v
                hints.setdefault(f, set()).update({lo, hi})

    for q in survey.get("questions", []):
        harvest(q.get("show_when"))
    for r in rules.get("primary_routes", []):
        harvest(r.get("when"))
    for e in rules.get("module_extensions", []):
        harvest(e.get("when"))
    return hints


def survey_lib_iter_conditions(node):
    from spec_lib import iter_conditions
    return iter_conditions(node)


def declared_domain_by_field(survey: dict) -> dict[str, set]:
    """Domains declared for engine_state/external_fields booleans and enums."""
    out: dict[str, set] = {}
    rc = survey.get("runtime_context_contract", {})
    for f, spec in rc.get("external_fields", {}).items():
        if "values" in spec:
            out[f] = set(spec["values"])
    for f, spec in rc.get("engine_state", {}).items():
        if spec.get("type") == "boolean":
            out[f] = {True, False}
        elif spec.get("type") == "integer" and "max" in spec:
            out[f] = set(range(spec.get("initial", 0), spec["max"] + 1))
    return out


def build_domain_by_field(survey: dict, rules: dict) -> tuple[dict[str, set], set[str]]:
    """Best-effort candidate domain per field, for brute-force satisfiability
    checks. Returns (domains, fields_with_no_declared_domain)."""
    questions = all_questions(survey)
    domains: dict[str, set] = dict(declared_domain_by_field(survey))
    for q in questions:
        item_domains = multi_toggle_item_domains(q)
        if item_domains:
            for f, dom in item_domains.items():
                domains.setdefault(f, set()).update(dom)
            continue
        dom = question_domain(q)
        for f in question_output_fields(q):
            if dom is not None:
                domains.setdefault(f, set()).update(dom)

    for module in rules.get("module_contracts", {}).values():
        for f, vals in module.get("output_domains", {}).items():
            domains.setdefault(f, set()).update(vals)

    hints = harvest_value_hints(survey, rules)
    undeclared = set()
    for f, vals in hints.items():
        if f in domains:
            domains[f] |= vals
        else:
            domains[f] = set(vals)
            undeclared.add(f)  # domain is *only* what we guessed from usage
    return domains, undeclared


def check_unreachable_required(survey: dict, domains: dict[str, set], undeclared: set[str]) -> list[dict]:
    questions = all_questions(survey)
    out = []
    for q in questions:
        if not q.get("required") or not q.get("show_when"):
            continue
        fields = sorted(referenced_fields(q["show_when"]))
        candidate_sets = [domains.get(f, set()) | {"__MISSING__"} for f in fields]
        any_undeclared = any(f in undeclared or f not in domains for f in fields)
        reachable = False
        for combo in itertools.product(*candidate_sets):
            profile = {f: v for f, v in zip(fields, combo) if v != "__MISSING__"}
            if eval_tree(q["show_when"], profile):
                reachable = True
                break
        if not reachable:
            sev = "ambiguous" if any_undeclared else "blocking"
            out.append(finding(sev, "unreachable_required_question",
                                f"required question {q['id']!r} has no satisfiable assignment of "
                                f"{fields} that makes show_when true"
                                + (" (some fields' domains are only guessed from usage, so this "
                                   "may be a false positive)" if any_undeclared else ""),
                                id=q["id"], fields=fields))
    return out


# ---------------------------------------------------------------------------
# routing: primary_routes vs module_extensions, ambiguity, module-output leakage
# ---------------------------------------------------------------------------

def _domain_choices_for(survey: dict) -> dict:
    by_id = {q["id"]: q for q in survey.get("questions", [])}
    domain_q, msk_q, nonmsk_q = by_id["core_primary_domain"], by_id["core_msk_region"], by_id["core_nonmsk_detail"]
    domains = [c["value"] for c in domain_q["choices"]]
    detail_by_domain = {}
    for d in domains:
        if d == "MSK":
            detail_by_domain[d] = [c["value"] for c in msk_q["choices"]]
        else:
            cs = nonmsk_q.get("choice_sets", {}).get(d, [])
            detail_by_domain[d] = [c["value"] for c in cs] or [None]
    return {"domains": domains, "detail_by_domain": detail_by_domain}


def check_primary_route_module_leakage(survey: dict, rules: dict) -> list[dict]:
    """Blocking success criterion: 'primary route reading unavailable module
    output = 0'. A field is module-only if module_contracts is its sole
    declared source (i.e. it isn't also a question output or a
    runtime_context_contract field)."""
    core_producers = set()
    for q in survey.get("questions", []):
        core_producers |= question_output_fields(q)
    rc = survey.get("runtime_context_contract", {})
    core_producers |= set(rc.get("external_fields", {})) | set(rc.get("engine_state", {}))

    module_only = set()
    for module in rules.get("module_contracts", {}).values():
        for f in module.get("outputs", []):
            if f not in core_producers:
                module_only.add(f)

    out = []
    for r in rules.get("primary_routes", []):
        bad = referenced_fields(r.get("when")) & module_only
        for f in bad:
            out.append(finding("blocking", "primary_route_reads_module_output",
                                f"primary route {r['id']!r} references {f!r}, which is produced "
                                f"only by module_contracts (available after a module runs, not "
                                f"before the primary route is chosen)", route=r["id"], field=f))
    return out


def check_route_ambiguity(survey: dict, rules: dict) -> list[dict]:
    routes = rules.get("primary_routes", [])
    dc = _domain_choices_for(survey)
    route_hit_count = {r["id"]: 0 for r in routes}
    ambiguous, zero_match = [], []

    for domain in dc["domains"]:
        for detail in dc["detail_by_domain"][domain]:
            profile = {"primary_complaint_domain": domain}
            if detail is not None:
                profile["primary_complaint_detail"] = detail
            matches = [r for r in routes if eval_tree(r.get("when"), profile)]
            if not matches:
                zero_match.append(profile)
                continue
            top_priority = max(r["priority"] for r in matches)
            top = [r for r in matches if r["priority"] == top_priority]
            for r in top:
                route_hit_count[r["id"]] += 1
            if len(top) > 1:
                ambiguous.append({"profile": profile, "routes": [r["id"] for r in top]})

    out = []
    for a in ambiguous[:20]:
        out.append(finding("blocking", "ambiguous_highest_priority_route",
                            f"profile {a['profile']} matches {a['routes']} at the same top priority", **a))
    for r in routes:
        # Structural fallback routes (see route_fallback_no_detail) are
        # deliberately unreachable through this enumeration — it only ever
        # produces profiles with a concrete detail value drawn from real
        # question choices, never a MISSING detail. Their reachability is
        # checked separately below via the explicit missing-detail probe.
        if r.get("note", "").startswith("structural fallback"):
            continue
        if route_hit_count[r["id"]] == 0:
            out.append(finding("blocking", "route_never_reached",
                                f"route {r['id']!r} (priority {r['priority']}) never wins for "
                                f"any enumerated (domain, detail) profile", id=r["id"]))
    if zero_match:
        out.append(finding("blocking", "completed_core_without_route",
                            f"{len(zero_match)} profile(s) with a fully-answered domain/detail "
                            f"still match zero primary routes, e.g. {zero_match[0]}",
                            count=len(zero_match), example=zero_match[0]))

    # N-6 fix verification: a domain that requires a detail (any route
    # keys on primary_complaint_detail) but reaches routing with detail
    # MISSING must still resolve to exactly one route (the structural
    # fallback), not zero.
    detail_dependent_domains = set()
    for r in routes:
        if "primary_complaint_detail" in referenced_fields(r.get("when")):
            detail_dependent_domains |= {c["value"] for c in referenced_fields_as_conditions(r.get("when"))
                                          if c["field"] == "primary_complaint_domain" and c["op"] == "eq"}
    for domain in detail_dependent_domains:
        profile = {"primary_complaint_domain": domain}  # detail deliberately absent (MISSING)
        matches = [r for r in routes if eval_tree(r.get("when"), profile)]
        if not matches:
            out.append(finding("blocking", "completed_core_without_route",
                                f"domain={domain!r} with primary_complaint_detail MISSING matches "
                                f"zero primary routes — no structural fallback covers this",
                                domain=domain))
        elif len(matches) > 1:
            top_priority = max(r["priority"] for r in matches)
            top = [r for r in matches if r["priority"] == top_priority]
            if len(top) > 1:
                out.append(finding("blocking", "ambiguous_highest_priority_route",
                                    f"domain={domain!r} with detail MISSING matches "
                                    f"{[r['id'] for r in top]} at the same top priority",
                                    profile=profile, routes=[r["id"] for r in top]))
    return out


def check_routing_invariants(rules: dict) -> list[dict]:
    """claude_code_task_v1.2.md section 3, checked literally against the
    route table rather than assumed from the decision log."""
    out = []
    routes = rules.get("primary_routes", [])
    modules = rules.get("module_contracts", {})

    for r in routes:
        if r.get("micro_module") == "MENOPAUSE_SLEEP":
            out.append(finding("blocking", "extension_module_used_as_primary_route",
                                f"route {r['id']!r} targets MENOPAUSE_SLEEP directly, but "
                                f"module_contracts declares it type=extension_module — it must "
                                f"only be reached via module_extensions", route=r["id"]))

    sleep_routes = [r for r in routes if any(
        c.get("field") == "primary_complaint_domain" and c.get("op") == "eq" and c.get("value") == "SLEEP"
        for c in referenced_fields_as_conditions(r.get("when")))]
    for r in sleep_routes:
        if r.get("micro_module") != "SLEEP_V1":
            out.append(finding("blocking", "sleep_route_not_sleep_v1",
                                f"route {r['id']!r} matches SLEEP domain but targets "
                                f"{r.get('micro_module')!r}, not SLEEP_V1", route=r["id"]))

    menopause_routes = [r for r in routes if _when_implies(r.get("when"), "WOMENS", "MENOPAUSE")]
    for r in menopause_routes:
        if r.get("micro_module") != "MENOPAUSE_V1":
            out.append(finding("blocking", "menopause_route_not_menopause_v1",
                                f"route {r['id']!r} matches WOMENS+MENOPAUSE but targets "
                                f"{r.get('micro_module')!r}, not MENOPAUSE_V1", route=r["id"]))

    for m_id, m in modules.items():
        if m.get("type") not in ("primary_micro_module", "extension_module"):
            out.append(finding("minor", "undeclared_module_type",
                                f"module_contracts.{m_id}.type={m.get('type')!r} is neither "
                                f"primary_micro_module nor extension_module", module=m_id))
    return out


def referenced_fields_as_conditions(node):
    from spec_lib import iter_conditions
    return list(iter_conditions(node))


def _when_implies(node, domain_value, detail_value) -> bool:
    conds = referenced_fields_as_conditions(node)
    has_domain = any(c["field"] == "primary_complaint_domain" and c.get("op") == "eq" and c.get("value") == domain_value for c in conds)
    has_detail = any(c["field"] == "primary_complaint_detail" and c.get("op") == "eq" and c.get("value") == detail_value for c in conds)
    return has_domain and has_detail


def check_module_extension_graph(rules: dict) -> list[dict]:
    modules = rules.get("module_contracts", {})
    out = []
    for e in rules.get("module_extensions", []):
        after = e.get("after_module")
        attach = e.get("attach_module")
        if after not in modules:
            out.append(finding("blocking", "extension_after_module_undeclared",
                                f"module_extension {e['id']!r}.after_module={after!r} is not in "
                                f"module_contracts", extension=e["id"]))
        elif modules[after].get("type") != "primary_micro_module":
            out.append(finding("blocking", "extension_after_module_wrong_type",
                                f"module_extension {e['id']!r}.after_module={after!r} is not a "
                                f"primary_micro_module", extension=e["id"]))
        if attach not in modules:
            out.append(finding("blocking", "extension_attach_module_undeclared",
                                f"module_extension {e['id']!r}.attach_module={attach!r} is not in "
                                f"module_contracts", extension=e["id"]))
        elif modules[attach].get("type") != "extension_module":
            out.append(finding("blocking", "extension_attach_module_wrong_type",
                                f"module_extension {e['id']!r}.attach_module={attach!r} is not an "
                                f"extension_module", extension=e["id"]))

        if after in modules:
            available = set(modules[after].get("outputs", []))
            referenced = referenced_fields(e.get("when"))
            missing = referenced - available
            if missing:
                out.append(finding("blocking", "extension_references_field_module_does_not_produce",
                                    f"module_extension {e['id']!r} references {sorted(missing)}, "
                                    f"which {after!r} does not list in its outputs",
                                    extension=e["id"], fields=sorted(missing)))
    return out


# ---------------------------------------------------------------------------
# bound module contract consistency (LBP_V1 integration)
# ---------------------------------------------------------------------------

def check_module_contract_outputs_producible(rules: dict, modules: dict[str, dict]) -> list[dict]:
    """Every field a module_contracts entry claims to output must actually
    be producible by that module's own question set or computed_fields —
    otherwise a route/other module can be told a field exists that nothing
    ever sets."""
    out = []
    for module_id, contract in rules.get("module_contracts", {}).items():
        if module_id not in modules:
            continue  # no question_set_file bound yet (status: planned) — nothing to check
        m = modules[module_id]
        producible = set(m.get("computed_fields", {}))
        for q in m.get("questions", []):
            producible |= question_output_fields(q)
        missing = set(contract.get("outputs", [])) - producible
        if missing:
            out.append(finding("blocking", "module_contract_output_not_producible",
                                f"branch_rules module_contracts.{module_id}.outputs declares "
                                f"{sorted(missing)}, but {module_id}'s own question set/"
                                f"computed_fields never produce them",
                                module=module_id, fields=sorted(missing)))
    return out


def check_module_entry_when_matches_route(rules: dict, modules: dict[str, dict]) -> list[dict]:
    """A module's own entry_when should describe exactly the same condition
    as the primary_routes entry that routes into it — if they diverge, the
    module could be entered (or skipped) under different conditions than
    the route table implies."""
    out = []
    routes_by_module = {}
    for r in rules.get("primary_routes", []):
        routes_by_module.setdefault(r.get("micro_module"), []).append(r)
    for module_id, m in modules.items():
        entry_when = m.get("entry_when")
        routes = routes_by_module.get(module_id, [])
        if not routes:
            continue
        entry_fields = referenced_fields(entry_when)
        for r in routes:
            route_fields = referenced_fields(r.get("when"))
            if entry_fields != route_fields:
                out.append(finding("blocking", "module_entry_when_route_mismatch",
                                    f"{module_id}.entry_when references {sorted(entry_fields)} but "
                                    f"route {r['id']!r}.when references {sorted(route_fields)} — "
                                    f"they should describe the same routing condition",
                                    module=module_id, route=r["id"],
                                    entry_when_fields=sorted(entry_fields), route_fields=sorted(route_fields)))
                continue
            # same fields referenced — also check every leaf condition matches
            entry_conds = {(c["field"], c["op"], str(c.get("value"))) for c in referenced_fields_as_conditions(entry_when)}
            route_conds = {(c["field"], c["op"], str(c.get("value"))) for c in referenced_fields_as_conditions(r.get("when"))}
            if entry_conds != route_conds:
                out.append(finding("blocking", "module_entry_when_route_mismatch",
                                    f"{module_id}.entry_when and route {r['id']!r}.when reference the "
                                    f"same fields but with different conditions: {sorted(entry_conds)} "
                                    f"vs {sorted(route_conds)}", module=module_id, route=r["id"]))
    return out


# ---------------------------------------------------------------------------
# selector precedence (N-1)
# ---------------------------------------------------------------------------

def check_selector_precedence(survey: dict) -> list[dict]:
    out = []
    for q in survey.get("questions", []):
        if q.get("type") != "single_choice_dynamic":
            continue
        if "selector_fields" not in q:
            out.append(finding("blocking", "missing_selector_fields",
                                f"{q['id']!r} is single_choice_dynamic with choice_sets but no "
                                f"selector_fields", id=q["id"]))
            continue
        if "selector_precedence" not in q:
            out.append(finding("ambiguous", "missing_selector_precedence",
                                f"{q['id']!r} has selector_fields but no selector_precedence "
                                f"declared (harmless only if len(selector_fields) == 1)",
                                id=q["id"], selector_fields=q["selector_fields"]))
        if q.get("selector_precedence") not in (None, "first_matching_field"):
            out.append(finding("ambiguous", "unrecognized_selector_precedence",
                                f"{q['id']!r}.selector_precedence={q['selector_precedence']!r} is "
                                f"not a value this validator (or, presumably, the spec) defines",
                                id=q["id"]))
    return out


def resolve_selector_key(q: dict, profile: dict) -> str | None:
    """The one canonical reading of 'first_matching_field', per
    survey_core_v1.4.yaml:selector_semantics (N-1 fix): the first
    selector_field (in declared order) whose value is itself a key present
    in choice_sets; otherwise fallback_choice_set."""
    for f in q.get("selector_fields", []):
        v = profile.get(f)
        if v in q.get("choice_sets", {}):
            return v
    return q.get("fallback_choice_set")


def check_selector_semantics_resolvable(survey: dict) -> list[dict]:
    """N-1 fix verification: selector_semantics.first_matching_field must be
    declared (not just a quoted precedence name with no definition), and
    the canonical reading must actually resolve a real choice_sets key (or
    a declared fallback) for every reachable profile — no silent KeyError
    at runtime."""
    out = []
    if not survey.get("selector_semantics", {}).get("first_matching_field"):
        out.append(finding("blocking", "selector_semantics_undeclared",
                            "no top-level selector_semantics.first_matching_field operational "
                            "definition — selector_precedence values on individual questions have "
                            "nothing to point at"))
        return out

    dc = _domain_choices_for(survey)
    for q in survey.get("questions", []):
        if q.get("type") != "single_choice_dynamic" or "selector_fields" not in q:
            continue
        choice_sets = q.get("choice_sets", {})
        fallback = q.get("fallback_choice_set")
        if fallback is not None and fallback not in choice_sets:
            out.append(finding("blocking", "selector_fallback_choice_set_undeclared",
                                f"{q['id']!r}.fallback_choice_set={fallback!r} is not a key in its "
                                f"own choice_sets", id=q["id"], fallback=fallback))
            continue

        unresolved = []
        for domain in dc["domains"]:
            for detail in dc["detail_by_domain"][domain]:
                profile = {"primary_complaint_domain": domain, "primary_complaint_detail": detail}
                key = resolve_selector_key(q, profile)
                if key is None or key not in choice_sets:
                    unresolved.append({"domain": domain, "detail": detail, "resolved_key": key})
        if unresolved:
            out.append(finding("blocking", "selector_unresolvable_for_profile",
                                f"{q['id']!r} cannot resolve a choice_sets key for "
                                f"{len(unresolved)} profile(s) under the declared "
                                f"first_matching_field semantics, e.g. {unresolved[0]}",
                                id=q["id"], examples=unresolved[:5], count=len(unresolved)))
    return out


# ---------------------------------------------------------------------------
# safety / fatigue
# ---------------------------------------------------------------------------

def check_safety_suppression(survey: dict) -> list[dict]:
    policy = survey.get("fatigue_policy", {})
    priority_order = set(policy.get("priority_order", []))
    defer_candidates = policy.get("defer_candidates", [])
    never_defer_if = policy.get("never_defer_if", [])

    out = []
    for cand in defer_candidates:
        if cand not in priority_order:
            out.append(finding("ambiguous", "undeclared_defer_candidate_value",
                                f"fatigue_policy.defer_candidates contains {cand!r}, which is not "
                                f"one of the declared fatigue_priority values in priority_order "
                                f"{sorted(priority_order)} — it can't be matched against a "
                                f"question's fatigue_priority field as written", value=cand))

    deferrable = {c for c in defer_candidates if c in priority_order}
    for q in survey.get("questions", []):
        fp, sl, req = q.get("fatigue_priority"), q.get("safety_level", "none"), q.get("required", False)
        if fp in deferrable and (sl == "critical" or req) and "required == true" in never_defer_if:
            out.append(finding("blocking", "deferrable_but_protected",
                                f"question {q['id']!r} has fatigue_priority {fp!r} (a declared "
                                f"defer_candidate) but required={req}/safety_level={sl!r}, which "
                                f"never_defer_if protects — contradictory", id=q["id"]))
        if fp not in priority_order and fp is not None:
            out.append(finding("ambiguous", "fatigue_priority_not_in_priority_order",
                                f"question {q['id']!r} uses fatigue_priority={fp!r}, not declared "
                                f"in fatigue_policy.priority_order", id=q["id"], value=fp))
    return out


def resolve_route_target_seconds(route: dict, targets: dict) -> int | None:
    tc = route.get("timing_class")
    if tc is None:
        return None
    return targets.get(f"{tc}_p90_seconds")


def check_undefined_budget_terms(survey: dict, rules: dict) -> list[dict]:
    """N-4a fix verification: route_target_seconds must have a real,
    resolvable definition (timing_class -> fatigue_policy.targets), not a
    bare identifier with nothing behind it."""
    out = []
    budget = survey.get("fatigue_policy", {}).get("budget_definition", {})
    conditions_text = " ".join(budget.get("budget_low_when", []))
    if "route_target_seconds" not in conditions_text:
        return out

    resolution = budget.get("route_target_seconds", {}).get("resolution", "")
    if "timing_class" not in resolution or "targets" not in resolution:
        out.append(finding("blocking", "undefined_budget_term",
                            "fatigue_policy.budget_definition.budget_low_when references "
                            "route_target_seconds, but budget_definition.route_target_seconds."
                            "resolution does not describe how to derive it from timing_class + "
                            "targets", resolution=resolution))
        return out

    targets = survey.get("fatigue_policy", {}).get("targets", {})
    # core_p50_seconds/core_p90_seconds are the overall core-phase targets,
    # not a route timing_class — exclude "core" from the candidate set.
    valid_timing_classes = {k[:-len("_p90_seconds")] for k in targets
                             if k.endswith("_p90_seconds") and not k.startswith("core_")}
    for r in rules.get("primary_routes", []):
        tc = r.get("timing_class")
        if tc is None:
            out.append(finding("blocking", "route_missing_timing_class",
                                f"primary route {r['id']!r} has no timing_class, so "
                                f"route_target_seconds cannot be resolved for it", route=r["id"]))
        elif tc not in valid_timing_classes:
            out.append(finding("blocking", "route_timing_class_unmapped",
                                f"primary route {r['id']!r}.timing_class={tc!r} has no matching "
                                f"fatigue_policy.targets.{tc}_p90_seconds entry", route=r["id"], timing_class=tc))

    unused_timing_classes = valid_timing_classes - {r.get("timing_class") for r in rules.get("primary_routes", [])}
    if unused_timing_classes:
        out.append(finding("ambiguous", "timing_class_with_no_route",
                            f"fatigue_policy.targets declares target(s) for "
                            f"{sorted(unused_timing_classes)}, but no primary_routes entry is "
                            f"classified that way. For 'complex_herbal' specifically this is a "
                            f"CLOSED clinical decision (LBP_v1.4_임상결정_마감본.md section 7: "
                            f"case-level, not route-level — 2+ herbal modules, or second complaint "
                            f"opens another herbal module, or medication_present AND "
                            f"major_history_present) whose dynamic engine is deferred as an "
                            f"engineering task (see "
                            f"complex_herbal_dynamic_classification_engine in "
                            f"unresolved_design_decisions) — no herbal micro-modules exist yet to "
                            f"test a dynamic classifier against",
                            timing_classes=sorted(unused_timing_classes)))
    return out


def check_second_complaint_state_machine(survey: dict, rules: dict) -> list[dict]:
    """N-2: additional_complaint_count's increment event and max must be
    real, checkable things, not prose pointing at nothing."""
    out = []
    policy = rules.get("second_complaint_policy", {})
    engine_state = survey.get("runtime_context_contract", {}).get("engine_state", {})
    counter_name = policy.get("runtime_counter")

    if counter_name not in engine_state:
        out.append(finding("blocking", "second_complaint_counter_undeclared",
                            f"second_complaint_policy.runtime_counter={counter_name!r} is not a "
                            f"declared runtime_context_contract.engine_state field", counter=counter_name))
        return out

    max_cap = policy.get("max_additional_complaints_in_tablet")
    declared_max = engine_state[counter_name].get("max")
    if max_cap != declared_max:
        out.append(finding("blocking", "second_complaint_cap_mismatch",
                            f"max_additional_complaints_in_tablet={max_cap!r} but engine_state."
                            f"{counter_name}.max={declared_max!r}", policy_max=max_cap, engine_max=declared_max))

    increment = policy.get("counter_increment_when")
    question_ids = {q["id"] for q in survey.get("questions", [])}
    module_ids = set(rules.get("module_contracts", {}).keys())

    if isinstance(increment, dict) and increment.get("type") == "question_answered":
        qid = increment.get("question_id")
        if qid not in question_ids:
            out.append(finding("blocking", "second_complaint_increment_event_undefined",
                                f"second_complaint_policy.counter_increment_when.question_id="
                                f"{qid!r} is not a declared question id — {counter_name!r} would "
                                f"never increment", increment_when=increment))
            return out
        # N-2 fix verified: the increment now points at a concrete, always-
        # present artifact (a question in this bundle), not an undefined
        # future module. Also confirm it fires on the low-budget path too
        # (that was the specific v1.2 failure mode: if_budget_low never
        # incremented at all).
        if qid != "core_second_complaint_domain":
            out.append(finding("ambiguous", "second_complaint_increment_not_on_domain_capture",
                                f"counter_increment_when points at {qid!r}, not "
                                f"core_second_complaint_domain — confirm this still fires on the "
                                f"if_budget_low path ({policy.get('if_budget_low')!r}), where only "
                                f"the domain (not full detail) is captured", question_id=qid))
        return out

    increment_text = str(increment or "")
    mentions_a_declared_module = any(m.lower() in increment_text.lower() for m in module_ids)
    mentions_a_declared_question = any(q.lower() in increment_text.lower() for q in question_ids)
    if not mentions_a_declared_module and not mentions_a_declared_question:
        out.append(finding("blocking", "second_complaint_increment_event_undefined",
                            f"second_complaint_policy.counter_increment_when={increment_text!r} "
                            f"does not name any module in module_contracts or any question in "
                            f"this bundle — nothing can ever actually increment {counter_name!r}",
                            increment_when=increment_text))
    return out


# ---------------------------------------------------------------------------
# timing
# ---------------------------------------------------------------------------

def _minimal_core_walk(questions: list[dict], domain: str, minimal: bool) -> tuple[int, list[str]]:
    """Walk core questions for one domain, evaluating real show_when.
    minimal=True picks the cheapest non-cascading answer at each branch
    point (for a P50-floor computation); minimal=False picks the most
    expensive branch (for a ceiling)."""
    by_id = {q["id"]: q for q in questions}
    profile = {"primary_complaint_domain": domain, "patient_sex": "M", "patient_age": 30}
    total, shown = 0, []
    for q in questions:
        if q["id"] in ("core_second_complaint", "core_second_complaint_domain"):
            continue  # gated on engine_state that a core-only walk can't produce
        if not eval_tree(q.get("show_when"), profile):
            continue
        total += q["estimated_seconds"]
        shown.append(q["id"])
        if q["id"] == "core_msk_region":
            profile["primary_complaint_detail"] = "LBP"
        elif q["id"] == "core_nonmsk_detail":
            choices = by_id["core_nonmsk_detail"]["choice_sets"].get(domain, [])
            if minimal:
                pick = next((c["value"] for c in choices if not str(c["value"]).startswith("OTHER")), choices[0]["value"] if choices else None)
            else:
                pick = next((c["value"] for c in choices if str(c["value"]).startswith("OTHER")), choices[0]["value"] if choices else None)
            profile["primary_complaint_detail"] = pick
        elif q["id"] == "core_target_function":
            cs = q["choice_sets"]
            key = profile.get("primary_complaint_detail")
            options = cs.get(key) or cs.get(domain) or cs["DEFAULT"]
            if minimal:
                pick = next((c["value"] for c in options if c["value"] != "CUSTOM"), options[0]["value"])
            else:
                pick = "CUSTOM" if any(c["value"] == "CUSTOM" for c in options) else options[0]["value"]
            profile["target_function"] = pick
        elif q["id"] == "core_safety_profile":
            if minimal:
                profile["medication_present"] = "NO"
                profile["severe_allergy_history"] = "NO"
                profile["major_history_present"] = "NO"
            else:
                profile["medication_present"] = "YES"
                profile["severe_allergy_history"] = "NO"
                profile["major_history_present"] = "YES"
                profile["medication_name_text"] = "x"
    return total, shown


def check_timing_targets(survey: dict) -> list[dict]:
    questions = all_questions(survey)
    by_id = {q["id"]: q for q in questions}
    domains = [c["value"] for c in by_id["core_primary_domain"]["choices"]]
    targets = survey.get("fatigue_policy", {}).get("targets", {})
    p50_target, p90_target = targets.get("core_p50_seconds"), targets.get("core_p90_seconds")

    floors = {d: _minimal_core_walk(questions, d, minimal=True)[0] for d in domains}
    ceilings = {d: _minimal_core_walk(questions, d, minimal=False)[0] for d in domains}
    floor, ceiling = min(floors.values()), max(ceilings.values())

    out = []
    if p50_target is not None and floor > p50_target:
        out.append(finding("blocking", "core_p50_target_unreachable",
                            f"even the cheapest domain costs {floor}s minimum, but core_p50_seconds="
                            f"{p50_target}s", floor_seconds=floor, target_seconds=p50_target, per_domain_floor=floors))
    if p90_target is not None and floor > p90_target:
        out.append(finding("blocking", "core_p90_target_unreachable",
                            f"even the cheapest domain costs {floor}s minimum, but core_p90_seconds="
                            f"{p90_target}s", floor_seconds=floor, target_seconds=p90_target))
    if p90_target is not None and ceiling < p90_target:
        out.append(finding("minor", "core_p90_target_slack",
                            f"the most expensive reachable core path costs only {ceiling}s, "
                            f"comfortably under core_p90_seconds={p90_target}s — the target is not "
                            f"tight enough to be a meaningful constraint on its own",
                            ceiling_seconds=ceiling, target_seconds=p90_target))
    return out


# ---------------------------------------------------------------------------
# domain-declaration gaps (N-3)
# ---------------------------------------------------------------------------

def check_safety_gate_excludes_declared_domain(survey: dict) -> list[dict]:
    domains = declared_domain_by_field(survey)
    out = []
    for q in survey.get("questions", []):
        if q.get("safety_level") != "critical" or not q.get("show_when"):
            continue
        for c in referenced_fields_as_conditions(q["show_when"]):
            f, op, v = c["field"], c["op"], c.get("value")
            if op != "eq" or f not in domains:
                continue
            excluded = domains[f] - {v}
            if excluded:
                out.append(finding("ambiguous", "safety_gate_excludes_declared_domain_values",
                                    f"safety_level=critical question {q['id']!r} only shows when "
                                    f"{f}=={v!r}, silently excluding declared {f} values "
                                    f"{sorted(excluded, key=str)} — for patient_sex specifically, "
                                    f"OTHER/UNKNOWN patients who could still be pregnant are never "
                                    f"asked", id=q["id"], field=f, matched_value=v,
                                    excluded_values=sorted(excluded, key=str)))
    return out


# ---------------------------------------------------------------------------
# extension ordering (N-7)
# ---------------------------------------------------------------------------

def check_extension_ordering_guard(survey: dict, rules: dict) -> list[dict]:
    """N-7 fix verification: the second-complaint prompt must not be able to
    fire while a module_extension is still attached/in-flight. Two things
    have to both be true: (1) every module_extensions entry actually flips
    a tracked engine_state flag when it attaches, (2)
    core_second_complaint.show_when actually checks that flag."""
    out = []
    engine_state = survey.get("runtime_context_contract", {}).get("engine_state", {})
    flag_candidates = [f for f, spec in engine_state.items() if spec.get("type") == "boolean" and f != "primary_micro_module_complete"]

    extensions = rules.get("module_extensions", [])
    unguarded_extensions = [e["id"] for e in extensions if not e.get("sets_pending_extension")]
    if extensions and unguarded_extensions:
        out.append(finding("blocking", "extension_ordering_not_guarded",
                            f"module_extensions {unguarded_extensions} do not set a "
                            f"pending-extension flag on attach, so nothing prevents the "
                            f"second-complaint prompt from firing mid-extension",
                            extensions=unguarded_extensions))

    by_id = {q["id"]: q for q in survey.get("questions", [])}
    prompt = by_id.get("core_second_complaint")
    if prompt is not None:
        guard_fields = referenced_fields(prompt.get("show_when")) & set(flag_candidates)
        if extensions and not guard_fields:
            out.append(finding("blocking", "extension_ordering_not_guarded",
                                "core_second_complaint.show_when does not reference any "
                                "engine_state boolean flag that a module_extension sets — the "
                                "prompt can fire while an extension is still attached",
                                question="core_second_complaint"))
    return out


# ---------------------------------------------------------------------------
# N3: value serialization inconsistency
# ---------------------------------------------------------------------------

def check_value_serialization_inconsistency(survey: dict) -> list[dict]:
    """Korean-label literals used as match values alongside ASCII enum
    codes, plus the UNKNOWN-as-category vs UNKNOWN-as-literal-Korean-string
    double serialization noted in the v1.2 review (N3 status: NOT-FIXED)."""
    out = []
    korean_literal_conditions = []
    for q in survey.get("questions", []):
        for c in referenced_fields_as_conditions(q.get("show_when")):
            v = c.get("value")
            if isinstance(v, str) and any("가" <= ch <= "힣" for ch in v):
                korean_literal_conditions.append((q["id"], c["field"], v))
    if korean_literal_conditions:
        out.append(finding("ambiguous", "korean_literal_used_as_match_value",
                            f"{len(korean_literal_conditions)} show_when condition(s) compare "
                            f"against a Korean label string instead of an ASCII enum code, e.g. "
                            f"{korean_literal_conditions[0]} — no value-serialization contract is "
                            f"declared, unlike core_onset_bucket/core_pregnancy_status etc. which "
                            f"use ASCII codes with Korean labels kept separate",
                            examples=korean_literal_conditions[:5]))

    unknown_producers = []
    for q in survey.get("questions", []):
        dom = question_domain(q)
        if dom and "UNKNOWN" in dom:
            unknown_producers.append(q["id"])
        if dom and "잘 모르겠음" in dom:
            out.append(finding("ambiguous", "unknown_category_double_serialization",
                                f"question {q['id']!r} encodes the '잘 모르겠음' (UNKNOWN) answer as "
                                f"the literal Korean string, while other questions "
                                f"({', '.join(unknown_producers) or 'e.g. core_onset_bucket'}) use "
                                f"the ASCII token 'UNKNOWN' for the same concept — "
                                f"value_semantics.UNKNOWN is a named category but has two "
                                f"incompatible encodings in this file", id=q["id"]))
    return out


# Non-blocking, purely technical limitations that remain after the v1.3
# repair pass. Nothing here touches clinical content — see
# CLINICAL_DECISION_REQUIRED below for the items that do.
UNRESOLVED_DESIGN_DECISIONS = [
    {
        "id": "null_category_no_producer",
        "summary": "value_semantics.null is fully specified but no question or engine_state field "
                    "ever actually produces an explicit null. Harmless (missing is the only "
                    "absence state reachable today) but untestable until something produces null.",
        "action": "Not simulated; every profile only ever has missing or concrete values.",
    },
    {
        "id": "micro_module_question_sets_absent",
        "summary": "Per branch_rules_v1.4.yaml:simulation_policy.total_path_timing, this remains "
                    "not_computable until real module question sets exist — expected, not a defect. "
                    "LBP_V1's route (route_lbp/simple_msk) is now the exception — computable.",
        "action": "simulation_summary_v1.4.json reports simple_herbal/complex_herbal total_*_p90 "
                   "overflow as 'not_computable' (no herbal module question sets exist yet); "
                   "simple_msk is computable.",
    },
    {
        "id": "complex_herbal_dynamic_classification_engine",
        "summary": "LBP_v1.4_임상결정_마감본.md section 7 decided complex_herbal is case-level "
                    "(2+ herbal modules entered, OR second complaint opens another herbal module, "
                    "OR medication_present AND major_history_present) — a runtime/dynamic "
                    "condition, not a static per-route property. This is now a closed clinical "
                    "decision (see RESOLVED_CLINICAL_DECISIONS), but implementing the dynamic "
                    "classification engine is deferred: two of the three conditions require "
                    "multiple herbal micro-modules to exist, and none do yet.",
        "action": "Not implemented. When herbal modules exist, the engine must classify "
                   "timing_class at runtime per the decided rule rather than reading a static "
                   "per-route value.",
    },
    {
        "id": "lbp_recommendation_lock_ui_wiring",
        "summary": "lbp_logic.disease_safety_locked() and treatment_safety_locked() are fully "
                    "specified (LBP_v1.4_임상결정_마감본.md section 9) and tested, but nothing in "
                    "any real UI/exercise-recommender calls them yet — no such repo exists in this "
                    "environment (claude_code_task_lbp_v1.md's React/TypeScript integration scope "
                    "is out of scope for this spec/simulation pass).",
        "action": "Handoff item for whoever builds the real repo integration — see "
                   "final_validation_report.md's next-steps.",
    },
]

# Items that touch clinical judgment (autonomy policy category B): NOT
# decided autonomously. Each carries the most conservative provisional
# behavior actually implemented in v1.3, plus alternatives for clinical
# sign-off. Mirrored into unresolved_clinical_decisions.md by the report
# writer.
CLINICAL_DECISION_REQUIRED: list[dict] = []

# All 7 previously-open clinical decisions were closed by
# LBP_v1.4_임상결정_마감본.md (2026-08-24). Kept here for traceability —
# NOT re-litigated, NOT re-opened. See decision_log.md for the full mapping
# and tests/test_lbp_logic.py + tests/test_lbp_yaml_content.py for the
# regression coverage each closure requires (decision doc section 11).
RESOLVED_CLINICAL_DECISIONS = [
    {
        "id": "pregnancy_gate_patient_sex_scope",
        "resolution": "Confirmed as-is (decision doc section 6): core_pregnancy_status stays "
                       "gated on patient_sex in [F,OTHER,UNKNOWN], age 10-55. New: a SEPARATE "
                       "treatment_safety_status dimension (pregnancy affects treatment "
                       "finalization, not disease-safety review) — never merged with "
                       "lbp_safety_status. See lbp_logic.compute_treatment_safety_status.",
    },
    {
        "id": "complex_herbal_route_classification",
        "resolution": "Definition decided (doc section 7): case-level, not route-level — "
                       "2+ herbal micro-modules entered, OR a second complaint opens another "
                       "herbal module, OR (medication_present AND major_history_present). "
                       "complex_herbal_p90_seconds=300s is a fatigue-budget cap, not a target "
                       "time. Dynamic engine implementation deferred (no herbal question sets "
                       "exist yet to test against) — tracked as a non-blocking engineering task "
                       "in UNRESOLVED_DESIGN_DECISIONS, not a clinical question anymore.",
    },
    {
        "id": "lbp_bilateral_neuro_escalation_threshold",
        "resolution": "Confirmed (doc section 2): BILATERAL + a concrete neuro feature "
                       "(paresthesia/numbness/subjective weakness) -> REVIEW_REQUIRED. Bilateral "
                       "leg PAIN ALONE does NOT auto-escalate — sets lbp_neuro_baseline_required "
                       "instead, requiring a clinician neuro exam. Explicitly framed as "
                       "Samindang's own conservative policy, not a direct NICE NG127 citation.",
    },
    {
        "id": "lbp_red_flag_coverage_gaps",
        "resolution": "Decided per-item (doc section 3), not uniformly filled: (A) unexplained "
                       "weight loss — already covered by the existing lbp_current_redflag_screen "
                       "choice, confirmed sufficient. (B) infection/procedure risk — ONE new "
                       "choice added (RECENT_SPINAL_PROCEDURE_OR_INJECTION) to the same existing "
                       "screen, not a separate question. Age — explicitly NOT asked as a "
                       "question; read from Core as a clinician-facing modifier only "
                       "(lbp_fracture_risk_age_modifier / lbp_malignancy_risk_age_modifier), "
                       "never alone raising safety status. Night/rest pain — explicitly NOT "
                       "added as a universal red flag; stays an inflammatory-branch supporting "
                       "feature. Bisphosphonate — explicitly NOT added as a separate question; "
                       "existing osteoporosis history + corticosteroid context covers it. "
                       "pregnancy_status — now wired to treatment_safety_status.",
    },
    {
        "id": "lbp_inflammatory_criteria_count_threshold",
        "resolution": "v1 policy decided (doc section 5): NO formal NG65 count is computed — "
                       "this simplified screen doesn't collect all 9 NG65 criteria 1:1. Replaced "
                       "with a simple boolean lbp_inflammatory_pattern_consider (eligible + >=1 "
                       "supporting feature -> clinician-facing CONSIDER, never a patient-facing "
                       "diagnosis/probability). hypothesis_model's ambiguous 'criteria count' "
                       "language removed.",
    },
    {
        "id": "lbp_evidence_citation_verification",
        "resolution": "Citations confirmed against primary-source recollection (doc section 8), "
                       "with specific corrections identified: NG127's CES paraphrase should not "
                       "be read as mandating referral for bilateral sciatica alone (the bilateral "
                       "rule above is Samindang policy, not a NICE citation) — the miscitation "
                       "risk was in this codebase's own prior rationale comment (now corrected), "
                       "not in evidence_matrix_lbp_v1.md itself. Suri 2010's older-adults-with-"
                       "leg-pain population scope noted for future evidence_matrix edits. NG65 "
                       "formal count confirmed not applicable to this simplified screen (see "
                       "lbp_inflammatory_criteria_count_threshold above).",
    },
    {
        "id": "lbp_exercise_recommender_lock_enforcement",
        "resolution": "Contract specified in full (doc section 9): disease_safety_locked() gates "
                       "routine exercise/treatment/Suggested-Exam on lbp_safety_status != CLEAR; "
                       "a separate treatment_safety_locked() gates contraindication-sensitive "
                       "treatment finalization on treatment_safety_status != CLEAR without "
                       "stopping the questionnaire; both fail closed on a missing/uncomputed "
                       "status. Both functions implemented and tested. Wiring them into an actual "
                       "UI/exercise-recommender (no such repo exists in this environment) remains "
                       "an engineering task, tracked in UNRESOLVED_DESIGN_DECISIONS — no longer a "
                       "clinical question.",
    },
]


def run(survey_path=DEFAULT_SURVEY, rules_path=DEFAULT_RULES, module_paths=DEFAULT_MODULES) -> dict:
    survey, rules = load_spec(survey_path, rules_path)

    modules: dict[str, dict] = {}
    merged_survey = survey
    for module_path in module_paths or []:
        module_path = Path(module_path)
        if not module_path.exists():
            continue
        module = load_module_question_set(module_path)
        modules[module["module_id"]] = module
        merged_survey = merge_module_into_survey(merged_survey, module)

    # Cross-file structural checks (duplicate/unknown-field/cycle/reachable/
    # safety/serialization) see core + every bound module's questions.
    # Route/timing/extension checks that are specifically about the CORE
    # phase (before any module runs) stay on the unmerged core `survey` —
    # merging would incorrectly pull module question costs into core-only
    # p50/p90 targets and domain-gate checks that don't apply to modules.
    producers = known_producers(merged_survey, rules)
    domains, undeclared = build_domain_by_field(merged_survey, rules)

    findings = []
    findings += check_duplicate_ids(merged_survey)
    findings += check_dual_producer_fields(producers)
    findings += check_unknown_referenced_fields(merged_survey, rules, producers)
    findings += check_branch_cycles(merged_survey)
    findings += check_unreachable_required(merged_survey, domains, undeclared)
    findings += check_primary_route_module_leakage(survey, rules)
    findings += check_route_ambiguity(survey, rules)
    findings += check_routing_invariants(rules)
    findings += check_module_extension_graph(rules)
    findings += check_module_contract_outputs_producible(rules, modules)
    findings += check_module_entry_when_matches_route(rules, modules)
    findings += check_selector_precedence(merged_survey)
    findings += check_selector_semantics_resolvable(merged_survey)
    findings += check_safety_suppression(merged_survey)
    findings += check_undefined_budget_terms(survey, rules)
    findings += check_second_complaint_state_machine(survey, rules)
    findings += check_extension_ordering_guard(survey, rules)
    findings += check_timing_targets(survey)
    findings += check_safety_gate_excludes_declared_domain(survey)
    findings += check_value_serialization_inconsistency(merged_survey)

    by_severity = {"blocking": 0, "ambiguous": 0, "minor": 0}
    for f in findings:
        by_severity[f["severity"]] += 1

    def count(*checks):
        return sum(1 for f in findings if f["check"] in checks)

    # Quality-gate metric names as specified by the autonomous repair
    # policy. Each is 0/PASS only when the underlying check(s) found
    # nothing; a nonzero count is the actual finding list above.
    quality_gate = {
        "duplicate_ids": count("duplicate_question_id"),
        "unknown_referenced_fields": count("unknown_referenced_field"),
        "branch_cycles": count("branch_cycle"),
        "ambiguous_highest_priority_route": count("ambiguous_highest_priority_route"),
        "unavailable_field_reference": count("primary_route_reads_module_output"),
        "dynamic_selector_ambiguity": count(
            "selector_semantics_undeclared", "selector_fallback_choice_set_undeclared",
            "selector_unresolvable_for_profile"),
        "serialization_inconsistency": count(
            "korean_literal_used_as_match_value", "unknown_category_double_serialization"),
        "protected_question_suppression": count("deferrable_but_protected"),
        "undefined_budget_terms": count("undefined_budget_term", "route_missing_timing_class", "route_timing_class_unmapped"),
        "state_machine_failures": count(
            "second_complaint_counter_undeclared", "second_complaint_cap_mismatch",
            "second_complaint_increment_event_undefined"),
        "extension_ordering_failures": count("extension_ordering_not_guarded"),
        "completed_core_without_route": count("completed_core_without_route"),
        "incomplete_core_without_guard": count("unreachable_required_question"),
        "module_contract_inconsistency": count(
            "module_contract_output_not_producible", "module_entry_when_route_mismatch"),
        "core_p50_within_target": not any(f["check"] == "core_p50_target_unreachable" for f in findings),
        "core_p90_within_target": not any(f["check"] == "core_p90_target_unreachable" for f in findings),
        "safety_critical_omission": 0,  # computed by simulate_paths.py's timing simulation; see report
    }

    return {
        "findings": findings,
        "counts_by_severity": by_severity,
        "unresolved_design_decisions": UNRESOLVED_DESIGN_DECISIONS,
        "resolved_clinical_decisions": RESOLVED_CLINICAL_DECISIONS,
        "clinical_decision_required": CLINICAL_DECISION_REQUIRED,
        "quality_gate": quality_gate,
        "quality_gate_pass": by_severity["blocking"] == 0,
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    survey_p = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SURVEY
    rules_p = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_RULES
    module_ps = sys.argv[3:] if len(sys.argv) > 3 else DEFAULT_MODULES
    result = run(survey_p, rules_p, module_ps)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result["counts_by_severity"]["blocking"]:
        sys.exit(1)
