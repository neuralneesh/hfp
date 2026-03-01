'use client';

import { useState, useCallback } from 'react';
import type { Domain, GraphSettings } from '@/lib/types';
import { DEFAULT_GRAPH_SETTINGS } from '@/lib/constants';

/**
 * Manages pure UI state: which node is selected, which domain is filtered,
 * search input, pinned nodes, sidebar visibility, and graph display settings.
 *
 * This hook has no knowledge of simulation data — cross-hook derived values
 * (filteredNodes, highlightedPath, etc.) live in the page component that
 * composes these hooks together.
 *
 * To add new UI state: add a useState here and include it in the return value.
 */
export function useUIState() {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedDomain, setSelectedDomain] = useState<Domain | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [pinnedNodes, setPinnedNodes] = useState<string[]>([]);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
    const [graphSettings, setGraphSettings] = useState<GraphSettings>(DEFAULT_GRAPH_SETTINGS);

    /** Selects a node and ensures the right control panel is visible. */
    const handleNodeClick = useCallback((nodeId: string) => {
        setSelectedNodeId(nodeId);
        setIsRightSidebarOpen(true);
    }, []);

    const togglePin = useCallback((id: string) => {
        setPinnedNodes((prev) =>
            prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
        );
    }, []);

    return {
        selectedNodeId, setSelectedNodeId,
        selectedDomain, setSelectedDomain,
        searchQuery, setSearchQuery,
        pinnedNodes, togglePin,
        isSidebarOpen, setIsSidebarOpen,
        isRightSidebarOpen, setIsRightSidebarOpen,
        graphSettings, setGraphSettings,
        handleNodeClick,
    };
}
