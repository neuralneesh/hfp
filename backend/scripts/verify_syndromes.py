import os
import sys

# Ensure backend acts as root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.api import engine
from app.models import SimulationRequest, Perturbation, SimulationOptions
import collections

def run_test(name, perturbation_node, current_op, expected_syndromes):
    print(f"\n🧪 TEST: {name}")
    print(f"Trigger: {current_op.upper()} {perturbation_node}")
    
    req = SimulationRequest(
        perturbations=[Perturbation(node_id=perturbation_node, op=current_op)],
        context={},
        options=SimulationOptions(max_hops=15, min_confidence=0.01, time_window="days", dim_unaffected=False),
        expanded_nodes=[],
        resolution="macro",
        show_readouts=False
    )
    
    try:
        res = engine.simulate(req)
        
        found_summaries = set()
        for traces in res.traces.values():
            for t in traces:
                if t.summary:
                    # Splitting by ' followed by ' to see individual syndromes
                    parts = t.summary.split(' followed by ')
                    found_summaries.update(parts)
        
        print(f"  Expected Syndromes: {', '.join(expected_syndromes)}")
        print(f"  Detected Syndromes: {', '.join(found_summaries) if found_summaries else 'None'}")
        
        missing = [s for s in expected_syndromes if s not in found_summaries]
        if missing:
            print(f"  ❌ FAILED: Missing syndromes: {', '.join(missing)}")
        else:
            print(f"  ✅ SUCCESS: All expected syndromes were detected!")
            
    except Exception as e:
        print(f"  ❌ CRASH: Engine failed with error: {e}")

if __name__ == "__main__":
    print("🏥 Starting Syndromic Pattern Validation...\n")
    print(f"Loaded {len(engine.syndromes)} syndrome templates.")
    
    run_test(
        "Alkalemia leading to Hypotension",
        "acidbase.blood.h_concentration",
        "decrease",
        ["Alkalemia-induced Vasodilation", "Baroreceptor Reflex"]
    )
    
    run_test(
        "Severe Hypoxia",
        "pulm.gasexchange.pao2",
        "decrease",
        ["Hypoxic Pulmonary Vasoconstriction", "Hypoxic Ventilatory Response"]
    )
    
    run_test(
        "Primary Hypotension (Hemorrhage proxy)",
        "cardio.hemodynamics.map",
        "decrease",
        ["Baroreceptor Reflex", "Pressure Diuresis", "RAAS Activation"]
    )
    
    run_test(
        "Tension Pneumothorax (High IPP)",
        "pulm.mechanics.intrapleural_pressure",
        "increase",
        ["Mechanical Venous Compression", "Frank-Starling Mechanism", "Baroreceptor Reflex"]
    )
    
    run_test(
        "Hyperventilation",
        "pulm.ventilation.alveolar_ventilation",
        "increase",
        ["Respiratory Alkalosis", "Alkalemia-induced Vasodilation"]
    )
    
    print("\n🏁 Validation Complete")
