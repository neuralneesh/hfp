from __future__ import annotations

from typing import Dict, List, Set, Tuple

from .models import Perturbation


# Baseline physiologic shifts that exist before any user perturbation when a
# clinical context is selected.
CONTEXT_BASELINE_EFFECTS: Dict[str, List[Tuple[str, str]]] = {
    "ace_inhibitor": [
        ("renal.raas.at1_receptor", "decrease"),
        ("renal.raas.aldosterone", "decrease"),
    ],
    "beta_blocker": [
        ("cardio.signaling.gs_protein", "decrease"),
        ("cardio.hemodynamics.heart_rate", "decrease"),
    ],
    "heart_failure": [
        ("cardio.hemodynamics.stroke_volume", "decrease"),
        ("cardio.metabolism.myocardial_o2_supply", "decrease"),
        ("renal.metabolism.anp_bnp", "increase"),
    ],
    "dehydration": [
        ("renal.volume.ecf_volume", "decrease"),
        ("renal.metabolism.osmolarity", "increase"),
        ("renal.metabolism.adh", "increase"),
    ],
    "ckd": [
        ("renal.tubule.na_reabsorption", "decrease"),
        ("renal.metabolism.potassium", "increase"),
    ],
    "copd": [
        ("pulm.mechanics.resistance", "increase"),
        ("pulm.gasexchange.vq_mismatch", "increase"),
        ("pulm.gasexchange.diffusion_capacity", "decrease"),
    ],
}


def apply_context_baselines(
    perturbations: List[Perturbation], context: Dict[str, bool]
) -> List[Perturbation]:
    merged: List[Perturbation] = list(perturbations)
    user_nodes: Set[str] = {p.node_id for p in perturbations}
    added_nodes: Set[str] = set()

    for context_id, effects in CONTEXT_BASELINE_EFFECTS.items():
        if not context.get(context_id, False):
            continue

        for node_id, op in effects:
            # Explicit user inputs win over context defaults for the same node.
            if node_id in user_nodes or node_id in added_nodes:
                continue
            merged.append(Perturbation(node_id=node_id, op=op))
            added_nodes.add(node_id)

    return merged
