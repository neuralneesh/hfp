import pytest
from app.engine import ReasoningEngine
from app.models import Node, Edge, Perturbation, SimulationRequest, SimulationOptions

@pytest.fixture
def engine():
    nodes = {
        "A": Node(id="A", label="A", domain="cardio", type="variable"),
        "B": Node(id="B", label="B", domain="renal", type="variable"),
        "C": Node(id="C", label="C", domain="cardio", type="variable")
    }
    edges = [
        Edge(source="A", target="B", rel="increases", weight=1.0),
        Edge(source="B", target="C", rel="decreases", weight=1.0)
    ]
    return ReasoningEngine(nodes, edges)

def test_propagation_up(engine):
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="A", op="increase")],
        options=SimulationOptions(max_hops=2)
    )
    res = engine.simulate(request)
    
    affected = {a.node_id: a for a in res.affected_nodes}
    assert affected["A"].direction == "up"
    assert affected["B"].direction == "up"
    assert affected["C"].direction == "down"

def test_propagation_down(engine):
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="A", op="decrease")],
        options=SimulationOptions(max_hops=2)
    )
    res = engine.simulate(request)
    
    affected = {a.node_id: a for a in res.affected_nodes}
    assert affected["A"].direction == "down"
    assert affected["B"].direction == "down"
    assert affected["C"].direction == "up"

def test_traces(engine):
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="A", op="increase")],
        options=SimulationOptions(max_hops=2)
    )
    res = engine.simulate(request)
    assert "C" in res.traces
    assert len(res.traces["C"][0].path) == 3
    assert res.traces["C"][0].path == ["A", "B", "C"]
