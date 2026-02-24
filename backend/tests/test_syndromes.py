import os
import pytest
from app.graph_loader import GraphLoader
from app.engine import ReasoningEngine
from app.models import Perturbation, SimulationRequest, SimulationOptions


@pytest.fixture
def engine():
    packs_dir = os.path.join(os.path.dirname(__file__), "..", "app", "knowledge", "packs")
    loader = GraphLoader(packs_dir)
    nodes, edges, rules = loader.load_all()
    return ReasoningEngine(nodes, edges, loader.syndromes)


def test_alkalemia_syndrome_summary(engine):
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="acidbase.blood.h_concentration", op="decrease")],
        options=SimulationOptions(max_hops=10),
    )
    res = engine.simulate(request)

    assert "cardio.hemodynamics.heart_rate" in res.traces
    summaries = [trace.summary for trace in res.traces["cardio.hemodynamics.heart_rate"] if trace.summary]
    assert "Alkalemia-induced Vasodilation followed by Baroreceptor Reflex" in summaries
