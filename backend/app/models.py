from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, PrivateAttr, model_validator

Domain = Literal["cardio", "pulm", "renal", "acidbase", "neuro"]
Relation = Literal[
    "increases",
    "decreases",
    "converts_to",
    "requires",
    "enables",
    "precedes",
    "part_of",
    "causes",
    "refines",
    "derives",
]
Timescale = Literal["immediate", "minutes", "hours", "days"]
Priority = Literal["low", "medium", "high"]
ActivationDirection = Literal["up", "down", "any"]
Direction = Literal["up", "down", "unknown", "unchanged"]
Magnitude = Literal["none", "small", "medium", "large"]

class Node(BaseModel):
    id: str
    label: str
    domain: Domain
    subdomain: Optional[str] = None
    type: str  # hormone, variable, organ, vessel, process
    state_type: Literal["qualitative", "numeric"] = "qualitative"
    unit: Optional[str] = None
    normal_range: Optional[Dict[str, float]] = None
    aliases: List[str] = Field(default_factory=list)
    time_constant: Literal["acute", "subacute", "chronic"] = "acute"
    baseline_level: float = 0.0
    min_level: float = -1.0
    max_level: float = 1.0
    
    # Current state for simulation
    direction: Direction = "unchanged"
    value: Optional[float] = None

class EdgePhase(BaseModel):
    at: Timescale
    rel: Optional[Relation] = None
    weight: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    priority: Optional[Priority] = None
    activation_direction: Optional[ActivationDirection] = None
    activation_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    description: Optional[str] = None

class Edge(BaseModel):
    source: str
    target: str
    rel: Relation
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    delay: Timescale = "immediate"
    priority: Priority = "medium"
    activation_direction: ActivationDirection = "any"
    activation_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    context: Dict[str, bool] = Field(default_factory=dict)
    description: Optional[str] = None
    temporal_profile: List[EdgePhase] = Field(default_factory=list)
    _legacy_timing: bool = PrivateAttr(default=False)

    @model_validator(mode="after")
    def validate_temporal_profile(self) -> "Edge":
        seen_times = set()
        for phase in self.temporal_profile:
            if phase.at in seen_times:
                raise ValueError(
                    f"Temporal profile for {self.source} -> {self.target} repeats at='{phase.at}'"
                )
            seen_times.add(phase.at)

            phase_threshold = (
                phase.activation_threshold
                if phase.activation_threshold is not None
                else self.activation_threshold
            )
            phase_direction = phase.activation_direction or self.activation_direction
            if phase_direction != "any" and phase_threshold is None:
                raise ValueError(
                    f"Temporal profile for {self.source} -> {self.target} sets activation gating"
                    " without a resolved activation_threshold"
                )
        return self

class CompiledEdge(BaseModel):
    source: str
    target: str
    at: Timescale
    at_tick: int
    rel: Relation
    weight: float = Field(default=1.0, ge=0.0, le=1.0)
    priority: Priority = "medium"
    activation_direction: ActivationDirection = "any"
    activation_threshold: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    context: Dict[str, bool] = Field(default_factory=dict)
    description: Optional[str] = None
    is_legacy_timing: bool = False

class Rule(BaseModel):
    id: str
    when: str # expression
    then: Dict[str, str] # e.g. {"node_id": "up"}
    description: Optional[str] = None

class DomainPack(BaseModel):
    name: str
    nodes: List[Node] = Field(default_factory=list)
    edges: List[Edge] = Field(default_factory=list)
    rules: List[Rule] = Field(default_factory=list)

class Syndrome(BaseModel):
    id: str
    label: str
    sequence: List[str] = Field(default_factory=list)

class Perturbation(BaseModel):
    node_id: str
    op: Literal["increase", "decrease", "block", "set"]
    value: Optional[float] = None

class SimulationOptions(BaseModel):
    max_hops: int = 5
    min_confidence: float = 0.1
    min_effect_size: float = 0.05
    time_window: Literal["immediate", "minutes", "hours", "days", "all"] = "all"
    dim_unaffected: bool = True

class SimulationRequest(BaseModel):
    perturbations: List[Perturbation] = Field(default_factory=list)
    context: Dict[str, bool] = Field(default_factory=dict)
    options: SimulationOptions = Field(default_factory=SimulationOptions)

class TraceStep(BaseModel):
    path: List[str] = Field(default_factory=list)
    steps: List[str] = Field(default_factory=list)
    confidence: float
    summary: Optional[str] = None

class AffectedNode(BaseModel):
    node_id: str
    direction: Direction
    magnitude: Magnitude = "none"
    confidence: float
    effect_size: float = Field(default=0.0, ge=0.0, le=1.0)
    timescale: Timescale
    tick: int = 0  # Which simulation step this was recorded in

class SimulationResponse(BaseModel):
    affected_nodes: List[AffectedNode] = Field(default_factory=list)
    traces: Dict[str, List[TraceStep]] = Field(default_factory=dict)
    timelines: Dict[str, List[AffectedNode]] = Field(default_factory=dict)
    max_ticks: int = 1


class ComparedNode(BaseModel):
    node_id: str
    baseline_direction: Optional[Direction] = None
    intervention_direction: Optional[Direction] = None
    baseline_confidence: float = 0.0
    intervention_confidence: float = 0.0
    baseline_effect_size: float = 0.0
    intervention_effect_size: float = 0.0
    confidence_delta: float = 0.0
    effect_size_delta: float = 0.0
    change_type: Literal["new", "resolved", "direction_flip", "strengthened", "weakened", "unchanged"]


class CompareSimulationRequest(BaseModel):
    baseline: SimulationRequest
    intervention: SimulationRequest


class CompareSimulationResponse(BaseModel):
    baseline: SimulationResponse
    intervention: SimulationResponse
    changed_nodes: List[ComparedNode] = Field(default_factory=list)
