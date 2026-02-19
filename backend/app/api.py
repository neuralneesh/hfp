from fastapi import APIRouter, HTTPException
from typing import List
from .models import SimulationRequest, SimulationResponse, Node, Edge
from .graph_loader import GraphLoader
from .engine import ReasoningEngine
import os

router = APIRouter()

# Initialize graph loader and engine
PACKS_DIR = os.path.join(os.path.dirname(__file__), "knowledge", "packs")
loader = GraphLoader(PACKS_DIR)
nodes, edges, rules = loader.load_all()
engine = ReasoningEngine(nodes, edges)

@router.get("/graph")
async def get_graph():
    return {
        "nodes": list(nodes.values()),
        "edges": [e.model_dump() for e in edges],
        "rules": [r.model_dump() for r in rules]
    }

@router.post("/simulate", response_model=SimulationResponse)
async def simulate(request: SimulationRequest):
    try:
        result = engine.simulate(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/reload")
async def reload_graph():
    global nodes, edges, rules, engine
    nodes, edges, rules = loader.load_all()
    engine = ReasoningEngine(nodes, edges)
    return {"status": "success", "node_count": len(nodes)}
