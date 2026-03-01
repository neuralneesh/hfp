import collections
import heapq
from typing import Any, DefaultDict, Dict, List, Optional, Set, Tuple

from .models import (
    AffectedNode,
    CompiledEdge,
    Edge,
    EdgePhase,
    Node,
    SimulationRequest,
    SimulationResponse,
    Syndrome,
    TraceStep,
)

TIME_MAP = {"immediate": 0, "minutes": 1, "hours": 2, "days": 3}
REV_TIME_MAP = {value: key for key, value in TIME_MAP.items()}
POSITIVE_RELATIONS = {
    "increases",
    "converts_to",
    "requires",
    "enables",
    "precedes",
    "part_of",
    "causes",
    "refines",
    "derives",
}

class ReasoningEngine:
    def __init__(self, nodes: Dict[str, Node], edges: List[Edge], syndromes: Optional[List[Syndrome]] = None):
        self.nodes = nodes
        self.edges = edges
        self.syndromes = syndromes or []
        # Backward-compatible snapshot of per-tick resolved states from the latest simulation.
        self.latest_node_states: Dict[str, Dict[int, AffectedNode]] = {}
        self.compiled_edges = self._compile_edges(edges)
        self.adj: DefaultDict[str, List[CompiledEdge]] = collections.defaultdict(list)
        self.rev_adj: DefaultDict[str, List[CompiledEdge]] = collections.defaultdict(list)
        for edge in self.compiled_edges:
            self.adj[edge.source].append(edge)
            self.rev_adj[edge.target].append(edge)

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        # node_states: node_id -> tick -> AffectedNode
        node_states: DefaultDict[str, Dict[int, AffectedNode]] = collections.defaultdict(dict)
        node_activity: Dict[str, Dict[int, float]] = collections.defaultdict(dict)
        traces: DefaultDict[str, List[TraceStep]] = collections.defaultdict(list)
        propagated_directions: DefaultDict[str, DefaultDict[int, Set[str]]] = collections.defaultdict(
            lambda: collections.defaultdict(set)
        )

        max_tick = TIME_MAP.get(request.options.time_window, 3) if request.options.time_window != "all" else 3

        # influence_buffer: node_id -> tick -> list of influences
        influence_buffer: DefaultDict[str, DefaultDict[int, List[Dict[str, Any]]]] = collections.defaultdict(
            lambda: collections.defaultdict(list)
        )

        # Initial perturbations (Tick 0)
        for p in request.perturbations:
            direction = "up" if p.op == "increase" else "down" if p.op in {"decrease", "block"} else "unchanged"
            if p.node_id not in self.nodes:
                continue

            influence_buffer[p.node_id][0].append({
                "direction": direction,
                "confidence": 1.0,
                "effect_size": 1.0,
                "priority": "ultra", # Manual is ultra high
                "path": [p.node_id],
                "steps": [],
            })

        # Process ticks sequentially
        for tick in range(max_tick + 1):
            nodes_to_resolve = sorted(
                node_id for node_id, tick_bucket in influence_buffer.items() if tick in tick_bucket
            )
            queued_nodes = set(nodes_to_resolve)

            while nodes_to_resolve:
                curr_node_id = nodes_to_resolve.pop(0)
                queued_nodes.discard(curr_node_id)
                if tick not in influence_buffer[curr_node_id]:
                    continue

                # Resolve influenced state
                resolved, dominant_hops, dominant_influence, trace_only_branches = self._resolve_influence(
                    influence_buffer[curr_node_id][tick],
                    curr_node_id,
                    tick,
                )
                if not resolved or resolved.effect_size < request.options.min_effect_size:
                    continue

                # Check for stability to avoid unnecessary re-propagation
                prev = node_states[curr_node_id].get(tick)
                if (
                    prev
                    and prev.direction == resolved.direction
                    and abs(prev.confidence - resolved.confidence) < 0.01
                    and abs(prev.effect_size - resolved.effect_size) < 0.01
                ):
                    continue

                node_states[curr_node_id][tick] = resolved
                node_activity[curr_node_id][tick] = (
                    resolved.effect_size if resolved.direction == "up" else -resolved.effect_size
                )
                can_propagate = (
                    dominant_hops < request.options.max_hops
                    and resolved.direction not in propagated_directions[curr_node_id][tick]
                )
                for branch in trace_only_branches:
                    self._emit_secondary_trace_branches(
                        traces=traces,
                        source_id=curr_node_id,
                        source_branch=branch,
                        outgoing_edges=self.adj.get(curr_node_id, []),
                        context=request.context,
                        min_confidence=request.options.min_confidence,
                    )

                # Propagate from this node
                if not can_propagate:
                    continue
                propagated_directions[curr_node_id][tick].add(resolved.direction)
                for edge in self.adj.get(curr_node_id, []):
                    if not self._context_matches(edge, request.context):
                        continue

                    source_dir_for_path = dominant_influence["direction"] if dominant_influence else resolved.direction
                    target_id = edge.target
                    target_dir = self._propagate_direction(source_dir_for_path, edge.rel)
                    if target_dir in {"unknown", "unchanged"}:
                        continue

                    source_level = self._source_level(curr_node_id, tick, node_activity)
                    source_strength = abs(source_level)

                    threshold_gain = self._activation_threshold_gain(edge, source_dir_for_path, source_strength)
                    if threshold_gain <= 0.0:
                        continue
                    saturation_gain = self._saturation_gain(curr_node_id, source_dir_for_path, source_level)
                    time_gain = 1.0 if not edge.is_legacy_timing else self._time_constant_gain(curr_node_id)
                    target_effect_size = self._clamp(
                        resolved.effect_size * edge.weight * threshold_gain * saturation_gain * time_gain
                    )
                    target_conf = self._clamp(
                        resolved.confidence * threshold_gain * saturation_gain,
                        floor=0.0,
                    )
                    if (
                        target_conf < request.options.min_confidence
                        or target_effect_size < request.options.min_effect_size
                    ):
                        continue

                    next_tick = tick + edge.at_tick
                    if next_tick > max_tick:
                        continue

                    previous_path = dominant_influence["path"] if dominant_influence else [curr_node_id]
                    previous_steps = dominant_influence["steps"] if dominant_influence else []
                    path = previous_path + [target_id]
                    step_desc = self._generate_step_description(
                        curr_node_id,
                        target_id,
                        source_dir_for_path,
                        target_dir,
                        edge.rel,
                        edge.at,
                    )
                    steps = previous_steps + [step_desc]

                    influence_buffer[target_id][next_tick].append({
                        "direction": target_dir,
                        "confidence": target_conf,
                        "effect_size": target_effect_size,
                        "priority": edge.priority,
                        "path": path,
                        "steps": steps,
                    })

                    self._upsert_trace(traces, target_id, path, steps, target_conf)

                    if edge.at_tick == 0 and target_id not in queued_nodes:
                        nodes_to_resolve.append(target_id)
                        nodes_to_resolve.sort()
                        queued_nodes.add(target_id)

        # Build response
        all_affected: List[AffectedNode] = []
        timelines: Dict[str, List[AffectedNode]] = {}
        for node_id, tick_states in node_states.items():
            # Surface the dominant resolved effect, not merely the latest tick.
            # This avoids delayed feedback loops masking the primary direction.
            if tick_states:
                timelines[node_id] = [tick_states[tick_value] for tick_value in sorted(tick_states.keys())]
                best_tick = min(tick_states.keys())
                all_affected.append(tick_states[best_tick])

        # Preserve full timeline for debugging scripts/tests that inspect tick-level states.
        self.latest_node_states = {
            node_id: dict(tick_states)
            for node_id, tick_states in node_states.items()
        }

        return SimulationResponse(
            affected_nodes=all_affected,
            traces=dict(traces),
            timelines=timelines,
            max_ticks=max_tick
        )

    def build_dependency_index(self, max_tick: int = 3) -> Dict[str, Any]:
        bounded_max_tick = max(0, min(max_tick, TIME_MAP["days"]))
        direct_downstream = self._group_direct_neighbors(self.adj, "target")
        direct_upstream = self._group_direct_neighbors(self.rev_adj, "source")
        multi_hop_downstream = self._group_reachability(self.adj, bounded_max_tick, "target")
        multi_hop_upstream = self._group_reachability(self.rev_adj, bounded_max_tick, "source")
        logical_adj = self._logical_adjacency()
        sccs = self._strongly_connected_components(logical_adj)
        feedback_clusters = self._build_feedback_clusters(sccs)

        return {
            "direct_downstream": direct_downstream,
            "direct_upstream": direct_upstream,
            "multi_hop_downstream": multi_hop_downstream,
            "multi_hop_upstream": multi_hop_upstream,
            "sccs": sccs,
            "feedback_clusters": feedback_clusters,
            "review_candidates": self._review_candidates(feedback_clusters),
        }

    def _upsert_trace(
        self,
        traces: Dict[str, List[TraceStep]],
        target_id: str,
        path: List[str],
        steps: List[str],
        confidence: float,
    ) -> None:
        summary = self._build_trace_summary(path)
        new_trace = TraceStep(
            path=path,
            steps=steps,
            confidence=confidence,
            summary=summary,
        )

        if target_id not in traces:
            traces[target_id] = [new_trace]
            return

        path_exists = False
        for i, existing in enumerate(traces[target_id]):
            if existing.path == path:
                if confidence > existing.confidence:
                    traces[target_id][i] = new_trace
                path_exists = True
                break

        if not path_exists:
            traces[target_id].append(new_trace)

        traces[target_id].sort(key=lambda x: (x.confidence, len(x.path)), reverse=True)
        traces[target_id] = traces[target_id][:10]

    def _build_trace_summary(self, path: List[str]) -> Optional[str]:
        if not path or len(path) < 2:
            return None

        matched_items: List[Tuple[int, int, str]] = []
        for syndrome in self.syndromes:
            span = self._subsequence_span(path, syndrome.sequence)
            if span is not None:
                matched_items.append((span[0], span[1], syndrome.label))

        if not matched_items:
            return None

        matched_items.sort(key=lambda item: (item[0], -(item[1] - item[0])))
        filtered_items: List[Tuple[int, int, str]] = []
        for start_idx, end_idx, label in matched_items:
            is_subsumed = any(
                other_start <= start_idx
                and other_end >= end_idx
                and (other_end - other_start) > (end_idx - start_idx)
                for other_start, other_end, other_label in matched_items
                if other_label != label
            )
            if not is_subsumed:
                filtered_items.append((start_idx, end_idx, label))

        deduped: List[str] = []
        for _, _, label in filtered_items:
            if label not in deduped:
                deduped.append(label)

        if len(deduped) == 1:
            return deduped[0]
        if len(deduped) == 2:
            return f"{deduped[0]} followed by {deduped[1]}"
        return ", ".join(deduped[:-1]) + f", followed by {deduped[-1]}"

    def _subsequence_span(self, path: List[str], sequence: List[str]) -> Optional[Tuple[int, int]]:
        if not sequence:
            return None
        seq_idx = 0
        first_match_idx: Optional[int] = None
        for current_idx, node_id in enumerate(path):
            if node_id == sequence[seq_idx]:
                if first_match_idx is None:
                    first_match_idx = current_idx
                seq_idx += 1
                if seq_idx == len(sequence):
                    return first_match_idx, current_idx
        return None

    def _resolve_influence(
        self,
        influences: List[Dict[str, Any]],
        node_id: str,
        tick: int,
    ) -> Tuple[Optional[AffectedNode], int, Optional[Dict[str, Any]], List[Dict[str, Any]]]:
        if not influences:
            return None, 0, None, []

        pri_map = {"low": 1, "medium": 2, "high": 3, "ultra": 10}
        max_pri = max(pri_map.get(inf["priority"], 2) for inf in influences)
        top_influences = [inf for inf in influences if pri_map.get(inf["priority"], 2) == max_pri]

        up_score = sum(inf["effect_size"] for inf in top_influences if inf["direction"] == "up")
        down_score = sum(inf["effect_size"] for inf in top_influences if inf["direction"] == "down")

        if up_score > down_score:
            direction = "up"
        elif down_score > up_score:
            direction = "down"
        else:
            return None, 0, None, []

        winning = [inf for inf in top_influences if inf["direction"] == direction]
        losing_sum = down_score if direction == "up" else up_score
        effect_size = self._clamp(abs(up_score - down_score))
        opposition_ratio = losing_sum / max(0.01, up_score + down_score)
        mean_confidence = sum(inf["confidence"] for inf in winning) / max(1, len(winning))
        confidence = self._clamp(
            mean_confidence * (1 - 0.5 * opposition_ratio),
            floor=0.1,
        )

        dominant = max(
            winning,
            key=lambda inf: (inf["effect_size"], inf["confidence"]),
            default=None,
        )
        dominant_hops = max(0, len(dominant["path"]) - 1) if dominant else 0
        trace_only_branches: List[Dict[str, Any]] = []
        seen_trace_keys: Set[Tuple[str, Tuple[str, ...]]] = set()
        sorted_top = sorted(
            top_influences,
            key=lambda inf: (inf["effect_size"], inf["confidence"], len(inf["path"])),
            reverse=True,
        )
        for inf in sorted_top:
            if inf is dominant:
                continue
            trace_key = (inf["direction"], tuple(inf["path"]))
            if trace_key in seen_trace_keys:
                continue
            seen_trace_keys.add(trace_key)
            trace_only_branches.append({
                "direction": inf["direction"],
                "confidence": self._clamp(inf["confidence"] * 0.7, floor=0.0),
                "effect_size": self._clamp(inf["effect_size"]),
                "path": inf["path"],
                "steps": inf["steps"],
            })
            if len(trace_only_branches) >= 3:
                break

        return AffectedNode(
            node_id=node_id,
            direction=direction,
            magnitude=self._effect_size_to_magnitude(effect_size),
            confidence=confidence,
            effect_size=effect_size,
            timescale=REV_TIME_MAP.get(tick, "immediate"),
            tick=tick
        ), dominant_hops, dominant, trace_only_branches

    def _emit_secondary_trace_branches(
        self,
        traces: Dict[str, List[TraceStep]],
        source_id: str,
        source_branch: Dict[str, Any],
        outgoing_edges: List[CompiledEdge],
        context: Dict[str, bool],
        min_confidence: float,
    ) -> None:
        if source_branch["effect_size"] <= 0.0:
            return

        for edge in outgoing_edges:
            if not self._context_matches(edge, context):
                continue
            target_dir = self._propagate_direction(source_branch["direction"], edge.rel)
            if target_dir in {"unknown", "unchanged"}:
                continue

            trace_confidence = self._clamp(source_branch["confidence"] * 0.7, floor=0.0)
            if trace_confidence < min_confidence:
                continue

            path = source_branch["path"] + [edge.target]
            steps = source_branch["steps"] + [
                self._generate_step_description(
                    source_id,
                    edge.target,
                    source_branch["direction"],
                    target_dir,
                    edge.rel,
                    edge.at,
                )
            ]
            self._upsert_trace(traces, edge.target, path, steps, trace_confidence)

    def _generate_step_description(
        self,
        source_id: str,
        target_id: str,
        source_dir: str,
        target_dir: str,
        rel: str,
        timescale: str,
    ) -> str:
        source_label = self.nodes[source_id].label
        target_label = self.nodes[target_id].label
        target_state = "Increased" if target_dir == "up" else "Decreased" if target_dir == "down" else target_dir
        timing_prefix = ""
        if timescale != "immediate":
            timing_prefix = f"Over {timescale}, "

        if source_dir == "up":
            if rel in POSITIVE_RELATIONS:
                return f"{timing_prefix}Increased {source_label} promotes {target_label} → {target_state} {target_label}"
            if rel == "decreases":
                return f"{timing_prefix}Increased {source_label} inhibits {target_label} → {target_state} {target_label}"
        elif source_dir == "down":
            if rel in POSITIVE_RELATIONS:
                return f"{timing_prefix}Reduced {source_label} fails to promote {target_label} → {target_state} {target_label}"
            if rel == "decreases":
                return f"{timing_prefix}Reduced {source_label} disinhibits {target_label} → {target_state} {target_label}"

        return f"{timing_prefix}{source_label} ({source_dir}) affects {target_label} → {target_state} {target_label}"

    def _context_matches(self, edge: CompiledEdge, context: Dict[str, bool]) -> bool:
        for key, val in edge.context.items():
            # Default missing context keys to False
            if context.get(key, False) != val:
                return False
        return True

    def _activation_threshold_gain(self, edge: CompiledEdge, source_dir: str, source_strength: float) -> float:
        if edge.activation_threshold is None:
            return 1.0
        if edge.activation_direction != "any" and source_dir != edge.activation_direction:
            return 0.0
        return 1.0 if source_strength >= edge.activation_threshold else 0.0

    def _source_level(self, node_id: str, tick: int, node_activity: Dict[str, Dict[int, float]]) -> float:
        node = self.nodes[node_id]
        activity = node_activity.get(node_id, {}).get(tick, 0.0)
        level = node.baseline_level + activity
        return max(node.min_level, min(node.max_level, level))

    def _saturation_gain(self, node_id: str, source_dir: str, source_level: float) -> float:
        node = self.nodes[node_id]
        # Only apply saturation where the node explicitly constrains its dynamic range.
        if node.min_level <= -1.0 and node.max_level >= 1.0:
            return 1.0
        if source_dir == "down":
            # Only damp when already close to the lower floor.
            if source_level <= node.min_level + 0.05:
                return 0.05
            return 1.0
        if source_dir == "up":
            # Only damp when already close to the upper ceiling.
            if source_level >= node.max_level - 0.05:
                return 0.05
            return 1.0
        return 1.0

    def _time_constant_gain(self, node_id: str) -> float:
        tc = self.nodes[node_id].time_constant
        if tc == "acute":
            return 1.0
        if tc == "subacute":
            return 0.75
        return 0.5

    def _propagate_direction(self, direction: str, rel: str) -> str:
        if direction == "unknown" or direction == "unchanged":
            return direction
        if rel in POSITIVE_RELATIONS:
            return direction
        if rel == "decreases":
            return "down" if direction == "up" else "up"
        return "unknown"

    def _compile_edges(self, edges: List[Edge]) -> List[CompiledEdge]:
        compiled: List[CompiledEdge] = []
        for edge in edges:
            phases = edge.temporal_profile or [EdgePhase(at=edge.delay)]
            for phase in phases:
                compiled.append(
                    CompiledEdge(
                        source=edge.source,
                        target=edge.target,
                        at=phase.at,
                        at_tick=TIME_MAP[phase.at],
                        rel=phase.rel or edge.rel,
                        weight=phase.weight if phase.weight is not None else edge.weight,
                        priority=phase.priority or edge.priority,
                        activation_direction=phase.activation_direction or edge.activation_direction,
                        activation_threshold=(
                            phase.activation_threshold
                            if phase.activation_threshold is not None
                            else edge.activation_threshold
                        ),
                        context=dict(edge.context),
                        description=phase.description or edge.description,
                        is_legacy_timing=edge._legacy_timing or not edge.temporal_profile,
                    )
                )
        return compiled

    def _effect_size_to_magnitude(self, effect_size: float) -> str:
        if effect_size < 0.10:
            return "none"
        if effect_size < 0.30:
            return "small"
        if effect_size < 0.65:
            return "medium"
        return "large"

    def _clamp(self, value: float, floor: float = 0.0, ceiling: float = 1.0) -> float:
        return max(floor, min(ceiling, value))

    def _group_direct_neighbors(
        self,
        adjacency: Dict[str, List[CompiledEdge]],
        neighbor_field: str,
    ) -> Dict[str, Dict[str, List[str]]]:
        grouped: Dict[str, Dict[str, List[str]]] = {}
        for node_id in self.nodes:
            bucket = {timescale: set() for timescale in TIME_MAP}
            for edge in adjacency.get(node_id, []):
                bucket[edge.at].add(getattr(edge, neighbor_field))
            grouped[node_id] = {
                timescale: sorted(values)
                for timescale, values in bucket.items()
            }
        return grouped

    def _group_reachability(
        self,
        adjacency: Dict[str, List[CompiledEdge]],
        max_tick: int,
        neighbor_field: str,
    ) -> Dict[str, Dict[str, List[str]]]:
        grouped: Dict[str, Dict[str, List[str]]] = {}
        for node_id in self.nodes:
            earliest = self._reachable_by_timescale(node_id, adjacency, max_tick, neighbor_field)
            bucket = {timescale: [] for timescale in TIME_MAP}
            for target_id, tick in earliest.items():
                bucket[REV_TIME_MAP[tick]].append(target_id)
            grouped[node_id] = {
                timescale: sorted(values)
                for timescale, values in bucket.items()
            }
        return grouped

    def _reachable_by_timescale(
        self,
        start: str,
        adjacency: Dict[str, List[CompiledEdge]],
        max_tick: int,
        neighbor_field: str,
    ) -> Dict[str, int]:
        best_tick: Dict[str, int] = {start: 0}
        heap: List[Tuple[int, str]] = [(0, start)]

        while heap:
            current_tick, node_id = heapq.heappop(heap)
            if current_tick > best_tick.get(node_id, max_tick + 1):
                continue
            for edge in adjacency.get(node_id, []):
                neighbor = getattr(edge, neighbor_field)
                next_tick = current_tick + edge.at_tick
                if next_tick > max_tick:
                    continue
                if next_tick >= best_tick.get(neighbor, max_tick + 1):
                    continue
                best_tick[neighbor] = next_tick
                heapq.heappush(heap, (next_tick, neighbor))

        best_tick.pop(start, None)
        return best_tick

    def _logical_adjacency(self) -> Dict[str, Set[str]]:
        adjacency: Dict[str, Set[str]] = {node_id: set() for node_id in self.nodes}
        for edge in self.edges:
            adjacency.setdefault(edge.source, set()).add(edge.target)
            adjacency.setdefault(edge.target, set())
        return adjacency

    def _strongly_connected_components(self, adjacency: Dict[str, Set[str]]) -> List[List[str]]:
        index = 0
        stack: List[str] = []
        on_stack: Set[str] = set()
        indexes: Dict[str, int] = {}
        lowlinks: Dict[str, int] = {}
        components: List[List[str]] = []

        def strongconnect(node_id: str) -> None:
            nonlocal index
            indexes[node_id] = index
            lowlinks[node_id] = index
            index += 1
            stack.append(node_id)
            on_stack.add(node_id)

            for neighbor in adjacency.get(node_id, set()):
                if neighbor not in indexes:
                    strongconnect(neighbor)
                    lowlinks[node_id] = min(lowlinks[node_id], lowlinks[neighbor])
                elif neighbor in on_stack:
                    lowlinks[node_id] = min(lowlinks[node_id], indexes[neighbor])

            if lowlinks[node_id] != indexes[node_id]:
                return

            component: List[str] = []
            while stack:
                member = stack.pop()
                on_stack.remove(member)
                component.append(member)
                if member == node_id:
                    break
            if len(component) > 1 or node_id in adjacency.get(node_id, set()):
                components.append(sorted(component))

        for node_id in adjacency:
            if node_id not in indexes:
                strongconnect(node_id)

        return sorted(components, key=lambda component: (len(component), component))

    def _build_feedback_clusters(self, sccs: List[List[str]]) -> List[Dict[str, Any]]:
        clusters: List[Dict[str, Any]] = []
        for component in sccs:
            node_set = set(component)
            cluster_edges = [
                edge for edge in self.edges
                if edge.source in node_set and edge.target in node_set
            ]
            compiled_edges = [
                edge for edge in self.compiled_edges
                if edge.source in node_set and edge.target in node_set
            ]
            if not cluster_edges:
                continue

            edge_signs = {
                "positive" if edge.rel in POSITIVE_RELATIONS else "negative"
                for edge in cluster_edges
            }
            seen_pairs = {
                (edge.source, edge.target)
                for edge in cluster_edges
            }
            reciprocal_pairs = sorted(
                {
                    tuple(sorted((source, target)))
                    for source, target in seen_pairs
                    if (target, source) in seen_pairs and source != target
                }
            )
            has_reciprocal = bool(reciprocal_pairs) or any(edge.source == edge.target for edge in cluster_edges)
            mixed_sign = len(edge_signs) > 1
            if not (has_reciprocal or mixed_sign):
                continue

            clusters.append(
                {
                    "nodes": component,
                    "edges": [
                        f"{edge.source} {edge.rel} {edge.target}"
                        for edge in sorted(cluster_edges, key=lambda item: (item.source, item.target, item.rel))
                    ],
                    "mixed_sign": mixed_sign,
                    "reciprocal": has_reciprocal,
                    "has_delayed_phase": any(edge.at_tick > 0 for edge in compiled_edges),
                    "reciprocal_pairs": [list(pair) for pair in reciprocal_pairs],
                }
            )
        return clusters

    def _review_candidates(self, feedback_clusters: List[Dict[str, Any]]) -> Dict[str, Any]:
        feedback_node_sets = [set(cluster["nodes"]) for cluster in feedback_clusters]
        reciprocal_edges = sorted(
            {
                tuple(pair)
                for cluster in feedback_clusters
                for pair in cluster["reciprocal_pairs"]
            }
        )

        immediate_only_high_weight_edges: List[str] = []
        for edge in self.edges:
            source_target_phases = [
                compiled
                for compiled in self.compiled_edges
                if compiled.source == edge.source and compiled.target == edge.target
            ]
            if not source_target_phases:
                continue
            if not all(compiled.at_tick == 0 for compiled in source_target_phases):
                continue
            if edge.weight < 0.7:
                continue
            if not any(edge.source in node_set and edge.target in node_set for node_set in feedback_node_sets):
                continue
            immediate_only_high_weight_edges.append(
                f"{edge.source} {edge.rel} {edge.target}"
            )

        return {
            "reciprocal_edges": [list(pair) for pair in reciprocal_edges],
            "fast_feedback_loops": [
                cluster for cluster in feedback_clusters
                if not cluster["has_delayed_phase"]
            ],
            "immediate_only_high_weight_edges": sorted(set(immediate_only_high_weight_edges)),
        }
