from fastapi import APIRouter, HTTPException
from typing import List
from .models import SimulationRequest, SimulationResponse, Node, Edge
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

@router.post("/reload")
async def reload_graph():
    _reload_engine_state()
    return {"status": "success", "node_count": len(nodes), "syndrome_count": len(loader.syndromes)}
