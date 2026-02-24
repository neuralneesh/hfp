import os

from app.context_baselines import apply_context_baselines
from app.engine import ReasoningEngine
from app.graph_loader import GraphLoader
from app.models import Perturbation, SimulationOptions, SimulationRequest


def _engine() -> ReasoningEngine:
    packs_dir = os.path.join(os.path.dirname(__file__), "..", "app", "knowledge", "packs")
    loader = GraphLoader(packs_dir)
    nodes, edges, rules = loader.load_all()
    return ReasoningEngine(nodes, edges, loader.syndromes)


def test_ckd_context_injects_baseline_renal_impairment():
    with_ckd = apply_context_baselines([], {"ckd": True})
    without_ckd = apply_context_baselines([], {})
    ckd_nodes = {p.node_id for p in with_ckd}

    assert "renal.tubule.na_reabsorption" in ckd_nodes
    assert "renal.metabolism.potassium" in ckd_nodes
    assert without_ckd == []

    req = SimulationRequest(
        perturbations=with_ckd,
        context={"ckd": True},
        options=SimulationOptions(max_hops=4),
    )
    res = _engine().simulate(req)

    assert len(res.affected_nodes) > 0


def test_user_perturbation_precedes_context_default_for_same_node():
    perturbations = [Perturbation(node_id="renal.metabolism.potassium", op="decrease")]
    merged = apply_context_baselines(perturbations, {"ckd": True})
    potassium_ops = [p.op for p in merged if p.node_id == "renal.metabolism.potassium"]

    assert potassium_ops == ["decrease"]


def test_ckd_context_impedes_renal_downstream_response():
    engine = _engine()
    base_perturbations = [Perturbation(node_id="renal.raas.renin", op="increase")]

    no_ckd_req = SimulationRequest(
        perturbations=apply_context_baselines(base_perturbations, {}),
        context={},
        options=SimulationOptions(max_hops=8),
    )
    ckd_req = SimulationRequest(
        perturbations=apply_context_baselines(base_perturbations, {"ckd": True}),
        context={"ckd": True},
        options=SimulationOptions(max_hops=8),
    )

    no_ckd = {a.node_id: a.direction for a in engine.simulate(no_ckd_req).affected_nodes}
    ckd = {a.node_id: a.direction for a in engine.simulate(ckd_req).affected_nodes}

    assert no_ckd.get("renal.volume.ecf_volume") == "up"
    assert ckd.get("renal.volume.ecf_volume") is None
    assert no_ckd.get("renal.metabolism.potassium") == "down"
    assert ckd.get("renal.metabolism.potassium") == "up"


def test_context_only_simulation_produces_syndrome_summaries():
    engine = _engine()
    context = {"copd": True}
    req = SimulationRequest(
        perturbations=apply_context_baselines([], context),
        context=context,
        options=SimulationOptions(max_hops=10),
    )
    res = engine.simulate(req)

    summaries = [
        trace.summary
        for traces in res.traces.values()
        for trace in traces
        if trace.summary
    ]

    assert summaries
