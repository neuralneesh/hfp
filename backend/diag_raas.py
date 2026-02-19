import collections
from app.models import Node, Edge, Perturbation, SimulationRequest, SimulationOptions
from app.engine import ReasoningEngine

# Mocking the graph state for the user's scenario
nodes = {
    "cardio.hemodynamics.heart_rate": Node(id="cardio.hemodynamics.heart_rate", label="HR", domain="cardio", type="variable"),
    "cardio.hemodynamics.cardiac_output": Node(id="cardio.hemodynamics.cardiac_output", label="CO", domain="cardio", type="variable"),
    "cardio.hemodynamics.map": Node(id="cardio.hemodynamics.map", label="MAP", domain="cardio", type="variable"),
    "neuro.ans.sympathetic_tone": Node(id="neuro.ans.sympathetic_tone", label="Symp", domain="neuro", type="process"),
    "renal.raas.renin": Node(id="renal.raas.renin", label="Renin", domain="renal", type="hormone"),
    "renal.raas.angiotensin_ii": Node(id="renal.raas.angiotensin_ii", label="Ang II", domain="renal", type="hormone"),
    "renal.raas.aldosterone": Node(id="renal.raas.aldosterone", label="Aldo", domain="renal", type="hormone"),
    "cardio.hemodynamics.stroke_volume": Node(id="cardio.hemodynamics.stroke_volume", label="SV", domain="cardio", type="variable"),
}

edges = [
    Edge(source="cardio.hemodynamics.heart_rate", target="cardio.hemodynamics.cardiac_output", rel="increases", weight=0.8, context={"beta_blocker": False}),
    Edge(source="cardio.hemodynamics.stroke_volume", target="cardio.hemodynamics.cardiac_output", rel="increases", weight=0.9, context={"heart_failure": False}),
    Edge(source="cardio.hemodynamics.cardiac_output", target="cardio.hemodynamics.map", rel="increases", weight=1.0),
    Edge(source="cardio.hemodynamics.map", target="neuro.ans.sympathetic_tone", rel="decreases", weight=1.0),
    Edge(source="cardio.hemodynamics.map", target="renal.raas.renin", rel="decreases", weight=0.7),
    Edge(source="neuro.ans.sympathetic_tone", target="renal.raas.renin", rel="increases", weight=0.9, priority="high"),
    Edge(source="cardio.hemodynamics.heart_rate", target="cardio.hemodynamics.stroke_volume", rel="decreases", weight=0.3),
    Edge(source="renal.raas.renin", target="renal.raas.angiotensin_ii", rel="increases", weight=1.0),
    Edge(source="renal.raas.angiotensin_ii", target="renal.raas.aldosterone", rel="increases", weight=0.8),
]

engine = ReasoningEngine(nodes, edges)

req = SimulationRequest(
    perturbations=[Perturbation(node_id="cardio.hemodynamics.heart_rate", op="increase")],
    context={"heart_failure": True, "dehydration": True, "ckd": True, "copd": True},
    options=SimulationOptions(max_hops=10, time_window="all")
)

res = engine.simulate(req)

print(f"--- Simulation Results ---")
for node in res.affected_nodes:
    print(f"Node: {node.node_id}, Dir: {node.direction}, Conf: {node.confidence:.2f}, Tick: {node.tick}")

print(f"\n--- Traces for Angiotensin II ---")
for trace in res.traces.get("renal.raas.angiotensin_ii", []):
    print(f"Conf: {trace.confidence:.2f}, Trace: {' -> '.join(trace.steps)}")
