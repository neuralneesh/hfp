import pytest
import os
import yaml
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
