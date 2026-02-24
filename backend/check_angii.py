
from app.api import engine
from app.models import SimulationRequest, Perturbation, SimulationOptions

req = SimulationRequest(
    perturbations=[Perturbation(node_id='cardio.hemodynamics.svr', op='increase')],
    context={},
    options=SimulationOptions(max_hops=15, min_confidence=0.0, time_window='days', dim_unaffected=False),
    expanded_nodes=[], resolution='micro', show_readouts=False
)
res = engine.simulate(req)

print('=== Renin States ===')
if 'renal.raas.renin' in engine.node_states:
    print(engine.node_states['renal.raas.renin'])
    
print('=== Ang II States ===')
if 'renal.raas.angiotensin_2' in engine.node_states:
    print(engine.node_states['renal.raas.angiotensin_2'])
