# HFP (Human Framework Project)

A full-stack physiology knowledge graph simulator with cross-domain ripple effects.

## System Architecture

- **Backend**: Python FastAPI. Qualitative reasoning engine that propagates perturbations through a merged YAML-based graph.
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind. Uses Cytoscape.js for interactive graph visualization.
- **Data**: YAML "domain packs" located in `backend/app/knowledge/packs/`.

## Setup and Development

### Prerequisites
- Python 3.9+
- Node.js 18+

### 1. Run the Backend
```bash
cd backend
pip install -r requirements.txt
python -m app.main
```
The API will be available at `http://localhost:8000`.

### 2. Run the Frontend
```bash
cd frontend
npm install
npm run dev
```
The UI will be available at `http://localhost:3000`.

## Key Concepts

### Initializing Perturbations
Click any node in the graph, and use the **Control Panel** (right sidebar) to apply an **Increase** or **Decrease**. Click **Run Simulation** to see the ripple effects across all domains (Cardio, Renal, Pulm, Acid-Base).

### Causal Traces
When a node is affected by a simulation, you can click it to view the **Causal Traces** (logic paths) that explain why that node changed.

### Adding New Domain Packs
1. Create a new YAML file in `backend/app/knowledge/packs/<your_domain>/pack_name.yaml`.
2. Define nodes with canonical IDs (e.g., `neuro.ans.vagal_tone`).
3. Define edges connecting to existing nodes across any domain.
4. Restart the backend or call `POST /api/reload`.

## Testing

### Backend Tests
Run unit and scenario tests:
```bash
cd backend
export PYTHONPATH=$PYTHONPATH:.
pytest tests/
```

### Scenario Tests
The repo includes golden tests for key physiological scenarios:
- RAAS activation (MAP drop)
- ACE Inhibitor effects
- Hypoventilation (Respiratory Acidosis)
- Hypoxia-induced Sympathetic activation
- Metabolic Acidosis & Respiratory Compensation

### Pathway Physiology Quality Check
Run multi-hop physiology assertions (including context-aware and context-only checks):
```bash
cd backend
./venv/bin/python scripts/pathway_quality_check.py
```
Loop until a failure is found:
```bash
cd backend
./venv/bin/python scripts/pathway_quality_check.py --loop-until-failure
```
Optional bounded loop:
```bash
cd backend
./venv/bin/python scripts/pathway_quality_check.py --loop-until-failure --max-iterations 100
```
Spec file:
- `backend/app/knowledge/quality/pathway_expectations.yaml`
Hard invariant file:
- `backend/app/knowledge/quality/hard_invariants.yaml`

The script exits non-zero if any expected physiologic pathway check fails.
