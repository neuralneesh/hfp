import sys
import traceback

try:
    from app.api import engine
    from app.models import SimulationRequest, Perturbation, SimulationOptions

    req = SimulationRequest(
        perturbations=[Perturbation(node_id='cardio.hemodynamics.svr', op='increase')],
        context={},
        options=SimulationOptions(max_hops=15, min_confidence=0.0, time_window='days', dim_unaffected=False),
        expanded_nodes=[], resolution='micro', show_readouts=False
    )
    res = engine.simulate(req)

    for target in ['renal.raas.angiotensin_2', 'renal.raas.aldosterone', 'renal.raas.mr_receptor', 'acidbase.blood.h_concentration']:
        print(f'=== {target} States ===')
        if target in engine.latest_node_states:
            for t, s in engine.latest_node_states[target].items():
                print(f'Tick {t}: {s.direction}')
        else:
            print(f'{target} not present in states')

except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()
