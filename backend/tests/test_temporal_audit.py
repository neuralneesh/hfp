from app.engine import ReasoningEngine
from app.models import Edge, EdgePhase, Node


def _node(node_id: str) -> Node:
    return Node(id=node_id, label=node_id, domain="cardio", type="variable")


def test_dependency_index_reports_direct_and_multi_hop_reachability():
    nodes = {node_id: _node(node_id) for node_id in ("A", "B", "C")}
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            temporal_profile=[EdgePhase(at="immediate")],
        ),
        Edge(
            source="B",
            target="C",
            rel="increases",
            temporal_profile=[EdgePhase(at="hours")],
        ),
        Edge(
            source="B",
            target="A",
            rel="decreases",
            temporal_profile=[EdgePhase(at="hours")],
        ),
    ]
    engine = ReasoningEngine(nodes, edges)

    index = engine.build_dependency_index()

    assert index["direct_downstream"]["A"]["immediate"] == ["B"]
    assert index["direct_upstream"]["A"]["hours"] == ["B"]
    assert "C" in index["multi_hop_downstream"]["A"]["hours"]


def test_dependency_index_surfaces_feedback_clusters():
    nodes = {node_id: _node(node_id) for node_id in ("A", "B")}
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            temporal_profile=[EdgePhase(at="immediate")],
        ),
        Edge(
            source="B",
            target="A",
            rel="decreases",
            temporal_profile=[EdgePhase(at="hours")],
        ),
    ]
    engine = ReasoningEngine(nodes, edges)

    index = engine.build_dependency_index()

    assert len(index["feedback_clusters"]) == 1
    cluster = index["feedback_clusters"][0]
    assert cluster["nodes"] == ["A", "B"]
    assert cluster["mixed_sign"] is True
    assert cluster["has_delayed_phase"] is True


def test_dependency_index_flags_immediate_only_feedback_loops():
    nodes = {node_id: _node(node_id) for node_id in ("A", "B")}
    edges = [
        Edge(
            source="A",
            target="B",
            rel="increases",
            weight=0.8,
            temporal_profile=[EdgePhase(at="immediate")],
        ),
        Edge(
            source="B",
            target="A",
            rel="decreases",
            weight=0.8,
            temporal_profile=[EdgePhase(at="immediate")],
        ),
    ]
    engine = ReasoningEngine(nodes, edges)

    index = engine.build_dependency_index()

    assert len(index["review_candidates"]["fast_feedback_loops"]) == 1
    assert "A increases B" in index["review_candidates"]["immediate_only_high_weight_edges"]
    assert "B decreases A" in index["review_candidates"]["immediate_only_high_weight_edges"]
