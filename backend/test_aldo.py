from app.api import engine
from app.models import SimulationRequest, Perturbation, SimulationOptions

req = SimulationRequest(
    perturbations=[Perturbation(node_id='cardio.hemodynamics.svr', op='increase')],
    context={},
    options=SimulationOptions(max_hops=15, min_confidence=0.0, time_window='days', dim_unaffected=False),
    expanded_nodes=[], resolution='micro', show_readouts=False
)
res = engine.simulate(req)

print('=== Aldo ===')
if 'renal.raas.aldosterone' in engine.latest_node_states:
    print(list(engine.latest_node_states['renal.raas.aldosterone'].items()))

print('=== MR ===')
if 'renal.raas.mr_receptor' in engine.latest_node_states:
    print(list(engine.latest_node_states['renal.raas.mr_receptor'].items()))

print('=== H+ ===')
if 'acidbase.blood.h_concentration' in engine.latest_node_states:
    print(list(engine.latest_node_states['acidbase.blood.h_concentration'].items()))
