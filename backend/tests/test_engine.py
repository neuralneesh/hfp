import pytest
from app.engine import ReasoningEngine
from app.models import Edge, EdgePhase, Node, Perturbation, SimulationOptions, SimulationRequest

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


def test_max_hops_caps_propagation_depth(engine):
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="A", op="increase")],
        options=SimulationOptions(max_hops=1)
    )
    res = engine.simulate(request)

    affected = {a.node_id: a for a in res.affected_nodes}
    assert affected["A"].direction == "up"
    assert affected["B"].direction == "up"
    assert "C" not in affected


def test_temporal_phase_with_only_hours_has_no_immediate_effect():
    nodes = {
        "A": Node(id="A", label="A", domain="cardio", type="variable"),
        "B": Node(id="B", label="B", domain="renal", type="variable"),
    }
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            temporal_profile=[EdgePhase(at="hours")],
        )
    ]
    engine = ReasoningEngine(nodes, edges)
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="A", op="increase")],
        options=SimulationOptions(max_hops=1),
    )

    res = engine.simulate(request)

    assert 0 not in engine.latest_node_states.get("B", {})
    assert engine.latest_node_states["B"][2].direction == "up"
    assert res.timelines["B"][0].timescale == "hours"


def test_temporal_phase_can_change_relation_by_time():
    nodes = {
        "A": Node(id="A", label="A", domain="cardio", type="variable"),
        "B": Node(id="B", label="B", domain="renal", type="variable"),
    }
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            temporal_profile=[
                EdgePhase(at="immediate", rel="increases", weight=0.6),
                EdgePhase(at="hours", rel="decreases", weight=0.2),
            ],
        )
    ]
    engine = ReasoningEngine(nodes, edges)

    engine.simulate(
        SimulationRequest(
            perturbations=[Perturbation(node_id="A", op="increase")],
            options=SimulationOptions(max_hops=1),
        )
    )

    assert engine.latest_node_states["B"][0].direction == "up"
    assert engine.latest_node_states["B"][2].direction == "down"


def test_small_delayed_effects_survive_with_effect_size_threshold():
    nodes = {
        "A": Node(id="A", label="A", domain="cardio", type="variable"),
        "B": Node(id="B", label="B", domain="renal", type="variable"),
        "C": Node(id="C", label="C", domain="pulm", type="variable"),
    }
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            temporal_profile=[EdgePhase(at="hours", weight=0.2)],
        ),
        Edge(
            source="B",
            target="C",
            rel="increases",
            temporal_profile=[EdgePhase(at="immediate", weight=0.6)],
        ),
    ]
    engine = ReasoningEngine(nodes, edges)

    engine.simulate(
        SimulationRequest(
            perturbations=[Perturbation(node_id="A", op="increase")],
            options=SimulationOptions(max_hops=2, min_effect_size=0.05),
        )
    )

    c_state = engine.latest_node_states["C"][2]
    assert c_state.direction == "up"
    assert c_state.effect_size == pytest.approx(0.12)
    assert c_state.magnitude == "small"


def test_summary_prefers_stronger_earlier_effect_over_weaker_feedback():
    nodes = {
        "A": Node(id="A", label="A", domain="cardio", type="variable"),
        "B": Node(id="B", label="B", domain="renal", type="variable"),
    }
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            temporal_profile=[
                EdgePhase(at="immediate", rel="increases", weight=0.6),
                EdgePhase(at="hours", rel="decreases", weight=0.2),
            ],
        )
    ]
    engine = ReasoningEngine(nodes, edges)
    res = engine.simulate(
        SimulationRequest(
            perturbations=[Perturbation(node_id="A", op="increase")],
            options=SimulationOptions(max_hops=1),
        )
    )

    affected = {a.node_id: a for a in res.affected_nodes}
    assert affected["B"].direction == "up"
    assert affected["B"].effect_size == pytest.approx(0.6)
    assert engine.latest_node_states["B"][2].direction == "down"
