# Physiological Truth Table (Extracted Links)

| Source | Relation | Target | Weight | Priority | Context | Description |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| acidbase.blood.h_concentration | decreases | acidbase.blood.ph | 1.0 | medium | {} |  |
| acidbase.blood.hco3 | decreases | acidbase.blood.h_concentration | 1.0 | medium | {} |  |
| acidbase.blood.ph | decreases | pulm.ventilation.alveolar_ventilation | 0.9 | medium | {} | Acidemia (low pH) increases ventilation (respiratory compensation) |
| acidbase.blood.ph | decreases | renal.raas.renin | 0.95 | high | {} |  |
| cardio.electrophysiology.conduction_delay | increases | cardio.electrophysiology.pr_interval | 1.0 | medium | {} | Increased AV delay prolongs the PR interval. |
| cardio.hemodynamics.adrenoceptor_alpha1 | increases | cardio.signaling.ip3_dag | 1.0 | medium | {} | Alpha-1 receptors are Gq-coupled, activating PLC and increasing IP3/DAG. |
| cardio.hemodynamics.adrenoceptor_beta1 | increases | cardio.signaling.camp | 1.0 | medium | {} | Beta-1 receptors are Gs-coupled, increasing adenylyl cyclase activity and cAMP. |
| cardio.hemodynamics.cardiac_output | increases | cardio.hemodynamics.map | 1.0 | medium | {} |  |
| cardio.hemodynamics.heart_rate | increases | cardio.hemodynamics.cardiac_output | 0.8 | medium | {} | Increased HR increases CO. |
| cardio.hemodynamics.heart_rate | decreases | cardio.hemodynamics.stroke_volume | 0.3 | medium | {} | Very high heart rates reduce diastolic filling time (filling defect) |
| cardio.hemodynamics.heart_rate | increases | cardio.metabolism.myocardial_o2_demand | 0.8 | medium | {} |  |
| cardio.hemodynamics.heart_rate | increases | cardio.electrophysiology.p_wave | 1.0 | medium | {} | Heart rate increases frequency of EKG events. |
| cardio.hemodynamics.heart_rate | increases | cardio.electrophysiology.qrs_complex | 1.0 | medium | {} |  |
| cardio.hemodynamics.map | decreases | renal.raas.renin | 0.7 | medium | {} | Increased MAP/perfusion pressure decreases renin release |
| cardio.hemodynamics.map | decreases | neuro.ans.sympathetic_tone | 1.0 | medium | {} | Baroreceptors inhibit sympathetic outflow when BP is high |
| cardio.hemodynamics.map | increases | cardio.metabolism.myocardial_o2_supply | 0.9 | medium | {} | Coronary perfusion is pressure-dependent. |
| cardio.hemodynamics.muscarinic_m2 | decreases | cardio.signaling.camp | 1.0 | medium | {} | M2 receptors are Gi-coupled, inhibiting adenylyl cyclase and decreasing cAMP. |
| cardio.hemodynamics.stroke_volume | increases | cardio.hemodynamics.cardiac_output | 0.9 | medium | {'heart_failure': False} | Increased SV increases CO. Impaired in Heart Failure. |
| cardio.hemodynamics.svr | increases | cardio.hemodynamics.map | 1.0 | medium | {} |  |
| cardio.hemodynamics.svr | increases | cardio.metabolism.myocardial_o2_demand | 0.5 | medium | {} | Afterload increases wall tension and O2 demand. |
| cardio.mechanics.preload | increases | cardio.hemodynamics.stroke_volume | 0.9 | medium | {} | Frank-Starling Law: Increased preload leads to increased sarcomere stretch and higher stroke volume. |
| cardio.metabolism.myocardial_o2_demand | increases | cardio.injury.troponin | 1.0 | high | {} |  |
| cardio.metabolism.myocardial_o2_supply | decreases | cardio.injury.troponin | 1.0 | medium | {} |  |
| cardio.signaling.camp | increases | cardio.hemodynamics.heart_rate | 0.9 | medium | {'beta_blocker': False} | Increased cAMP in SA node increases heart rate via HCN channels. Beta blockers competitively inhibit the upstream Beta-1 input, but we context gate here for simplicity. |
| cardio.signaling.camp | increases | cardio.hemodynamics.stroke_volume | 0.8 | medium | {} | Increased cAMP in myocytes (PKA activation) increases contractility/inotropy. |
| cardio.signaling.camp | increases | cardio.metabolism.myocardial_o2_demand | 0.6 | medium | {} | Inotropy increases oxygen consumption. |
| cardio.signaling.camp | increases | renal.volume.ecf_volume | 0.9 | medium | {} | Increased cAMP (via V2) promotes Aquaporin-2 insertion, increasing water reabsorption and ECF volume. |
| cardio.signaling.ip3_dag | increases | cardio.hemodynamics.svr | 1.0 | medium | {} | IP3-mediated calcium release in vascular smooth muscle causes contraction/vasoconstriction. |
| cardio.signaling.ip3_dag | increases | renal.raas.aldosterone | 0.8 | medium | {} | Gq/Calcium signaling in adrenal cortex stimulates aldosterone synthesis. |
| cardio.signaling.ip3_dag | increases | renal.tubule.na_reabsorption | 0.6 | medium | {} | Intracellular signaling directly promotes proximal tubule Na+ reabsorption. |
| neuro.ans.acetylcholine | increases | cardio.hemodynamics.muscarinic_m2 | 0.95 | medium | {} |  |
| neuro.ans.epinephrine | increases | cardio.hemodynamics.adrenoceptor_beta1 | 0.9 | medium | {} |  |
| neuro.ans.norepinephrine | increases | cardio.hemodynamics.adrenoceptor_beta1 | 0.95 | medium | {} |  |
| neuro.ans.norepinephrine | increases | cardio.hemodynamics.adrenoceptor_alpha1 | 0.9 | medium | {} |  |
| neuro.ans.parasympathetic_tone | increases | pulm.ventilation.vagal_tone | 1.0 | medium | {} |  |
| neuro.ans.parasympathetic_tone | increases | cardio.electrophysiology.conduction_delay | 0.8 | medium | {} | Vagal tone increases AV node delay (negative dromotropy). |
| neuro.ans.sympathetic_tone | increases | neuro.ans.norepinephrine | 1.0 | medium | {} |  |
| neuro.ans.sympathetic_tone | increases | neuro.ans.epinephrine | 0.8 | medium | {} |  |
| neuro.ans.sympathetic_tone | decreases | cardio.electrophysiology.conduction_delay | 0.8 | medium | {} | Sympathetic tone reduces AV node delay (positive dromotropy). |
| neuro.ans.sympathetic_tone | increases | renal.raas.renin | 0.9 | high | {} | Sympathetic activation (beta-1) targets JG cells |
| pulm.gasexchange.paco2 | increases | pulm.ventilation.alveolar_ventilation | 1.0 | high | {} | Central chemoreceptors detect increased PaCO2/low pH in CSF and stimulate ventilation |
| pulm.gasexchange.paco2 | increases | acidbase.blood.h_concentration | 1.0 | medium | {} | PaCO2 increases [H+] via hydration to carbonic acid |
| pulm.gasexchange.pao2 | decreases | neuro.ans.sympathetic_tone | 0.8 | medium | {} | Hypoxia (low PaO2) increases sympathetic tone |
| pulm.gasexchange.pao2 | increases | cardio.metabolism.myocardial_o2_supply | 0.7 | medium | {} |  |
| pulm.ventilation.alveolar_ventilation | increases | pulm.gasexchange.pao2 | 1.0 | medium | {'copd': False} | Ventilation improves oxygenation. In COPD, ventilation-perfusion mismatch impairs this link. |
| pulm.ventilation.alveolar_ventilation | decreases | pulm.gasexchange.paco2 | 1.0 | medium | {} |  |
| pulm.ventilation.vagal_tone | increases | neuro.ans.acetylcholine | 1.0 | medium | {} |  |
| renal.metabolism.adh | increases | renal.metabolism.v2_receptor | 1.0 | medium | {} |  |
| renal.metabolism.anp_bnp | decreases | renal.raas.renin | 0.7 | medium | {} | ANP/BNP inhibits renin release |
| renal.metabolism.anp_bnp | decreases | renal.tubule.na_reabsorption | 0.6 | medium | {} | ANP promotes natriuresis (inhibits Na+ reabsorption) |
| renal.metabolism.osmolarity | increases | renal.metabolism.adh | 1.0 | medium | {} | Increased osmolarity stimulates ADH release from the posterior pituitary |
| renal.metabolism.v2_receptor | increases | cardio.signaling.camp | 1.0 | medium | {} | V2 receptors are Gs-coupled, increasing cAMP in collecting duct cells. |
| renal.raas.aldosterone | increases | renal.raas.mr_receptor | 1.0 | medium | {} |  |
| renal.raas.angiotensin_ii | increases | renal.raas.at1_receptor | 1.0 | medium | {} |  |
| renal.raas.angiotensin_ii | increases | renal.raas.at1_receptor | 1.0 | medium | {} |  |
| renal.raas.at1_receptor | increases | cardio.signaling.ip3_dag | 1.0 | medium | {} | AT1 receptors are Gq-coupled, increasing IP3/DAG. |
| renal.raas.at1_receptor | decreases | renal.hemodynamics.gfr | 0.4 | medium | {'ckd': False} |  |
| renal.raas.mr_receptor | increases | renal.tubule.na_reabsorption | 0.9 | medium | {} | MR activation increases Na+ reabsorption in the collecting duct |
| renal.raas.renin | increases | renal.raas.angiotensin_ii | 1.0 | medium | {'ace_inhibitor': False} | Renin catalyzes conversion. Conversion is blocked by ACE Inhibitors. |
| renal.tubule.na_reabsorption | increases | renal.volume.ecf_volume | 0.9 | medium | {} |  |
| renal.volume.ecf_volume | increases | cardio.mechanics.preload | 0.8 | medium | {} | Increased ECF volume increases venous return and cardiac preload (EDV). |
| renal.volume.ecf_volume | increases | cardio.mechanics.preload | 0.8 | medium | {} | Increased ECF volume increases preload (EDV). |
| renal.volume.ecf_volume | decreases | renal.metabolism.adh | 0.8 | medium | {} | High ECF volume (high atrial/baroreceptor stretch) inhibits ADH release; conversely, low volume stimulates it. |
| renal.volume.ecf_volume | increases | renal.metabolism.anp_bnp | 0.9 | medium | {} | Increased ECF volume (atrial stretch) stimulates ANP/BNP release |
| renal.volume.ecf_volume | decreases | renal.raas.renin | 0.8 | medium | {'dehydration': False} |  |
