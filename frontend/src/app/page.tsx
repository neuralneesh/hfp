"use client";

import React, { useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import GraphView from '@/components/GraphView';
import ControlPanel from '@/components/ControlPanel';
import RippleSummary from '@/components/RippleSummary';
import TraceViewer from '@/components/TraceViewer';
import ComparisonSummary from '@/components/ComparisonSummary';
import DisplayMenu from '@/components/DisplayMenu';
import { Loader2, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, RefreshCw } from 'lucide-react';
import { useGraphData } from '@/hooks/useGraphData';
import { useSimulation } from '@/hooks/useSimulation';
import { useUIState } from '@/hooks/useUIState';

/**
 * Root page component.
 *
 * This component is intentionally thin: it composes the three custom hooks and
 * passes their state/actions down to child components. Business logic lives in
 * the hooks; rendering decisions live here.
 *
 * Adding a new feature:
 *  - New graph-loading behaviour  → useGraphData
 *  - New simulation action/result → useSimulation
 *  - New UI panel or filter       → useUIState
 *  - Cross-hook derived data      → useMemo below
 */
export default function Home() {
    const graph = useGraphData();
    const ui = useUIState();
    const sim = useSimulation(ui.selectedNodeId);

    // -------------------------------------------------------------------------
    // Cross-hook derived values
    // These depend on data from more than one hook, so they live here.
    // -------------------------------------------------------------------------

    const selectedNode = useMemo(
        () => graph.nodes.find(n => n.id === ui.selectedNodeId) || null,
        [graph.nodes, ui.selectedNodeId],
    );

    const highlightedPath = useMemo(() => {
        if (!ui.selectedNodeId || sim.activeTraceNodeId !== ui.selectedNodeId || sim.activeTraceIndex === null) {
            return [];
        }
        return sim.traces[ui.selectedNodeId]?.[sim.activeTraceIndex]?.path || [];
    }, [ui.selectedNodeId, sim.activeTraceNodeId, sim.activeTraceIndex, sim.traces]);

    // NOTE: filteredNodes / filteredEdges are computed but not yet wired to
    // GraphView (GraphView receives the full node/edge set). They are kept here
    // so domain-level filtering can be activated by changing `nodes={nodes}` to
    // `nodes={filteredNodes}` in the GraphView prop below.
    const filteredNodes = useMemo(() => {
        let result = graph.nodes;
        if (ui.selectedDomain !== 'all') {
            result = result.filter(n => n.domain === ui.selectedDomain);
        }
        // Cross-domain affected nodes remain visible even when a domain filter is active
        const affectedIds = new Set(sim.affectedNodes.map(an => an.node_id));
        return result.filter(n => ui.selectedDomain === 'all' || n.domain === ui.selectedDomain || affectedIds.has(n.id));
    }, [graph.nodes, ui.selectedDomain, sim.affectedNodes]);

    const filteredEdges = useMemo(() => {
        const nodeIds = new Set(filteredNodes.map(n => n.id));
        return graph.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
    }, [graph.edges, filteredNodes]);

    const domainCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        sim.affectedNodes.forEach(an => {
            const node = graph.nodes.find(n => n.id === an.node_id);
            if (node) counts[node.domain] = (counts[node.domain] || 0) + 1;
        });
        return counts;
    }, [sim.affectedNodes, graph.nodes]);

    const shouldDimUnaffected = sim.options.dim_unaffected && sim.perturbations.length > 0;

    // Surface the first available error from either hook
    const error = graph.error || sim.error;

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    if (graph.isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
                <p className="text-slate-500 font-medium">Building HumanGraph...</p>
            </div>
        );
    }

    return (
        <div className="relative flex h-screen w-full bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
            {/* Left sidebar — node browser */}
            <aside className={`absolute left-0 top-0 bottom-0 z-40 transition-transform duration-300 ${ui.isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <Sidebar
                    nodes={graph.nodes}
                    selectedDomain={ui.selectedDomain}
                    setSelectedDomain={ui.setSelectedDomain}
                    searchQuery={ui.searchQuery}
                    setSearchQuery={ui.setSearchQuery}
                    pinnedNodes={ui.pinnedNodes}
                    togglePin={ui.togglePin}
                    onNodeClick={ui.handleNodeClick}
                    domainCounts={domainCounts}
                />
            </aside>

            <main className="flex-1 relative flex flex-col overflow-hidden">
                <div className="flex-1 relative">
                    {/* Left sidebar toggle */}
                    <button
                        onClick={() => ui.setIsSidebarOpen(v => !v)}
                        className={`absolute top-4 z-50 h-10 w-10 rounded-lg border bg-white/95 backdrop-blur shadow-md text-slate-700 flex items-center justify-center transition-all ${ui.isSidebarOpen ? 'left-[332px]' : 'left-4'}`}
                        title={ui.isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                    >
                        {ui.isSidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
                    </button>

                    <DisplayMenu
                        settings={ui.graphSettings}
                        setSettings={ui.setGraphSettings}
                        className={ui.isSidebarOpen ? 'left-[380px]' : 'left-16'}
                    />

                    {/* Right sidebar toggle */}
                    <button
                        onClick={() => ui.setIsRightSidebarOpen(v => !v)}
                        className={`absolute top-4 z-50 h-10 w-10 rounded-lg border bg-white/95 backdrop-blur shadow-md text-slate-700 flex items-center justify-center transition-all ${ui.isRightSidebarOpen ? 'right-[332px]' : 'right-4'}`}
                        title={ui.isRightSidebarOpen ? 'Hide controls' : 'Show controls'}
                    >
                        {ui.isRightSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
                    </button>

                    <GraphView
                        nodes={graph.nodes}
                        edges={graph.edges}
                        affectedNodes={sim.affectedNodes}
                        perturbations={sim.perturbations}
                        selectedNodeId={ui.selectedNodeId}
                        highlightedPath={highlightedPath}
                        onNodeClick={ui.handleNodeClick}
                        dimUnaffected={shouldDimUnaffected}
                        settings={ui.graphSettings}
                    />

                    {ui.selectedNodeId && sim.traces[ui.selectedNodeId] && (
                        <TraceViewer
                            nodeId={ui.selectedNodeId}
                            nodeLabel={selectedNode?.label || ''}
                            traces={sim.traces[ui.selectedNodeId]}
                            activePathIndex={sim.activeTraceNodeId === ui.selectedNodeId ? sim.activeTraceIndex : null}
                            onPathSelect={(index) => {
                                sim.setActiveTraceNodeId(ui.selectedNodeId);
                                sim.setActiveTraceIndex(index);
                            }}
                        />
                    )}

                    <RippleSummary affectedNodes={sim.affectedNodes} nodes={graph.nodes} />
                    <ComparisonSummary changedNodes={sim.comparisonChanges} nodes={graph.nodes} />

                    {error && (
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-md shadow-md flex items-center gap-2 z-50">
                            <span className="text-xs font-medium">{error}</span>
                            <button onClick={graph.loadGraph} className="p-1 hover:bg-red-200 rounded">
                                <RefreshCw className="w-3 h-3" />
                            </button>
                        </div>
                    )}
                </div>
            </main>

            {/* Right sidebar — simulation controls */}
            <aside className={`absolute right-0 top-0 bottom-0 z-40 transition-transform duration-300 ${ui.isRightSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                <ControlPanel
                    selectedNode={selectedNode}
                    onSimulate={sim.runSimulation}
                    onCompare={sim.runComparison}
                    onReset={sim.resetSimulation}
                    perturbations={sim.perturbations}
                    setPerturbations={sim.setPerturbations}
                    options={sim.options}
                    setOptions={sim.setOptions}
                    context={sim.context}
                    setContext={sim.setContext}
                    isSimulating={sim.isSimulating}
                    isComparing={sim.isComparing}
                    canSimulate={sim.canSimulate}
                />
            </aside>
        </div>
    );
}
