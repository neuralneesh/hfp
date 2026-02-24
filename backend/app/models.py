from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field

class Node(BaseModel):
    id: str
    label: str
    domain: Literal["cardio", "pulm", "renal", "acidbase", "neuro"]
    type: str  # hormone, variable, organ, vessel, process
    state_type: Literal["qualitative", "numeric"] = "qualitative"
    unit: Optional[str] = None
    normal_range: Optional[Dict[str, float]] = None
    aliases: List[str] = []
    
    # Current state for simulation
    direction: Literal["up", "down", "unknown", "unchanged"] = "unchanged"
    value: Optional[float] = None

class Edge(BaseModel):
    source: str
    target: str
    rel: Literal["increases", "decreases", "converts_to", "requires"]
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    delay: Literal["immediate", "minutes", "hours", "days"] = "immediate"
    priority: Literal["low", "medium", "high"] = "medium"
    context: Dict[str, bool] = {}
    description: Optional[str] = None

class Rule(BaseModel):
    id: str
    when: str # expression
    then: Dict[str, str] # e.g. {"node_id": "up"}
    description: Optional[str] = None

class DomainPack(BaseModel):
    name: str
    nodes: List[Node] = []
    edges: List[Edge] = []
    rules: List[Rule] = []

class Syndrome(BaseModel):
    id: str
    label: str
    sequence: List[str]

class Perturbation(BaseModel):
    node_id: str
    op: Literal["increase", "decrease", "block", "set"]
    value: Optional[float] = None

class SimulationOptions(BaseModel):
    max_hops: int = 5
    min_confidence: float = 0.1
    time_window: Literal["immediate", "minutes", "hours", "days", "all"] = "all"
    dim_unaffected: bool = True

class SimulationRequest(BaseModel):
    perturbations: List[Perturbation]
    context: Dict[str, bool] = {}
    options: SimulationOptions = SimulationOptions()

class TraceStep(BaseModel):
    path: List[str]
    steps: List[str]
    confidence: float
    summary: Optional[str] = None

class AffectedNode(BaseModel):
    node_id: str
    direction: Literal["up", "down", "unknown", "unchanged"]
    magnitude: Literal["none", "small", "medium", "large"] = "none"
    confidence: float
    timescale: Literal["immediate", "minutes", "hours", "days"]
    tick: int = 0  # Which simulation step this was recorded in

class SimulationResponse(BaseModel):
    affected_nodes: List[AffectedNode]
    traces: Dict[str, List[TraceStep]]
    max_ticks: int = 1
