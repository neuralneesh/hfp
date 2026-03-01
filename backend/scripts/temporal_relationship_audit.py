#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any, Dict, List

SCRIPT_DIR = os.path.abspath(os.path.dirname(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))

sys.path.append(BACKEND_DIR)

from app.engine import ReasoningEngine
from app.graph_loader import GraphLoader


def _load_engine() -> ReasoningEngine:
    packs_dir = os.path.join(BACKEND_DIR, "app", "knowledge", "packs")
    loader = GraphLoader(packs_dir)
    nodes, edges, _ = loader.load_all()
    return ReasoningEngine(nodes, edges, loader.syndromes)


def _filter_reachability(
    reachability: Dict[str, Dict[str, List[str]]],
    node_filter: List[str],
) -> Dict[str, Dict[str, List[str]]]:
    if not node_filter:
        return reachability
    selected = set(node_filter)
    return {
        node_id: timescales
        for node_id, timescales in reachability.items()
        if node_id in selected
    }


def _render_reachability_section(
    title: str,
    reachability: Dict[str, Dict[str, List[str]]],
) -> List[str]:
    lines = [f"## {title}"]
    if not reachability:
        lines.append("_No nodes selected._")
        return lines

    for node_id in sorted(reachability.keys()):
        lines.append(f"### {node_id}")
        timescale_map = reachability[node_id]
        any_values = False
        for timescale in ("immediate", "minutes", "hours", "days"):
            values = timescale_map.get(timescale, [])
            if not values:
                continue
            any_values = True
            lines.append(f"- {timescale}: {', '.join(values)}")
        if not any_values:
            lines.append("- none")
    return lines


def _render_markdown(report: Dict[str, Any], engine: ReasoningEngine) -> str:
    lines: List[str] = [
        "# Temporal Relationship Audit",
        "",
        "## Summary",
        f"- nodes: {len(engine.nodes)}",
        f"- logical_edges: {len(engine.edges)}",
        f"- compiled_phase_edges: {len(engine.compiled_edges)}",
        f"- feedback_clusters: {len(report['feedback_clusters'])}",
        "",
        "## Review Candidates",
    ]

    review = report["review_candidates"]
    reciprocal_edges = review.get("reciprocal_edges", [])
    if reciprocal_edges:
        lines.append("- reciprocal_edges:")
        for pair in reciprocal_edges:
            lines.append(f"  - {pair[0]} <-> {pair[1]}")
    else:
        lines.append("- reciprocal_edges: none")

    fast_feedback = review.get("fast_feedback_loops", [])
    if fast_feedback:
        lines.append("- fast_feedback_loops:")
        for cluster in fast_feedback:
            lines.append(f"  - {', '.join(cluster['nodes'])}")
    else:
        lines.append("- fast_feedback_loops: none")

    immediate_only = review.get("immediate_only_high_weight_edges", [])
    if immediate_only:
        lines.append("- immediate_only_high_weight_edges:")
        for edge in immediate_only:
            lines.append(f"  - {edge}")
    else:
        lines.append("- immediate_only_high_weight_edges: none")

    lines.extend(["", "## Feedback Clusters"])
    if report["feedback_clusters"]:
        for index, cluster in enumerate(report["feedback_clusters"], start=1):
            lines.append(f"### Cluster {index}")
            lines.append(f"- nodes: {', '.join(cluster['nodes'])}")
            lines.append(f"- mixed_sign: {cluster['mixed_sign']}")
            lines.append(f"- reciprocal: {cluster['reciprocal']}")
            lines.append(f"- has_delayed_phase: {cluster['has_delayed_phase']}")
            if cluster["edges"]:
                lines.append("- edges:")
                for edge in cluster["edges"]:
                    lines.append(f"  - {edge}")
    else:
        lines.append("_No feedback clusters found._")

    lines.extend([""])
    lines.extend(_render_reachability_section("Direct Downstream", report["direct_downstream"]))
    lines.extend([""])
    lines.extend(_render_reachability_section("Direct Upstream", report["direct_upstream"]))
    lines.extend([""])
    lines.extend(_render_reachability_section("Multi-hop Downstream", report["multi_hop_downstream"]))
    lines.extend([""])
    lines.extend(_render_reachability_section("Multi-hop Upstream", report["multi_hop_upstream"]))

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit temporal relationship coverage in the physiology graph.")
    parser.add_argument(
        "--format",
        choices=("markdown", "json"),
        default="markdown",
        help="Output format.",
    )
    parser.add_argument(
        "--node",
        action="append",
        default=[],
        help="Limit reachability sections to one or more node IDs.",
    )
    parser.add_argument(
        "--max-tick",
        type=int,
        default=3,
        help="Maximum relative tick to use for multi-hop reachability (0-3).",
    )
    args = parser.parse_args()

    engine = _load_engine()
    report = engine.build_dependency_index(max_tick=args.max_tick)
    for key in ("direct_downstream", "direct_upstream", "multi_hop_downstream", "multi_hop_upstream"):
        report[key] = _filter_reachability(report[key], args.node)

    if args.format == "json":
        print(json.dumps(report, indent=2, sort_keys=True))
        return 0

    print(_render_markdown(report, engine), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
