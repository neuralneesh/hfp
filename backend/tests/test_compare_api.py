import pytest
from fastapi.testclient import TestClient

from app.api import _classify_change
from app.main import app
from app.models import AffectedNode


client = TestClient(app)


def test_compare_endpoint_returns_changed_nodes():
    payload = {
        "baseline": {
            "perturbations": [],
            "context": {},
            "options": {
                "max_hops": 6,
                "min_confidence": 0.1,
                "time_window": "all",
                "dim_unaffected": True,
            },
        },
        "intervention": {
            "perturbations": [{"node_id": "cardio.hemodynamics.map", "op": "decrease"}],
            "context": {},
            "options": {
                "max_hops": 6,
                "min_confidence": 0.1,
                "time_window": "all",
                "dim_unaffected": True,
            },
        },
    }
    response = client.post("/api/simulate/compare", json=payload)

    assert response.status_code == 200
    body = response.json()
    assert "changed_nodes" in body
    assert len(body["changed_nodes"]) > 0
    assert any(item["node_id"] == "renal.raas.renin" for item in body["changed_nodes"])
    assert all("effect_size_delta" in item for item in body["changed_nodes"])


def test_classify_change_prefers_effect_size_delta():
    baseline = AffectedNode(
        node_id="node",
        direction="up",
        magnitude="small",
        confidence=0.9,
        effect_size=0.2,
        timescale="hours",
    )
    intervention = AffectedNode(
        node_id="node",
        direction="up",
        magnitude="medium",
        confidence=0.7,
        effect_size=0.4,
        timescale="hours",
    )

    result = _classify_change(baseline, intervention)

    assert result.change_type == "strengthened"
    assert result.effect_size_delta == pytest.approx(0.2)


def test_classify_change_ignores_confidence_only_noise():
    baseline = AffectedNode(
        node_id="node",
        direction="up",
        magnitude="small",
        confidence=0.4,
        effect_size=0.2,
        timescale="hours",
    )
    intervention = AffectedNode(
        node_id="node",
        direction="up",
        magnitude="small",
        confidence=0.9,
        effect_size=0.2,
        timescale="hours",
    )

    result = _classify_change(baseline, intervention)

    assert result.change_type == "unchanged"
