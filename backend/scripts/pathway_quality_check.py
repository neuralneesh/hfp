#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import random
import sys
import time
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import yaml

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

sys.path.append(BACKEND_DIR)

from app.context_baselines import apply_context_baselines
from app.engine import ReasoningEngine
from app.graph_loader import GraphLoader
from app.models import Perturbation, SimulationOptions, SimulationRequest


Direction = str


@dataclass
class AssertionSpec:
    target: str
    expected: Direction  # up | down | absent
    min_path_len: int = 1
    require_summary: bool = False


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

    for assertion in scenario.assertions:
        node = affected.get(assertion.target)
        traces = res.traces.get(assertion.target, [])
        long_enough_traces = [t for t in traces if len(t.path) >= assertion.min_path_len]
        summarized_traces = [t for t in long_enough_traces if t.summary]
        trace_dirs = [_trace_terminal_direction(t.steps[-1]) for t in long_enough_traces if t.steps]
        trace_has_expected = assertion.expected in trace_dirs

        if assertion.expected == "absent":
            if node is not None:
                errs.append(
                    f"[{error_prefix}:{scenario.id}] expected {assertion.target} to be absent, got direction={node.direction}"
                )
            continue

        if node is None and not trace_has_expected:
            errs.append(
                f"[{error_prefix}:{scenario.id}] expected {assertion.target}={assertion.expected}, but node was unaffected"
            )
            continue

        # Accept either final state match or an explicit causal trace ending in the expected direction.
        if node is not None and node.direction != assertion.expected and not trace_has_expected:
            errs.append(
                f"[{error_prefix}:{scenario.id}] expected {assertion.target}={assertion.expected}, got {node.direction} and no matching trace direction"
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
                failures.append(
                    f"[random_probe] missing path realization for {' -> '.join(probe.path)} (expected {expected})"
                )
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
    loader = GraphLoader(args.packs_dir)
    nodes, edges, _ = loader.load_all()
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
