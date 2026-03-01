import pytest
import yaml
from app.engine import ReasoningEngine
from app.graph_loader import GraphLoader

def test_graph_loader(tmp_path):
    # Create mock packs
    pack1 = tmp_path / "pack1.yaml"
    pack1.write_text(yaml.dump({
        "nodes": [
            {"id": "node1", "label": "Node 1", "domain": "cardio", "type": "variable"}
        ],
        "edges": []
    }))
    
    pack2 = tmp_path / "pack2.yaml"
    pack2.write_text(yaml.dump({
        "nodes": [
            {"id": "node2", "label": "Node 2", "domain": "renal", "type": "variable"}
        ],
        "edges": [
            {"source": "node1", "target": "node2", "rel": "increases"}
        ]
    }))
    
    loader = GraphLoader(str(tmp_path))
    nodes, edges, rules = loader.load_all()
    
    assert len(nodes) == 2
    assert "node1" in nodes
    assert "node2" in nodes
    assert len(edges) == 1
    assert edges[0].source == "node1"
    assert edges[0].target == "node2"
    assert len(edges[0].temporal_profile) == 1
    assert edges[0].temporal_profile[0].at == "immediate"

def test_duplicate_id(tmp_path):
    pack1 = tmp_path / "pack1.yaml"
    pack1.write_text(yaml.dump({
        "nodes": [{"id": "node1", "label": "Node 1", "domain": "cardio", "type": "variable"}],
        "edges": []
    }))
    pack2 = tmp_path / "pack2.yaml"
    pack2.write_text(yaml.dump({
        "nodes": [{"id": "node1", "label": "Node 1 Mirror", "domain": "cardio", "type": "variable"}],
        "edges": []
    }))
    
    loader = GraphLoader(str(tmp_path))
    with pytest.raises(ValueError, match="Duplicate node ID"):
        loader.load_all()

def test_missing_ref(tmp_path):
    pack1 = tmp_path / "pack1.yaml"
    pack1.write_text(yaml.dump({
        "nodes": [{"id": "node1", "label": "Node 1", "domain": "cardio", "type": "variable"}],
        "edges": [{"source": "node1", "target": "nonexistent", "rel": "increases"}]
    }))
    
    loader = GraphLoader(str(tmp_path))
    with pytest.raises(ValueError, match="Edge target not found"):
        loader.load_all()


def test_duplicate_temporal_phase_rejected(tmp_path):
    pack = tmp_path / "pack.yaml"
    pack.write_text(yaml.dump({
        "nodes": [
            {"id": "node1", "label": "Node 1", "domain": "cardio", "type": "variable"},
            {"id": "node2", "label": "Node 2", "domain": "renal", "type": "variable"},
        ],
        "edges": [
            {
                "source": "node1",
                "target": "node2",
                "rel": "increases",
                "temporal_profile": [
                    {"at": "hours"},
                    {"at": "hours"},
                ],
            }
        ],
    }))

    loader = GraphLoader(str(tmp_path))
    with pytest.raises(ValueError, match="repeats at='hours'"):
        loader.load_all()


def test_temporal_profile_inherits_base_fields(tmp_path):
    pack = tmp_path / "pack.yaml"
    pack.write_text(yaml.dump({
        "nodes": [
            {"id": "node1", "label": "Node 1", "domain": "cardio", "type": "variable"},
            {"id": "node2", "label": "Node 2", "domain": "renal", "type": "variable"},
        ],
        "edges": [
            {
                "source": "node1",
                "target": "node2",
                "rel": "increases",
                "weight": 0.6,
                "priority": "high",
                "temporal_profile": [
                    {"at": "hours"},
                ],
            }
        ],
    }))

    loader = GraphLoader(str(tmp_path))
    nodes, edges, _ = loader.load_all()
    engine = ReasoningEngine(nodes, edges)

    compiled = engine.compiled_edges[0]
    assert compiled.at == "hours"
    assert compiled.weight == pytest.approx(0.6)
    assert compiled.priority == "high"
