import json
import traceback

with open('/Users/aneesh/Desktop/Med School/HFP/backend/diag_output.json', 'w') as f:
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
        
        output = {
            "mr_receptor_ticks": {t: str(s.direction) for t, s in engine.latest_node_states.get('renal.raas.mr_receptor', {}).items()},
            "h_conc_ticks": {t: str(s.direction) for t, s in engine.latest_node_states.get('acidbase.blood.h_concentration', {}).items()},
            "ph_ticks": {t: str(s.direction) for t, s in engine.latest_node_states.get('acidbase.blood.ph', {}).items()}
        }
        json.dump(output, f)

    except Exception as e:
        json.dump({"error": str(e), "traceback": traceback.format_exc()}, f)
