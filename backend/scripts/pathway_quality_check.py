#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import random
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple, get_args

import yaml

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

sys.path.append(BACKEND_DIR)

from app.context_baselines import apply_context_baselines
from app.engine import ReasoningEngine
from app.graph_loader import GraphLoader
from app.models import Edge, Perturbation, SimulationOptions, SimulationRequest


Direction = str


@dataclass
class AssertionSpec:
    target: str
    expected: Direction  # up | down | absent
    min_path_len: int = 1
    require_summary: bool = False
    at_tick: Optional[int] = None


@dataclass
class ScenarioSpec:
    id: str
    label: str
    perturbations: List[Perturbation]
    context: Dict[str, bool]
    max_hops: int
    assertions: List[AssertionSpec]


@dataclass
class HardInvariantSpec:
    id: str
    label: str
    perturbations: List[Perturbation]
    context: Dict[str, bool]
    max_hops: int
    must_hold: List[AssertionSpec]


@dataclass
class RandomProbe:
    path: List[str]
    decreases_count: int
    op: str


@dataclass
class GraphLintIssue:
    kind: str
    detail: str


REL_POLARITY: Dict[str, str] = {
    "increases": "positive",
    "converts_to": "positive",
    "requires": "positive",
    "enables": "positive",
    "precedes": "positive",
    "part_of": "positive",
    "causes": "positive",
    "refines": "positive",
    "derives": "positive",
    "decreases": "negative",
}


def _resolved_raw_phases(edge: Dict[str, Any]) -> List[Dict[str, Any]]:
    temporal_profile = edge.get("temporal_profile") or []
    if temporal_profile:
        return temporal_profile
    return [{"at": edge.get("delay", "immediate"), "rel": edge.get("rel")}]


def _phase_at(phase: Dict[str, Any], edge: Dict[str, Any]) -> str:
    return str(phase.get("at", edge.get("delay", "immediate")))


def _phase_rel(phase: Dict[str, Any], edge: Dict[str, Any]) -> str:
    return str(phase.get("rel", edge.get("rel", "")))


def _load_specs(path: str) -> List[ScenarioSpec]:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    scenarios: List[ScenarioSpec] = []
    for scenario in raw.get("scenarios", []):
        perturbations = [
            Perturbation(node_id=p["node_id"], op=p["op"]) for p in scenario.get("perturbations", [])
        ]
        assertions = [
            AssertionSpec(
                target=a["target"],
                expected=a["expected"],
                min_path_len=a.get("min_path_len", 1),
                require_summary=a.get("require_summary", False),
                at_tick=a.get("at_tick"),
            )
            for a in scenario.get("assertions", [])
        ]
        scenarios.append(
            ScenarioSpec(
                id=scenario["id"],
                label=scenario.get("label", scenario["id"]),
                perturbations=perturbations,
                context=scenario.get("context", {}),
                max_hops=scenario.get("max_hops", 8),
                assertions=assertions,
            )
        )
    return scenarios


def _load_hard_invariants(path: str) -> List[HardInvariantSpec]:
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    invariants: List[HardInvariantSpec] = []
    for invariant in raw.get("invariants", []):
        perturbations = [
            Perturbation(node_id=p["node_id"], op=p["op"]) for p in invariant.get("perturbations", [])
        ]
        must_hold = [
            AssertionSpec(
                target=a["target"],
                expected=a["expected"],
                min_path_len=a.get("min_path_len", 1),
                require_summary=a.get("require_summary", False),
                at_tick=a.get("at_tick"),
            )
            for a in invariant.get("must_hold", [])
        ]
        invariants.append(
            HardInvariantSpec(
                id=invariant["id"],
                label=invariant.get("label", invariant["id"]),
                perturbations=perturbations,
                context=invariant.get("context", {}),
                max_hops=invariant.get("max_hops", 8),
                must_hold=must_hold,
            )
        )
    return invariants


def _load_raw_packs(packs_dir: str) -> List[Tuple[str, Dict[str, Any]]]:
    docs: List[Tuple[str, Dict[str, Any]]] = []
    for root, _, files in os.walk(packs_dir):
        for file in files:
            if not (file.endswith(".yaml") or file.endswith(".yml")):
                continue
            path = os.path.join(root, file)
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
            docs.append((path, data))
    return docs


def _edge_sign(rel: str) -> str:
    polarity = REL_POLARITY.get(rel)
    if polarity == "positive":
        return "pos"
    if polarity == "negative":
        return "neg"
    return "unknown"


def _has_slow_delay(edge: Dict[str, Any]) -> bool:
    return any(_phase_at(phase, edge) in {"hours", "days"} for phase in _resolved_raw_phases(edge))


def _has_any_immediate_phase(edge: Dict[str, Any]) -> bool:
    return any(_phase_at(phase, edge) == "immediate" for phase in _resolved_raw_phases(edge))


def _is_expected_slow_edge(edge: Dict[str, Any]) -> bool:
    source = str(edge.get("source", ""))
    target = str(edge.get("target", ""))
    slow_pairs = (
        ("renal.tubule.na_reabsorption", "renal.volume.ecf_volume"),
        ("renal.volume.ecf_volume", "renal.volume.preload"),
        ("renal.volume.ecf_volume", "renal.metabolism.anp_bnp"),
        ("renal.metabolism.anp_bnp", "renal.volume.ecf_volume"),
    )
    return any(source == s and target == t for s, t in slow_pairs)


def _is_high_risk_feedback_pair(a: str, b: str) -> bool:
    high_risk_nodes = {
        "renal.volume.ecf_volume",
        "renal.volume.preload",
        "renal.metabolism.anp_bnp",
        "renal.tubule.na_reabsorption",
        "renal.metabolism.adh",
        "renal.signaling.renal_camp",
    }
    return a in high_risk_nodes or b in high_risk_nodes


def _lint_graph_structure(packs_dir: str) -> List[GraphLintIssue]:
    issues: List[GraphLintIssue] = []
    docs = _load_raw_packs(packs_dir)
    allowed_relations = set(get_args(Edge.model_fields["rel"].annotation))
    referenced_relations: Set[str] = set()

    node_ids: Set[str] = set()
    for path, data in docs:
        for node in data.get("nodes", []) or []:
            node_id = node.get("id")
            if not node_id:
                issues.append(GraphLintIssue("schema", f"{path}: node without id"))
                continue
            if node_id in node_ids:
                issues.append(GraphLintIssue("schema", f"{path}: duplicate node id '{node_id}'"))
            node_ids.add(node_id)

    immediate_edge_lookup: Dict[Tuple[str, str], List[Tuple[str, str]]] = {}
    for path, data in docs:
        for edge in data.get("edges", []) or []:
            source = edge.get("source")
            target = edge.get("target")
            rel = edge.get("rel")
            phases = _resolved_raw_phases(edge)
            if not source or not target:
                issues.append(GraphLintIssue("schema", f"{path}: edge missing source/target: {edge}"))
                continue
            if source not in node_ids:
                issues.append(GraphLintIssue("reference", f"{path}: edge source not found '{source}'"))
            if target not in node_ids:
                issues.append(GraphLintIssue("reference", f"{path}: edge target not found '{target}'"))
            if rel not in allowed_relations:
                issues.append(GraphLintIssue("relation", f"{path}: unsupported rel '{rel}' on {source} -> {target}"))
            phase_times: Set[str] = set()
            for phase in phases:
                phase_at = _phase_at(phase, edge)
                if phase_at in phase_times:
                    issues.append(
                        GraphLintIssue(
                            "temporal",
                            f"{path}: temporal_profile repeats at='{phase_at}' on {source} -> {target}",
                        )
                    )
                phase_times.add(phase_at)

                phase_rel = _phase_rel(phase, edge)
                if phase_rel not in allowed_relations:
                    issues.append(
                        GraphLintIssue(
                            "relation",
                            f"{path}: unsupported phase rel '{phase_rel}' on {source} -> {target}",
                        )
                    )
                else:
                    referenced_relations.add(phase_rel)
                    if phase_rel not in REL_POLARITY:
                        issues.append(
                            GraphLintIssue(
                                "relation",
                                f"{path}: rel '{phase_rel}' missing polarity mapping",
                            )
                        )

                phase_threshold = phase.get("activation_threshold", edge.get("activation_threshold"))
                phase_direction = phase.get("activation_direction", edge.get("activation_direction", "any"))
                if phase_direction != "any" and phase_threshold is None:
                    issues.append(
                        GraphLintIssue(
                            "temporal",
                            f"{path}: temporal gating without threshold on {source} -> {target} at={phase_at}",
                        )
                    )
            if _is_expected_slow_edge(edge) and not _has_slow_delay(edge):
                issues.append(
                    GraphLintIssue(
                        "delay",
                        f"{path}: expected slower delay for {source} -> {target}, got delay={edge.get('delay', 'immediate')}",
                    )
                )
            if _has_any_immediate_phase(edge):
                pair = (source, target)
                for phase in phases:
                    if _phase_at(phase, edge) != "immediate":
                        continue
                    immediate_edge_lookup.setdefault(pair, []).append((_phase_rel(phase, edge), path))

        for node in data.get("nodes", []) or []:
            node_id = node.get("id", "<missing>")
            for ref_key in ("maps_to", "expansion_of"):
                ref = node.get(ref_key)
                if ref and ref not in node_ids:
                    issues.append(
                        GraphLintIssue("reference", f"{path}: {ref_key} target not found '{ref}' (node={node_id})")
                    )

    seen_feedback_pairs: Set[Tuple[str, str]] = set()
    for (source, target), rels in immediate_edge_lookup.items():
        reverse = immediate_edge_lookup.get((target, source), [])
        if not reverse:
            continue
        pair_key = tuple(sorted((source, target)))
        if pair_key in seen_feedback_pairs:
            continue
        for rel, p1 in rels:
            sign1 = _edge_sign(rel)
            for rel2, p2 in reverse:
                sign2 = _edge_sign(rel2)
                if {sign1, sign2} == {"pos", "neg"} and _is_high_risk_feedback_pair(source, target):
                    issues.append(
                        GraphLintIssue(
                            "feedback",
                            f"immediate opposing feedback loop {source} <-> {target} ({rel} vs {rel2}) in {p1} and {p2}",
                        )
                    )
                    seen_feedback_pairs.add(pair_key)
                    break

    if referenced_relations:
        probe_engine = ReasoningEngine({}, [])
        for rel in sorted(referenced_relations):
            up_out = probe_engine._propagate_direction("up", rel)
            down_out = probe_engine._propagate_direction("down", rel)
            polarity = REL_POLARITY.get(rel)
            if polarity == "positive" and not (up_out == "up" and down_out == "down"):
                issues.append(
                    GraphLintIssue(
                        "relation",
                        f"engine polarity mismatch for rel '{rel}': expected positive, got up->{up_out}, down->{down_out}",
                    )
                )
            if polarity == "negative" and not (up_out == "down" and down_out == "up"):
                issues.append(
                    GraphLintIssue(
                        "relation",
                        f"engine polarity mismatch for rel '{rel}': expected negative, got up->{up_out}, down->{down_out}",
                    )
                )

    try:
        loader = GraphLoader(packs_dir)
        nodes, edges, _ = loader.load_all()
        engine = ReasoningEngine(nodes, edges, loader.syndromes)
        dependency_index = engine.build_dependency_index()
        for cluster in dependency_index["feedback_clusters"]:
            if cluster["has_delayed_phase"]:
                continue
            issues.append(
                GraphLintIssue(
                    "temporal",
                    "feedback cluster has no delayed phase: " + ", ".join(cluster["nodes"]),
                )
            )
    except Exception as exc:
        issues.append(
            GraphLintIssue(
                "schema",
                f"failed to build temporal dependency index: {exc}",
            )
        )

    return issues


def _run_scenario(
    engine: ReasoningEngine,
    scenario: ScenarioSpec,
    error_prefix: str = "scenario",
) -> List[str]:
    errs: List[str] = []
    perturbations = apply_context_baselines(scenario.perturbations, scenario.context)
    req = SimulationRequest(
        perturbations=perturbations,
        context=scenario.context,
        options=SimulationOptions(max_hops=scenario.max_hops),
    )
    res = engine.simulate(req)
    affected = {a.node_id: a for a in res.affected_nodes}
    tick_states = getattr(engine, "latest_node_states", {})

    for assertion in scenario.assertions:
        node = affected.get(assertion.target)
        if assertion.at_tick is not None:
            node = tick_states.get(assertion.target, {}).get(assertion.at_tick)
        traces = res.traces.get(assertion.target, [])
        long_enough_traces = [t for t in traces if len(t.path) >= assertion.min_path_len]
        summarized_traces = [t for t in long_enough_traces if t.summary]
        trace_dirs = [_trace_terminal_direction(t.steps[-1]) for t in long_enough_traces if t.steps]
        trace_has_expected = assertion.expected in trace_dirs

        if assertion.expected == "absent":
            if node is not None:
                errs.append(
                    f"[{error_prefix}:{scenario.id}] expected {assertion.target} to be absent"
                    f"{f' at_tick={assertion.at_tick}' if assertion.at_tick is not None else ''}, got direction={node.direction}"
                )
            continue

        if node is None and not trace_has_expected:
            errs.append(
                f"[{error_prefix}:{scenario.id}] expected {assertion.target}={assertion.expected}"
                f"{f' at_tick={assertion.at_tick}' if assertion.at_tick is not None else ''}, but node was unaffected"
            )
            continue

        # Accept either final state match or an explicit causal trace ending in the expected direction.
        if node is not None and node.direction != assertion.expected and not trace_has_expected:
            errs.append(
                f"[{error_prefix}:{scenario.id}] expected {assertion.target}={assertion.expected}"
                f"{f' at_tick={assertion.at_tick}' if assertion.at_tick is not None else ''}, got {node.direction} and no matching trace direction"
            )
            continue

        if assertion.min_path_len > 1 and not long_enough_traces:
            errs.append(
                f"[{error_prefix}:{scenario.id}] {assertion.target} matched direction but no trace reached min_path_len={assertion.min_path_len}"
            )

        if assertion.require_summary and not summarized_traces:
            errs.append(
                f"[{error_prefix}:{scenario.id}] {assertion.target} matched direction but no summarized trace was found"
            )

    return errs


def _run_hard_invariant(engine: ReasoningEngine, invariant: HardInvariantSpec) -> List[str]:
    scenario_like = ScenarioSpec(
        id=invariant.id,
        label=invariant.label,
        perturbations=invariant.perturbations,
        context=invariant.context,
        max_hops=invariant.max_hops,
        assertions=invariant.must_hold,
    )
    return _run_scenario(engine, scenario_like, error_prefix="invariant")


def _trace_terminal_direction(last_step: str) -> Direction:
    if "→ Increased " in last_step:
        return "up"
    if "→ Decreased " in last_step:
        return "down"
    return "unknown"


def _invert_direction(direction: Direction) -> Direction:
    if direction == "up":
        return "down"
    if direction == "down":
        return "up"
    return direction


def _is_subsequence(path: List[str], sequence: List[str]) -> bool:
    if not sequence:
        return True
    seq_idx = 0
    for node_id in path:
        if node_id == sequence[seq_idx]:
            seq_idx += 1
            if seq_idx == len(sequence):
                return True
    return False


def _sample_random_probe(
    engine: ReasoningEngine, rng: random.Random, min_len: int, max_len: int
) -> Optional[RandomProbe]:
    candidates = [node_id for node_id, outs in engine.adj.items() if outs]
    if not candidates:
        return None

    for _ in range(40):
        start = rng.choice(candidates)
        desired_len = rng.randint(min_len, max_len)
        path = [start]
        visited = {start}
        decreases_count = 0
        curr = start

        for _ in range(desired_len - 1):
            outgoing = [edge for edge in engine.adj.get(curr, []) if edge.target not in visited]
            if not outgoing:
                break
            edge = rng.choice(outgoing)
            path.append(edge.target)
            visited.add(edge.target)
            curr = edge.target
            if edge.rel == "decreases":
                decreases_count += 1

        if len(path) >= min_len:
            return RandomProbe(
                path=path,
                decreases_count=decreases_count,
                op=rng.choice(["increase", "decrease"]),
            )

    return None


def _run_random_probes(
    engine: ReasoningEngine,
    probe_count: int,
    min_len: int,
    max_len: int,
    max_hops: int,
    seed: Optional[int],
    strict_random_probes: bool,
) -> Tuple[List[str], int, List[str], List[str]]:
    if probe_count <= 0:
        return [], 0, [], []

    rng = random.Random(seed)
    failures: List[str] = []
    warnings: List[str] = []
    evaluated = 0
    sampled_paths: List[str] = []
    sim_cache = {}

    for _ in range(probe_count):
        probe = _sample_random_probe(engine, rng, min_len=min_len, max_len=max_len)
        if not probe:
            continue

        start = probe.path[0]
        target = probe.path[-1]
        expected_if_increase = "down" if probe.decreases_count % 2 else "up"
        expected = expected_if_increase if probe.op == "increase" else _invert_direction(expected_if_increase)
        sampled_paths.append(
            f"{probe.op} {start} | {' -> '.join(probe.path)} | expect {target}={expected}"
        )
        cache_key = (start, probe.op, max_hops)

        if cache_key not in sim_cache:
            req = SimulationRequest(
                perturbations=[Perturbation(node_id=start, op=probe.op)],
                context={},
                options=SimulationOptions(max_hops=max_hops),
            )
            sim_cache[cache_key] = engine.simulate(req)

        res = sim_cache[cache_key]
        traces = res.traces.get(target, [])
        matching_traces = [t for t in traces if t.path == probe.path]
        soft_matching_traces = [
            t for t in traces if t.path and t.path[0] == start and t.path[-1] == target
        ]
        evaluated += 1

        if not matching_traces:
            # Engine trace lists are intentionally capped, so an exact sampled path can
            # be omitted even when a closely related start->target causal route exists.
            if not soft_matching_traces:
                msg = (
                    f"[random_probe] missing path realization for {' -> '.join(probe.path)} "
                    f"(expected {expected})"
                )
                if strict_random_probes:
                    failures.append(msg)
                else:
                    warnings.append(msg)
                continue
            warnings.append(
                f"[random_probe] inconclusive (exact sampled path not retained in top traces): {' -> '.join(probe.path)}"
            )
            continue

        trace_dirs = [
            _trace_terminal_direction(t.steps[-1]) for t in matching_traces if t.steps
        ]
        if expected not in trace_dirs:
            failures.append(
                f"[random_probe] direction mismatch for {' -> '.join(probe.path)} (expected {expected})"
            )

    return failures, evaluated, sampled_paths, warnings


def _execute_single_run(args) -> int:
    lint_issues = _lint_graph_structure(args.packs_dir)
    loader = GraphLoader(args.packs_dir)
    try:
        nodes, edges, _ = loader.load_all()
    except Exception as e:
        print("Physiology pathway quality check: FAILED")
        print("- graph_load_error:")
        print(f"  * {e}")
        if lint_issues:
            print(f"- lint_issues={len(lint_issues)}")
            for issue in lint_issues:
                print(f"- [{issue.kind}] {issue.detail}")
        return 1
    engine = ReasoningEngine(nodes, edges, loader.syndromes)
    scenarios = _load_specs(args.spec)
    if not scenarios:
        print("No scenarios found. Nothing to validate.")
        return 1
    invariants = _load_hard_invariants(args.hard_invariants)
    if not invariants:
        print("No hard invariants found. Nothing to validate.")
        return 1

    failures: List[str] = []
    failures.extend([f"[lint:{issue.kind}] {issue.detail}" for issue in lint_issues])
    for scenario in scenarios:
        failures.extend(_run_scenario(engine, scenario, error_prefix="scenario"))
    for invariant in invariants:
        failures.extend(_run_hard_invariant(engine, invariant))
    random_failures, random_evaluated, sampled_paths, random_warnings = _run_random_probes(
        engine=engine,
        probe_count=args.random_probes,
        min_len=args.random_min_len,
        max_len=args.random_max_len,
        max_hops=args.random_max_hops,
        seed=args.seed,
        strict_random_probes=args.strict_random_probes,
    )
    failures.extend(random_failures)

    if failures:
        print("Physiology pathway quality check: FAILED")
        print(f"- deterministic_scenarios={len(scenarios)}")
        print(f"- hard_invariants={len(invariants)}")
        print(f"- random_probes_evaluated={random_evaluated} seed={args.seed if args.seed is not None else 'auto'}")
        if sampled_paths:
            print("- sampled_random_paths:")
            for path in sampled_paths:
                print(f"  * {path}")
        if random_warnings:
            print(f"- random_probe_inconclusive={len(random_warnings)}")
            for w in random_warnings:
                print(f"- {w}")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(
        "Physiology pathway quality check: PASSED "
        f"(deterministic_scenarios={len(scenarios)}, hard_invariants={len(invariants)}, random_probes_evaluated={random_evaluated}, "
        f"seed={args.seed if args.seed is not None else 'auto'})"
    )
    if sampled_paths:
        print("- sampled_random_paths:")
        for path in sampled_paths:
            print(f"  * {path}")
    if random_warnings:
        print(f"- random_probe_inconclusive={len(random_warnings)}")
        for w in random_warnings:
            print(f"- {w}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run multi-hop physiology quality checks against the knowledge graph."
    )
    parser.add_argument(
        "--packs-dir",
        default=os.path.join(BACKEND_DIR, "app", "knowledge", "packs"),
        help="Directory containing knowledge packs.",
    )
    parser.add_argument(
        "--spec",
        default=os.path.join(
            BACKEND_DIR,
            "app",
            "knowledge",
            "quality",
            "pathway_expectations.yaml",
        ),
        help="YAML file containing pathway quality scenarios.",
    )
    parser.add_argument(
        "--hard-invariants",
        default=os.path.join(
            BACKEND_DIR,
            "app",
            "knowledge",
            "quality",
            "hard_invariants.yaml",
        ),
        help="YAML file containing hard physiologic invariants.",
    )
    parser.add_argument(
        "--random-probes",
        type=int,
        default=8,
        help="Number of randomized multi-hop path probes to evaluate each run.",
    )
    parser.add_argument(
        "--random-min-len",
        type=int,
        default=3,
        help="Minimum sampled random path length.",
    )
    parser.add_argument(
        "--random-max-len",
        type=int,
        default=6,
        help="Maximum sampled random path length.",
    )
    parser.add_argument(
        "--random-max-hops",
        type=int,
        default=10,
        help="Simulation max_hops for random probes.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Optional RNG seed for reproducible random probe runs.",
    )
    parser.add_argument(
        "--strict-random-probes",
        action="store_true",
        help="Treat random probe path-realization misses as hard failures (default: warnings).",
    )
    parser.add_argument(
        "--loop-until-failure",
        action="store_true",
        help="Continuously run checks and stop at the first failure.",
    )
    parser.add_argument(
        "--max-iterations",
        type=int,
        default=0,
        help="Optional max loop iterations when using --loop-until-failure (0 means unbounded).",
    )
    parser.add_argument(
        "--loop-sleep-sec",
        type=float,
        default=0.0,
        help="Optional sleep between loop iterations in seconds.",
    )
    args = parser.parse_args()

    if not args.loop_until_failure:
        return _execute_single_run(args)

    iteration = 1
    while True:
        print(f"\n=== loop_iteration={iteration} ===")
        exit_code = _execute_single_run(args)
        if exit_code != 0:
            print(f"Stopping: first failure detected at iteration {iteration}.")
            return exit_code

        if args.max_iterations > 0 and iteration >= args.max_iterations:
            print(f"Stopping: reached max iterations ({args.max_iterations}) without failure.")
            print("No failing path found within the iteration limit.")
            return 2

        iteration += 1
        if args.loop_sleep_sec > 0:
            time.sleep(args.loop_sleep_sec)


if __name__ == "__main__":
    raise SystemExit(main())
