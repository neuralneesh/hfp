import os
import sys

# Add the app directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'app'))

try:
    from app.graph_loader import GraphLoader
    PACKS_DIR = os.path.join(os.getcwd(), 'app', 'knowledge', 'packs')
    print(f"Loading from: {PACKS_DIR}")
    loader = GraphLoader(PACKS_DIR)
    nodes, edges, rules = loader.load_all()
    print(f"Success! Loaded {len(nodes)} nodes, {len(edges)} edges, {len(rules)} rules.")
except Exception as e:
    import traceback
    print("Failed to load graph:")
    traceback.print_exc()
