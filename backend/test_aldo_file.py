import sys
import traceback

with open('/Users/aneesh/Desktop/Med School/HFP/backend/test_aldo_output.txt', 'w') as f:
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
            f.write(f'=== {target} States ===\n')
            if target in engine.latest_node_states:
                for t, s in engine.latest_node_states[target].items():
                    f.write(f'Tick {t}: {s.direction}\n')
            else:
                f.write(f'{target} not present in states\n')

    except Exception as e:
        f.write(f"ERROR: {e}\n")
        f.write(traceback.format_exc())
