'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Node as GNode, Edge as GEdge } from '@/lib/types';
import { getGraph } from '@/lib/api';

/**
 * Manages graph data loading from the backend.
 *
 * Owns: nodes, edges, loading state, and load errors.
 * Call `loadGraph` to manually trigger a reload (e.g. after the backend
 * reports a data change).
 */
export function useGraphData() {
    const [nodes, setNodes] = useState<GNode[]>([]);
    const [edges, setEdges] = useState<GEdge[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadGraph = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await getGraph();
            setNodes(data.nodes);
            setEdges(data.edges);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Failed to load graph from backend. Make sure the FastAPI server is running.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadGraph();
    }, [loadGraph]);

    return { nodes, edges, isLoading, error, loadGraph };
}
