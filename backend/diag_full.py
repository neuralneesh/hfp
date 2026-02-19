import yaml
import os
import collections
from app.models import Node, Edge, Perturbation, SimulationRequest, SimulationOptions
from app.engine import ReasoningEngine

def load_packs():
    nodes = {}
    edges = []
    pack_dir = "app/knowledge/packs"
    for domain in os.listdir(pack_dir):
        domain_path = os.path.join(pack_dir, domain)
        if os.path.isdir(domain_path):
            for pack_file in os.listdir(domain_path):
                if pack_file.endswith(".yaml"):
                    with open(os.path.join(domain_path, pack_file), 'r') as f:
                        data = yaml.safe_load(f)
                        for n in data.get('nodes', []):
                            nodes[n['id']] = Node(**n)
                        for e in data.get('edges', []):
                            edges.append(Edge(**e))
    return nodes, edges

nodes, edges = load_packs()
engine = ReasoningEngine(nodes, edges)

req = SimulationRequest(
    perturbations=[Perturbation(node_id="cardio.hemodynamics.heart_rate", op="increase")],
    context={"heart_failure": True, "dehydration": True, "ckd": True, "copd": True},
    options=SimulationOptions(max_hops=10, time_window="all")
)

res = engine.simulate(req)

print(f"--- Simulation Results for Renin/AngII ---")
targets = ["renal.raas.renin", "renal.raas.angiotensin_ii", "renal.raas.aldosterone"]
for node in res.affected_nodes:
    if node.node_id in targets:
        print(f"Node: {node.node_id}, Dir: {node.direction}, Conf: {node.confidence:.2f}, Tick: {node.tick}")

print(f"\n--- Checking Sympathetic Tone & MAP ---")
for node in res.affected_nodes:
    if node.node_id in ["neuro.ans.sympathetic_tone", "cardio.hemodynamics.map", "cardio.hemodynamics.cardiac_output"]:
        print(f"Node: {node.node_id}, Dir: {node.direction}, Conf: {node.confidence:.2f}")

print(f"\n--- Traces for Angiotensin II ---")
for trace in res.traces.get("renal.raas.angiotensin_ii", []):
    print(f"Conf: {trace.confidence:.2f}, Trace Path: {' -> '.join(trace.path)}")
