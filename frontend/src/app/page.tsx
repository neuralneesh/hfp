"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Sidebar from '@/components/Sidebar';
import GraphView from '@/components/GraphView';
import ControlPanel from '@/components/ControlPanel';
import RippleSummary from '@/components/RippleSummary';
import TraceViewer from '@/components/TraceViewer';
import {
  Node as GNode,
  Edge as GEdge,
  AffectedNode,
  Perturbation,
  SimulationOptions,
  Domain,
  TraceStep,
  GraphSettings
} from '@/lib/types';
import { getGraph, simulate } from '@/lib/api';
import { Loader2, RefreshCw } from 'lucide-react';

export default function Home() {
  // State
  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [affectedNodes, setAffectedNodes] = useState<AffectedNode[]>([]);
  const [traces, setTraces] = useState<Record<string, TraceStep[]>>({});

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<Domain | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [pinnedNodes, setPinnedNodes] = useState<string[]>([]);

  const [perturbations, setPerturbations] = useState<Perturbation[]>([]);
  const [context, setContext] = useState<Record<string, boolean>>({});
  const [options, setOptions] = useState<SimulationOptions>({
    max_hops: 8,
    min_confidence: 0.1,
    time_window: 'all',
    dim_unaffected: true,
  });
  const [graphSettings, setGraphSettings] = useState<GraphSettings>({
    nodeSize: 10,
    fontSize: 16,
    linkThickness: 1.5,
    nodeRepulsion: 450000,
    idealEdgeLength: 50,
    showArrows: true,
    groupByDomain: true,
    textFadeThreshold: 0.5,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasClinicalContext = useMemo(
    () => Object.values(context).some(Boolean),
    [context]
  );
  const canSimulate = perturbations.length > 0 || hasClinicalContext;
  const shouldDimUnaffected = options.dim_unaffected && perturbations.length > 0;

  // Fetch initial graph
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

  // Simulation handler
  const runSimulation = async () => {
    if (!canSimulate) return;
    try {
      setIsSimulating(true);
      const res = await simulate({
        perturbations,
        context,
        options,
      });
      setAffectedNodes(res.affected_nodes);
      setTraces(res.traces);
    } catch (err) {
      console.error(err);
      setError('Simulation failed.');
    } finally {
      setIsSimulating(false);
    }
  };

  const resetSimulation = () => {
    setAffectedNodes([]);
    setTraces({});
    setPerturbations([]);
  };

  // UI Helpers
  const selectedNode = useMemo(() =>
    nodes.find(n => n.id === selectedNodeId) || null
    , [nodes, selectedNodeId]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (selectedDomain !== 'all') {
      result = result.filter(n => n.domain === selectedDomain);
    }
    // Cross-domain highlighted nodes should stay visible if they are affected
    const affectedIds = new Set(affectedNodes.map(an => an.node_id));
    return result.filter(n => selectedDomain === 'all' || n.domain === selectedDomain || affectedIds.has(n.id));
  }, [nodes, selectedDomain, affectedNodes]);

  const filteredEdges = useMemo(() => {
    const nodeIds = new Set(filteredNodes.map(n => n.id));
    return edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [edges, filteredNodes]);

  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    affectedNodes.forEach(an => {
      const node = nodes.find(n => n.id === an.node_id);
      if (node) {
        counts[node.domain] = (counts[node.domain] || 0) + 1;
      }
    });
    return counts;
  }, [affectedNodes, nodes]);

  const togglePin = (id: string) => {
    setPinnedNodes(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 gap-4">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
        <p className="text-slate-500 font-medium">Building HumanGraph...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans antialiased text-slate-900">
      <Sidebar
        nodes={nodes}
        selectedDomain={selectedDomain}
        setSelectedDomain={setSelectedDomain}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        pinnedNodes={pinnedNodes}
        togglePin={togglePin}
        onNodeClick={setSelectedNodeId}
        domainCounts={domainCounts}
        graphSettings={graphSettings}
        setGraphSettings={setGraphSettings}
      />

      <main className="flex-1 relative flex flex-col overflow-hidden">
        {/* Header/Breadcrumbs can go here if needed */}

        <div className="flex-1 relative">
          <GraphView
            nodes={nodes}
            edges={edges}
            affectedNodes={affectedNodes}
            perturbations={perturbations}
            selectedNodeId={selectedNodeId}
            onNodeClick={setSelectedNodeId}
            dimUnaffected={shouldDimUnaffected}
            settings={graphSettings}
          />

          {selectedNodeId && traces[selectedNodeId] && (
            <TraceViewer
              nodeId={selectedNodeId}
              nodeLabel={selectedNode?.label || ''}
              traces={traces[selectedNodeId]}
            />
          )}

          <RippleSummary
            affectedNodes={affectedNodes}
            nodes={nodes}
          />

          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-100 border border-red-200 text-red-700 px-4 py-2 rounded-md shadow-md flex items-center gap-2 z-50">
              <span className="text-xs font-medium">{error}</span>
              <button
                onClick={loadGraph}
                className="p-1 hover:bg-red-200 rounded"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </main>

      <ControlPanel
        selectedNode={selectedNode}
        onSimulate={runSimulation}
        onReset={resetSimulation}
        perturbations={perturbations}
        setPerturbations={setPerturbations}
        options={options}
        setOptions={setOptions}
        context={context}
        setContext={setContext}
        isSimulating={isSimulating}
        canSimulate={canSimulate}
      />
    </div>
  );
}
