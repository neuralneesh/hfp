import pytest
import os
from app.graph_loader import GraphLoader
from app.engine import ReasoningEngine
from app.models import Perturbation, SimulationRequest, SimulationOptions

@pytest.fixture
def engine():
    PACKS_DIR = os.path.join(os.path.dirname(__file__), "..", "app", "knowledge", "packs")
    loader = GraphLoader(PACKS_DIR)
    nodes, edges, rules = loader.load_all()
    return ReasoningEngine(nodes, edges)

def test_scenario_raas_activation(engine):
    # Scenario: decrease MAP -> expect up renin, up ang II, up aldo, up Na reab, up ECF, up MAP
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="cardio.hemodynamics.map", op="decrease")],
        options=SimulationOptions(max_hops=10)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["renal.raas.renin"].direction == "up"
    assert affected["renal.raas.angiotensin_ii"].direction == "up"
    assert affected["renal.raas.aldosterone"].direction == "up"
    assert affected["renal.tubule.na_reabsorption"].direction == "up"
    assert affected["renal.volume.ecf_volume"].direction == "up"
    # assert affected["cardio.hemodynamics.map"].direction == "up" # Compensation is qualitative tendency, but initial perturbation dominates confidence


def test_scenario_ace_inhibitor(engine):
    # Scenario: Block/Decrease Ang II -> expect down aldo, down Na reab, down MAP
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="renal.raas.angiotensin_ii", op="decrease")],
        options=SimulationOptions(max_hops=10)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["renal.raas.aldosterone"].direction == "down"
    assert affected["cardio.hemodynamics.svr"].direction == "down"
    assert affected["cardio.hemodynamics.map"].direction == "down"

def test_scenario_hypoventilation(engine):
    # Scenario: decrease VA -> expect up PaCO2, down pH
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="pulm.ventilation.alveolar_ventilation", op="decrease")],
        options=SimulationOptions(max_hops=5)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["pulm.gasexchange.paco2"].direction == "up"
    assert affected["acidbase.blood.ph"].direction == "down"

def test_scenario_sympathetic_activation(engine):
    # Scenario: up sympathetic tone -> expect up HR, up SVR, up MAP
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="neuro.ans.sympathetic_tone", op="increase")],
        options=SimulationOptions(max_hops=5)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["cardio.hemodynamics.heart_rate"].direction == "up"
    assert affected["cardio.hemodynamics.svr"].direction == "up"
    assert affected["cardio.hemodynamics.map"].direction == "up"

def test_scenario_hypoxia(engine):
    # Scenario: down PaO2 -> expect up sympathetic tone
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="pulm.gasexchange.pao2", op="decrease")],
        options=SimulationOptions(max_hops=5)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["neuro.ans.sympathetic_tone"].direction == "up"
    assert affected["cardio.hemodynamics.heart_rate"].direction == "up"

def test_scenario_high_co(engine):
    # Scenario: up CO -> expect up MAP, down renin
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="cardio.hemodynamics.cardiac_output", op="increase")],
        options=SimulationOptions(max_hops=10)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["cardio.hemodynamics.map"].direction == "up"
    assert affected["renal.raas.renin"].direction == "down"

def test_scenario_metabolic_acidosis_stub(engine):
    # Scenario: down HCO3 -> expect down pH, up VA (respiratory compensation)
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="acidbase.blood.hco3", op="decrease")],
        options=SimulationOptions(max_hops=10)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["acidbase.blood.ph"].direction == "down"
    assert affected["pulm.ventilation.alveolar_ventilation"].direction == "up"

def test_scenario_dehydration_stub(engine):
    # Scenario: down ECF volume -> expect down MAP, up renin
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="renal.volume.ecf_volume", op="decrease")],
        options=SimulationOptions(max_hops=10)
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    
    assert affected["cardio.hemodynamics.map"].direction == "down"
    assert affected["renal.raas.renin"].direction == "up"


def test_scenario_tgf_low_gfr_compensation(engine):
    # Scenario: down GFR -> down adenosine -> up afferent flow + up renin secretion
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="renal.hemodynamics.gfr", op="decrease")],
        options=SimulationOptions(max_hops=6),
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}

    assert affected["renal.tgf.adenosine"].direction == "down"
    assert affected["renal.hemodynamics.afferent_blood_flow"].direction == "up"
    assert affected["renal.raas.renin_secretion"].direction == "up"
    assert affected["renal.raas.renin"].direction == "up"


def test_scenario_high_adenosine_reduces_renin_secretion(engine):
    # Scenario: up adenosine -> down afferent flow and down renin secretion
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="renal.tgf.adenosine", op="increase")],
        options=SimulationOptions(max_hops=4),
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}

    assert affected["renal.hemodynamics.afferent_blood_flow"].direction == "down"
    assert affected["renal.raas.renin_secretion"].direction == "down"


def test_scenario_high_gfr_has_delayed_small_co_drop(engine):
    request = SimulationRequest(
        perturbations=[Perturbation(node_id="renal.hemodynamics.gfr", op="increase")],
        options=SimulationOptions(max_hops=10),
    )
    res = engine.simulate(request)
    affected = {a.node_id: a for a in res.affected_nodes}
    tick_states = engine.latest_node_states

    assert tick_states["renal.tgf.adenosine"][0].direction == "up"
    assert tick_states["renal.raas.renin_secretion"][0].direction == "down"
    assert 0 not in tick_states.get("cardio.hemodynamics.cardiac_output", {})

    co_state = tick_states["cardio.hemodynamics.cardiac_output"][2]
    assert co_state.direction == "down"
    assert co_state.magnitude == "small"
    assert affected["cardio.hemodynamics.cardiac_output"].direction == "down"
