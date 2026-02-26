from fastapi import APIRouter, HTTPException
from typing import List, Dict, Optional
from .models import (
    SimulationRequest,
    SimulationResponse,
    CompareSimulationRequest,
    CompareSimulationResponse,
    ComparedNode,
    AffectedNode,
    Node,
    Edge,
)
from .graph_loader import GraphLoader
from .engine import ReasoningEngine
from .context_baselines import apply_context_baselines
import os

router = APIRouter()

# Initialize graph loader and engine
PACKS_DIR = os.path.join(os.path.dirname(__file__), "knowledge", "packs")
loader = GraphLoader(PACKS_DIR)
nodes, edges, rules = loader.load_all()
engine = ReasoningEngine(nodes, edges, loader.syndromes)


def _reload_engine_state():
    global nodes, edges, rules, engine
    nodes, edges, rules = loader.load_all()
    engine = ReasoningEngine(nodes, edges, loader.syndromes)


def _index_affected_by_node(affected_nodes: List[AffectedNode]) -> Dict[str, AffectedNode]:
    return {item.node_id: item for item in affected_nodes}


def _classify_change(
    baseline: Optional[AffectedNode],
    intervention: Optional[AffectedNode],
) -> ComparedNode:
    baseline_dir = baseline.direction if baseline else None
    intervention_dir = intervention.direction if intervention else None
    baseline_conf = baseline.confidence if baseline else 0.0
    intervention_conf = intervention.confidence if intervention else 0.0

    if not baseline and intervention:
        change_type = "new"
    elif baseline and not intervention:
        change_type = "resolved"
    elif baseline and intervention and baseline_dir != intervention_dir:
        change_type = "direction_flip"
    elif intervention_conf > baseline_conf + 0.05:
        change_type = "strengthened"
    elif baseline_conf > intervention_conf + 0.05:
        change_type = "weakened"
    else:
        change_type = "unchanged"

    node_id = intervention.node_id if intervention else baseline.node_id if baseline else ""
    return ComparedNode(
        node_id=node_id,
        baseline_direction=baseline_dir,
        intervention_direction=intervention_dir,
        baseline_confidence=baseline_conf,
        intervention_confidence=intervention_conf,
        confidence_delta=intervention_conf - baseline_conf,
        change_type=change_type,
    )

@router.get("/graph")
async def get_graph():
    return {
        "nodes": list(nodes.values()),
        "edges": [e.model_dump() for e in edges],
        "rules": [r.model_dump() for r in rules],
        "syndromes": [s.model_dump() for s in loader.syndromes],
    }

@router.post("/simulate", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    try:
        # Keep simulations in sync with edited knowledge packs without requiring a manual restart.
        _reload_engine_state()
        request_with_baselines = request.model_copy(
            update={
                "perturbations": apply_context_baselines(
                    request.perturbations,
                    request.context,
                )
            }
        )
        result = engine.simulate(request_with_baselines)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/compare", response_model=CompareSimulationResponse)
async def compare_simulations(request: CompareSimulationRequest):
    try:
        _reload_engine_state()

        baseline_request = request.baseline.model_copy(
            update={
                "perturbations": apply_context_baselines(
                    request.baseline.perturbations,
                    request.baseline.context,
                )
            }
        )
        intervention_request = request.intervention.model_copy(
            update={
                "perturbations": apply_context_baselines(
                    request.intervention.perturbations,
                    request.intervention.context,
                )
            }
        )

        baseline_res = engine.simulate(baseline_request)
        intervention_res = engine.simulate(intervention_request)

        baseline_map = _index_affected_by_node(baseline_res.affected_nodes)
        intervention_map = _index_affected_by_node(intervention_res.affected_nodes)
        changed: List[ComparedNode] = []
        for node_id in sorted(set(baseline_map.keys()) | set(intervention_map.keys())):
            item = _classify_change(baseline_map.get(node_id), intervention_map.get(node_id))
            if item.change_type != "unchanged":
                changed.append(item)

        changed.sort(key=lambda item: abs(item.confidence_delta), reverse=True)

        return CompareSimulationResponse(
            baseline=baseline_res,
            intervention=intervention_res,
            changed_nodes=changed,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reload")
async def reload_graph():
    _reload_engine_state()
    return {"status": "success", "node_count": len(nodes), "syndrome_count": len(loader.syndromes)}
