from typing import List, Optional, Dict, Literal
from pydantic import BaseModel, Field

class Node(BaseModel):
    id: str
    label: str
    domain: Literal["cardio", "pulm", "renal", "acidbase", "neuro"]
    subdomain: Optional[str] = None
    type: str  # hormone, variable, organ, vessel, process
    state_type: Literal["qualitative", "numeric"] = "qualitative"
    unit: Optional[str] = None
    normal_range: Optional[Dict[str, float]] = None
    aliases: List[str] = []
    time_constant: Literal["acute", "subacute", "chronic"] = "acute"
    baseline_level: float = 0.0
    min_level: float = -1.0
    max_level: float = 1.0
    
    # Current state for simulation
    direction: Literal["up", "down", "unknown", "unchanged"] = "unchanged"
    value: Optional[float] = None

class Edge(BaseModel):
    source: str
    target: str
    rel: Literal["increases", "decreases", "converts_to", "requires", "enables", "precedes", "part_of", "causes", "refines", "derives"]
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    delay: Literal["immediate", "minutes", "hours", "days"] = "immediate"
    priority: Literal["low", "medium", "high"] = "medium"
    activation_direction: Literal["up", "down", "any"] = "any"
    activation_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
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


class ComparedNode(BaseModel):
    node_id: str
    baseline_direction: Optional[Literal["up", "down", "unknown", "unchanged"]] = None
    intervention_direction: Optional[Literal["up", "down", "unknown", "unchanged"]] = None
    baseline_confidence: float = 0.0
    intervention_confidence: float = 0.0
    confidence_delta: float = 0.0
    change_type: Literal["new", "resolved", "direction_flip", "strengthened", "weakened", "unchanged"]


class CompareSimulationRequest(BaseModel):
    baseline: SimulationRequest
    intervention: SimulationRequest


class CompareSimulationResponse(BaseModel):
    baseline: SimulationResponse
    intervention: SimulationResponse
    changed_nodes: List[ComparedNode]
