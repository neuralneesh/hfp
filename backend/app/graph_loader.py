import os
import yaml
from typing import List, Dict, Optional
from .models import Node, Edge, DomainPack, Rule, Syndrome

class GraphLoader:
    def __init__(self, packs_dir: str):
        self.packs_dir = packs_dir
        self.nodes: Dict[str, Node] = {}
        self.edges: List[Edge] = []
        self.rules: List[Rule] = []
        self.syndromes: List[Syndrome] = []
        self.alias_map: Dict[str, str] = {}

    def load_all(self):
        # Reset state to allow for reloads
        self.nodes = {}
        self.edges = []
        self.rules = []
        self.syndromes = []
        self.alias_map = {}

        for root, _, files in os.walk(self.packs_dir):
            for file in files:
                if file.endswith(".yaml") or file.endswith(".yml"):
                    self._load_pack(os.path.join(root, file))
        self._validate_graph()
        return self.nodes, self.edges, self.rules

    def _load_pack(self, pack_path: str):
        with open(pack_path, 'r') as f:
            data = yaml.safe_load(f)
            if not data:
                return

            # Load nodes
            for node_data in data.get('nodes', []):
                node = Node(**node_data)
                if node.id in self.nodes:
                    raise ValueError(f"Duplicate node ID: {node.id}")
                self.nodes[node.id] = node
                for alias in node.aliases:
                    self.alias_map[alias.lower()] = node.id

            # Load edges
            for edge_data in data.get('edges', []):
                edge = Edge(**edge_data)
                self.edges.append(edge)

            # Load rules
            for rule_data in data.get('rules', []):
                rule = Rule(**rule_data)
                self.rules.append(rule)

            # Load syndromes
            for syndrome_data in data.get('syndromes', []):
                syndrome = Syndrome(**syndrome_data)
                self.syndromes.append(syndrome)

    def _validate_graph(self):
        # Ensure all edge sources and targets exist
        for edge in self.edges:
            if edge.source not in self.nodes:
                raise ValueError(f"Edge source not found: {edge.source}")
            if edge.target not in self.nodes:
                raise ValueError(f"Edge target not found: {edge.target}")

    def get_node_by_id_or_alias(self, identifier: str) -> Optional[Node]:
        if identifier in self.nodes:
            return self.nodes[identifier]
        canonical_id = self.alias_map.get(identifier.lower())
        if canonical_id:
            return self.nodes[canonical_id]
        return None
