from fastapi.testclient import TestClient

from app.main import app


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
