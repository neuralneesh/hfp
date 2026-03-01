'use client';

import { useState, useEffect, useMemo } from 'react';
import type {
    AffectedNode,
    ComparedNode,
    Perturbation,
    SimulationOptions,
    TraceStep,
} from '@/lib/types';
import { simulate, compareSimulations } from '@/lib/api';
import { DEFAULT_SIMULATION_OPTIONS } from '@/lib/constants';

/**
 * Manages simulation state: perturbations, clinical context, options, results,
 * and the automatic trace-selection logic.
 *
 * @param selectedNodeId - The currently selected node in the graph. Used to
 *   auto-select the most relevant causal trace when the selection changes.
 *
 * To add a new simulation action: add the async function here and return it.
 * To add new result fields: extend the relevant AffectedNode/TraceStep types
 * in types.ts and the return value here.
 */
export function useSimulation(selectedNodeId: string | null) {
    // --- Inputs ---
    const [perturbations, setPerturbations] = useState<Perturbation[]>([]);
    const [context, setContext] = useState<Record<string, boolean>>({});
    const [options, setOptions] = useState<SimulationOptions>(DEFAULT_SIMULATION_OPTIONS);

    // --- Results ---
    const [affectedNodes, setAffectedNodes] = useState<AffectedNode[]>([]);
    const [traces, setTraces] = useState<Record<string, TraceStep[]>>({});
    const [comparisonChanges, setComparisonChanges] = useState<ComparedNode[]>([]);

    // --- Loading & error ---
    const [isSimulating, setIsSimulating] = useState(false);
    const [isComparing, setIsComparing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- Active trace selection ---
    const [activeTraceIndex, setActiveTraceIndex] = useState<number | null>(null);
    const [activeTraceNodeId, setActiveTraceNodeId] = useState<string | null>(null);

    // --- Derived ---
    const hasClinicalContext = useMemo(
        () => Object.values(context).some(Boolean),
        [context],
    );
    const canSimulate = perturbations.length > 0 || hasClinicalContext;

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------

    const runSimulation = async () => {
        if (!canSimulate) return;
        try {
            setIsSimulating(true);
            const res = await simulate({ perturbations, context, options });
            setAffectedNodes(res.affected_nodes);
            setTraces(res.traces);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Simulation failed.');
        } finally {
            setIsSimulating(false);
        }
    };

    const runComparison = async () => {
        if (!canSimulate) return;
        try {
            setIsComparing(true);
            const res = await compareSimulations({
                baseline:     { perturbations: [], context, options },
                intervention: { perturbations, context, options },
            });
            setComparisonChanges(res.changed_nodes);
            setAffectedNodes(res.intervention.affected_nodes);
            setTraces(res.intervention.traces);
            setError(null);
        } catch (err) {
            console.error(err);
            setError('Comparison failed.');
        } finally {
            setIsComparing(false);
        }
    };

    const resetSimulation = () => {
        setAffectedNodes([]);
        setTraces({});
        setPerturbations([]);
        setComparisonChanges([]);
    };

    // ---------------------------------------------------------------------------
    // Trace auto-selection
    //
    // When the selected node changes, pick the trace that starts from a
    // perturbed node and has the highest confidence. This gives the user the
    // most meaningful causal path by default without requiring manual selection.
    // ---------------------------------------------------------------------------
    useEffect(() => {
        if (!selectedNodeId) {
            if (activeTraceIndex !== null) setActiveTraceIndex(null);
            if (activeTraceNodeId !== null) setActiveTraceNodeId(null);
            return;
        }

        const nodeTraces = traces[selectedNodeId] || [];
        if (nodeTraces.length === 0) {
            if (activeTraceIndex !== null) setActiveTraceIndex(null);
            if (activeTraceNodeId !== null) setActiveTraceNodeId(null);
            return;
        }

        // Don't change the selection if the user already picked a valid trace
        // for this node
        const isSameNode = activeTraceNodeId === selectedNodeId;
        const hasValidSelection =
            isSameNode && activeTraceIndex !== null && activeTraceIndex < nodeTraces.length;
        if (hasValidSelection) return;

        // Prefer traces that originate from a perturbed node
        const perturbationNodeIds = new Set(perturbations.map((p) => p.node_id));
        let preferredIndex = -1;
        let preferredConfidence = -1;
        nodeTraces.forEach((trace, index) => {
            const startsFromPerturbation =
                trace.path.length > 0 && perturbationNodeIds.has(trace.path[0]);
            if (!startsFromPerturbation) return;
            if (trace.confidence > preferredConfidence) {
                preferredConfidence = trace.confidence;
                preferredIndex = index;
            }
        });

        setActiveTraceNodeId(selectedNodeId);
        setActiveTraceIndex(preferredIndex >= 0 ? preferredIndex : 0);
    }, [selectedNodeId, traces, perturbations, activeTraceIndex, activeTraceNodeId]);

    return {
        // Inputs
        perturbations, setPerturbations,
        context, setContext,
        options, setOptions,
        // Results
        affectedNodes,
        traces,
        comparisonChanges,
        // Status
        isSimulating,
        isComparing,
        error,
        // Trace selection
        activeTraceIndex, setActiveTraceIndex,
        activeTraceNodeId, setActiveTraceNodeId,
        // Derived
        canSimulate,
        hasClinicalContext,
        // Actions
        runSimulation,
        runComparison,
        resetSimulation,
    };
}
