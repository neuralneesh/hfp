from typing import List, Dict, Tuple, Optional
from .models import (
    Node, Edge, Perturbation, SimulationRequest, SimulationResponse, 
    AffectedNode, TraceStep, Syndrome
)
import collections

class ReasoningEngine:
    def __init__(self, nodes: Dict[str, Node], edges: List[Edge], syndromes: Optional[List[Syndrome]] = None):
        self.nodes = nodes
        self.edges = edges
        self.syndromes = syndromes or []
        # Backward-compatible snapshot of per-tick resolved states from the latest simulation.
        self.latest_node_states: Dict[str, Dict[int, AffectedNode]] = {}
        self.adj: Dict[str, List[Edge]] = collections.defaultdict(list)
        for edge in self.edges:
            self.adj[edge.source].append(edge)

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        # node_states: node_id -> tick -> AffectedNode
        node_states: Dict[str, Dict[int, AffectedNode]] = collections.defaultdict(dict)
        node_activity: Dict[str, Dict[int, float]] = collections.defaultdict(dict)
        traces: Dict[str, List[TraceStep]] = collections.defaultdict(list)
        
        time_map = {"immediate": 0, "minutes": 1, "hours": 2, "days": 3}
        max_tick = time_map.get(request.options.time_window, 3) if request.options.time_window != "all" else 3

        # influence_buffer: node_id -> tick -> list of influences
        influence_buffer = collections.defaultdict(lambda: collections.defaultdict(list))

        # Initial perturbations (Tick 0)
        for p in request.perturbations:
            direction = "up" if p.op == "increase" else "down" if p.op == "decrease" else "unchanged"
            if p.node_id not in self.nodes: continue
            
            influence_buffer[p.node_id][0].append({
                "direction": direction,
                "confidence": 1.0,
                "priority": "ultra", # Manual is ultra high
                "path": [p.node_id],
                "steps": []
            })

        # Process ticks sequentially
        for tick in range(max_tick + 1):
            nodes_to_resolve = set(influence_buffer.keys())
            resolved_in_this_tick = set()
            
            while nodes_to_resolve:
                curr_node_id = nodes_to_resolve.pop()
                if tick not in influence_buffer[curr_node_id]:
                    continue
                
                # Resolve influenced state
                resolved = self._resolve_influence(influence_buffer[curr_node_id][tick], curr_node_id, tick)
                if not resolved:
                    continue
                
                # Check for stability to avoid unnecessary re-propagation
                prev = node_states[curr_node_id].get(tick)
                if prev and prev.direction == resolved.direction and abs(prev.confidence - resolved.confidence) < 0.01:
                    continue
                
                node_states[curr_node_id][tick] = resolved
                node_activity[curr_node_id][tick] = resolved.confidence if resolved.direction == "up" else -resolved.confidence
                resolved_in_this_tick.add(curr_node_id)

                # Propagate from this node
                for edge in self.adj[curr_node_id]:
                    if not self._context_matches(edge, request.context):
                        continue
                    
                    # Trace building: Find the best trace leading TO this curr_node_id
                    # that resulted in the correct direction for this path
                    best_prev_trace = None
                    if curr_node_id in traces:
                        # Find the state of this node in the current path (approximate by looking at previous step)
                        traces[curr_node_id].sort(key=lambda x: x.confidence, reverse=True)
                        best_prev_trace = traces[curr_node_id][0]

                    source_dir_for_path = best_prev_trace.steps[-1].split(" → ")[1].split(" ")[0].lower() if best_prev_trace and " → " in best_prev_trace.steps[-1] else resolved.direction
                    if source_dir_for_path == "increased": source_dir_for_path = "up"
                    if source_dir_for_path == "decreased": source_dir_for_path = "down"

                    target_id = edge.target
                    target_dir = self._propagate_direction(source_dir_for_path, edge.rel)
                    source_level = self._source_level(curr_node_id, tick, node_activity)
                    source_strength = abs(source_level)

                    threshold_gain = self._activation_threshold_gain(edge, source_dir_for_path, source_strength)
                    saturation_gain = self._saturation_gain(curr_node_id, source_dir_for_path, source_level)
                    time_gain = self._time_constant_gain(curr_node_id)
                    target_conf = resolved.confidence * edge.weight * threshold_gain * saturation_gain * time_gain
                    if target_conf < request.options.min_confidence:
                        continue
                    
                    delay_val = time_map.get(edge.delay, 0)
                    next_tick = tick + delay_val
                    if next_tick > 3: continue

                    path = (best_prev_trace.path if best_prev_trace else [curr_node_id]) + [target_id]
                    step_desc = self._generate_step_description(curr_node_id, target_id, source_dir_for_path, target_dir, edge.rel)
                    steps = (best_prev_trace.steps if best_prev_trace else []) + [step_desc]

                    influence_buffer[target_id][next_tick].append({
                        "direction": target_dir,
                        "confidence": target_conf,
                        "priority": edge.priority,
                        "path": path,
                        "steps": steps
                    })
                    
                    self._upsert_trace(traces, target_id, path, steps, target_conf)

                    if delay_val == 0:
                        nodes_to_resolve.add(target_id)

        # Build response
        all_affected = []
        for node_id, tick_states in node_states.items():
            # Surface the dominant resolved effect, not merely the latest tick.
            # This avoids delayed feedback loops masking the primary direction.
            if tick_states:
                best_tick = max(
                    tick_states.keys(),
                    key=lambda t: (tick_states[t].confidence, -t),
                )
                all_affected.append(tick_states[best_tick])

        # Preserve full timeline for debugging scripts/tests that inspect tick-level states.
        self.latest_node_states = dict(node_states)

        return SimulationResponse(
            affected_nodes=all_affected,
            traces=dict(traces),
            max_ticks=max_tick
        )

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

        traces[target_id].sort(key=lambda x: x.confidence, reverse=True)
        traces[target_id] = traces[target_id][:3]

    def _build_trace_summary(self, path: List[str]) -> Optional[str]:
        if not path or len(path) < 2:
            return None

        matched_items: List[Tuple[int, str]] = []
        for syndrome in self.syndromes:
            start_idx = self._subsequence_start_index(path, syndrome.sequence)
            if start_idx is not None:
                matched_items.append((start_idx, syndrome.label))

        if not matched_items:
            return None

        matched_items.sort(key=lambda item: item[0])
        deduped: List[str] = []
        for _, label in matched_items:
            if label not in deduped:
                deduped.append(label)

        if len(deduped) == 1:
            return deduped[0]
        if len(deduped) == 2:
            return f"{deduped[0]} followed by {deduped[1]}"
        return ", ".join(deduped[:-1]) + f", followed by {deduped[-1]}"

    def _subsequence_start_index(self, path: List[str], sequence: List[str]) -> Optional[int]:
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
                    return first_match_idx
        return None

    def _resolve_influence(self, influences, node_id, tick) -> Optional[AffectedNode]:
        if not influences: return None
        
        pri_map = {"low": 1, "medium": 2, "high": 3, "ultra": 10}
        max_pri = max(pri_map.get(inf["priority"], 2) for inf in influences)
        top_influences = [inf for inf in influences if pri_map.get(inf["priority"], 2) == max_pri]
        
        up_score = sum(inf["confidence"] for inf in top_influences if inf["direction"] == "up")
        down_score = sum(inf["confidence"] for inf in top_influences if inf["direction"] == "down")
        
        if up_score > down_score:
            direction = "up"
            confidence = (up_score - down_score) / (up_score + down_score + 0.1)
            confidence = max(0.2, min(1.0, confidence + 0.4)) 
        elif down_score > up_score:
            direction = "down"
            confidence = (down_score - up_score) / (up_score + down_score + 0.1)
            confidence = max(0.2, min(1.0, confidence + 0.4))
        else:
            return None
            
        rev_time_map = {0: "immediate", 1: "minutes", 2: "hours", 3: "days"}
        
        return AffectedNode(
            node_id=node_id,
            direction=direction,
            magnitude="medium",
            confidence=confidence,
            timescale=rev_time_map.get(tick, "immediate"),
            tick=tick
        )

    def _generate_step_description(self, source_id, target_id, source_dir, target_dir, rel) -> str:
        source_label = self.nodes[source_id].label
        target_label = self.nodes[target_id].label
        target_state = "Increased" if target_dir == "up" else "Decreased" if target_dir == "down" else target_dir

        if source_dir == "up":
            if rel == "increases" or rel == "enables" or rel == "causes" or rel == "precedes" or rel == "part_of" or rel == "refines" or rel == "derives":
                return f"Increased {source_label} promotes {target_label} → {target_state} {target_label}"
            if rel == "decreases":
                return f"Increased {source_label} inhibits {target_label} → {target_state} {target_label}"
        elif source_dir == "down":
            if rel == "increases" or rel == "enables" or rel == "causes" or rel == "precedes" or rel == "part_of" or rel == "refines" or rel == "derives":
                return f"Reduced {source_label} fails to promote {target_label} → {target_state} {target_label}"
            if rel == "decreases":
                return f"Reduced {source_label} disinhibits {target_label} → {target_state} {target_label}"
        
        return f"{source_label} ({source_dir}) affects {target_label} → {target_state} {target_label}"

    def _context_matches(self, edge: Edge, context: Dict[str, bool]) -> bool:
        for key, val in edge.context.items():
            # Default missing context keys to False
            if context.get(key, False) != val:
                return False
        return True

    def _activation_threshold_gain(self, edge: Edge, source_dir: str, source_strength: float) -> float:
        if edge.activation_threshold is None:
            return 1.0
        if edge.activation_direction != "any" and source_dir != edge.activation_direction:
            return 0.05
        return 1.0 if source_strength >= edge.activation_threshold else 0.05

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
        if direction == "unknown" or direction == "unchanged": return direction
        if rel in {"increases", "converts_to", "requires", "enables", "precedes", "part_of", "causes", "refines", "derives"}:
            return direction
        elif rel == "decreases":
            return "down" if direction == "up" else "up"
        return "unknown"
