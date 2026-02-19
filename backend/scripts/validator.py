import yaml
import os
from pathlib import Path

def validate():
    pack_dir = Path("app/knowledge/packs")
    all_edges = []
    
    # Load all yaml files
    for root, dirs, files in os.walk(pack_dir):
        for file in files:
            if file.endswith(".yaml"):
                path = Path(root) / file
                with open(path, 'r') as f:
                    data = yaml.safe_load(f)
                    if 'edges' in data:
                        for edge in data['edges']:
                            # Add source pack for context
                            edge['pack'] = data.get('name', file)
                            all_edges.append(edge)

    # Generate Markdown Table
    print("# Physiological Truth Table (Extracted Links)\n")
    print("| Source | Relation | Target | Weight | Priority | Context | Description |")
    print("| :--- | :--- | :--- | :--- | :--- | :--- | :--- |")
    
    for edge in sorted(all_edges, key=lambda x: x['source']):
        source = edge.get('source', '')
        rel = edge.get('rel', '')
        target = edge.get('target', '')
        weight = edge.get('weight', 1.0)
        pri = edge.get('priority', 'medium')
        ctx = str(edge.get('context', {}))
        desc = edge.get('description', '').replace('\n', ' ')
        
        print(f"| {source} | {rel} | {target} | {weight} | {pri} | {ctx} | {desc} |")

if __name__ == "__main__":
    validate()
