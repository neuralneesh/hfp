"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Node as GNode, Edge as GEdge, AffectedNode, Perturbation } from '@/lib/types';
import {
    buildGraphElements,
    runCytoscapeLayout,
    blendHex,
    DOMAIN_HEX_COLORS,
} from '@/lib/cytoscape-utils';

// Register the fcose layout extension once
try {
    cytoscape.use(fcose);
} catch (e) {
    // Already registered or registration failed
}

interface GraphViewProps {
    nodes: GNode[];
    edges: GEdge[];
    affectedNodes: AffectedNode[];
    perturbations: Perturbation[];
    selectedNodeId?: string | null;
    highlightedPath?: string[];
    onNodeClick: (nodeId: string) => void;
    dimUnaffected?: boolean;
    settings: import('@/lib/types').GraphSettings;
}

export interface GraphViewRef {
    fit: () => void;
    runLayout: () => void;
}

const GraphView = forwardRef<GraphViewRef, GraphViewProps>(({
    nodes, edges, affectedNodes, perturbations,
    selectedNodeId, highlightedPath, onNodeClick, dimUnaffected, settings,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const pulseIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pathAnimationRef = useRef<NodeJS.Timeout | null>(null);

    // Font/size values derived from settings — computed once per render for use in styles
    const clampedFontSize = Math.max(16, Math.min(42, settings.fontSize));
    const nodeTextMaxWidth = Math.max(120, Math.min(280, Math.round(clampedFontSize * 6.5)));
    const domainLabelSize = Math.max(20, Math.min(36, Math.round(clampedFontSize * 1.35)));
    const subdomainLabelSize = Math.max(16, Math.min(28, Math.round(clampedFontSize * 1.1)));
    const domainPadding = Math.max(14, Math.round(settings.nodeSize * 1.6));
    const subdomainPadding = Math.max(6, Math.round(settings.nodeSize * 0.7));

    useImperativeHandle(ref, () => ({
        fit: () => { cyRef.current?.fit(); },
        runLayout: () => { if (cyRef.current) runCytoscapeLayout(cyRef.current, settings); },
    }));

    // -------------------------------------------------------------------------
    // Pulse animation for perturbed / selected nodes
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!cyRef.current) return;
        if (pulseIntervalRef.current) clearInterval(pulseIntervalRef.current);

        const cy = cyRef.current;
        const emphasizedNodeIds = new Set(perturbations.map(p => p.node_id));
        if (selectedNodeId) emphasizedNodeIds.add(selectedNodeId);

        if (emphasizedNodeIds.size > 0) {
            pulseIntervalRef.current = setInterval(() => {
                cy.nodes().forEach(node => {
                    if (emphasizedNodeIds.has(node.id()) && !node.data('isParent')) {
                        const baseSize = Math.max(14, settings.nodeSize + 4);
                        const pulseSize = Math.max(26, Math.round(baseSize * 2.1));
                        node.stop(true);
                        node.animate(
                            { style: { 'width': pulseSize, 'height': pulseSize, 'border-width': 5, 'border-color': '#0ea5e9', 'opacity': 1 } },
                            { duration: 550, easing: 'ease-in-out-sine', complete: () => {
                                node.animate(
                                    { style: { 'width': baseSize, 'height': baseSize, 'border-width': 2, 'border-color': '#0284c7' } },
                                    { duration: 850, easing: 'ease-in-out-sine' }
                                );
                            }}
                        );
                    }
                });
            }, 1200);
        }

        return () => { if (pulseIntervalRef.current) clearInterval(pulseIntervalRef.current); };
    }, [perturbations, selectedNodeId, settings.nodeSize]);

    // -------------------------------------------------------------------------
    // Main graph effect: initialization, node/edge updates, path highlighting
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!containerRef.current) return;

        // --- Initialize Cytoscape on first render ---
        if (!cyRef.current) {
            const initialElements = nodes.length > 0
                ? buildGraphElements(nodes, edges, settings.groupByDomain)
                : [];

            cyRef.current = cytoscape({
                container: containerRef.current,
                elements: initialElements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'background-color': (ele: any) => DOMAIN_HEX_COLORS[ele.data('domain')] || '#cbd5e1',
                            'color': '#475569',
                            'text-valign': 'bottom',
                            'text-halign': 'center',
                            'font-size': `${clampedFontSize}px`,
                            'font-family': 'Inter, system-ui, sans-serif',
                            'text-margin-y': 10,
                            'text-wrap': 'wrap',
                            'text-max-width': `${nodeTextMaxWidth}px`,
                            'line-height': 1.12,
                            'width': settings.nodeSize,
                            'height': settings.nodeSize,
                            'border-width': 0,
                            'border-color': '#000',
                            'transition-property': 'background-color, border-width, border-color, width, height, opacity, color',
                            'transition-duration': 0.3,
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            'width': settings.linkThickness,
                            'line-color': (ele: any) => {
                                const rel = ele.data('rel');
                                if (rel === 'increases') return '#10b981';
                                if (rel === 'decreases') return '#ef4444';
                                return '#cbd5e1';
                            },
                            'target-arrow-color': (ele: any) => {
                                const rel = ele.data('rel');
                                if (rel === 'increases') return '#10b981';
                                if (rel === 'decreases') return '#ef4444';
                                return '#cbd5e1';
                            },
                            'target-arrow-shape': settings.showArrows ? 'triangle' : 'none',
                            'curve-style': 'bezier',
                            'arrow-scale': 0.6,
                            'label': 'data(rel)',
                            'font-size': '8px',
                            'text-rotation': 'autorotate',
                            'text-margin-y': -10,
                            'opacity': 0.4,
                        }
                    },
                    {
                        selector: ':parent',
                        style: {
                            'background-opacity': 0.05,
                            'background-color': (ele: any) => DOMAIN_HEX_COLORS[ele.data('domain')] || '#cbd5e1',
                            'border-width': 1,
                            'border-style': 'dashed',
                            'border-color': (ele: any) => DOMAIN_HEX_COLORS[ele.data('domain')] || '#cbd5e1',
                            'label': 'data(label)',
                            'font-size': '12px',
                            'font-weight': 'bold',
                            'text-valign': 'top',
                            'text-halign': 'center',
                            'text-margin-y': -10,
                            'color': (ele: any) => DOMAIN_HEX_COLORS[ele.data('domain')] || '#475569',
                            'padding': '30px',
                        }
                    },
                    {
                        selector: 'node[parentType = "domain"]',
                        style: {
                            'border-width': 1.5,
                            'border-style': 'dashed',
                            'font-size': `${domainLabelSize}px`,
                            'font-weight': 'bold',
                            'text-margin-y': -12,
                            'text-wrap': 'none',
                            'min-zoomed-font-size': 10,
                            'padding': `${domainPadding}px`,
                        }
                    },
                    {
                        selector: 'node[parentType = "subdomain"]',
                        style: {
                            'background-opacity': 0.08,
                            'border-width': 1,
                            'border-style': 'solid',
                            'font-size': `${subdomainLabelSize}px`,
                            'font-weight': 700,
                            'color': '#64748b',
                            'text-margin-y': -8,
                            'text-wrap': 'none',
                            'min-zoomed-font-size': 9,
                            'padding': `${subdomainPadding}px`,
                        }
                    },
                    {
                        selector: 'node[?isParent]',
                        style: { 'shape': 'round-rectangle' }
                    },
                    {
                        selector: 'node:selected',
                        style: {
                            'border-width': 2,
                            'border-color': '#1e293b',
                            'width': settings.nodeSize * 1.5,
                            'height': settings.nodeSize * 1.5,
                            'font-weight': 'bold',
                        }
                    },
                    {
                        selector: 'node.path-node',
                        style: { 'border-width': 4, 'border-color': '#f59e0b', 'opacity': 1, 'font-weight': 'bold', 'color': '#0f172a' }
                    },
                    {
                        selector: 'node.path-source',
                        style: { 'border-color': '#0ea5e9' }
                    },
                    {
                        selector: 'node.path-target',
                        style: { 'border-color': '#a855f7' }
                    },
                    {
                        selector: 'edge.path-edge',
                        style: {
                            'line-color': '#f59e0b',
                            'target-arrow-color': '#f59e0b',
                            'width': Math.max(3, settings.linkThickness * 2.25),
                            'opacity': 1,
                        }
                    },
                    {
                        selector: 'edge.path-muted-edge',
                        style: { 'opacity': 0.08 }
                    }
                ],
                layout: { name: 'preset' }
            });

            cyRef.current.on('tap', 'node', (evt) => {
                onNodeClick(evt.target.id());
            });

            runCytoscapeLayout(cyRef.current, settings);
        }

        const cy = cyRef.current;
        const affectedMap = new Map(affectedNodes.map(a => [a.node_id, a]));
        const currentDataNodes = cy.nodes().filter(n => !n.data('isParent'));

        // Rebuild the graph if the node/edge count or grouping mode changed
        const needsFullUpdate =
            nodes.length !== currentDataNodes.length ||
            edges.length !== cy.edges().length ||
            (settings.groupByDomain && cy.nodes('[?isParent]').length === 0) ||
            (!settings.groupByDomain && cy.nodes('[?isParent]').length > 0);

        if (needsFullUpdate) {
            cy.json({ elements: buildGraphElements(nodes, edges, settings.groupByDomain) });
            runCytoscapeLayout(cy, settings);
        }

        // --- Update visual state for each leaf node ---
        cy.nodes(':childless').forEach(node => {
            const nodeData = nodes.find(n => n.id === node.id());
            const affected = affectedMap.get(node.id());

            // Prepend a direction arrow to the label when affected
            let displayLabel = nodeData?.label || '';
            if (affected) {
                if (affected.direction === 'up') displayLabel = `↑ ${displayLabel}`;
                if (affected.direction === 'down') displayLabel = `↓ ${displayLabel}`;
            }
            node.data('label', displayLabel);

            if (affected) {
                const intensity = (affected.confidence * 3) + 1;
                const borderColor = affected.direction === 'up' ? '#22c55e'
                    : affected.direction === 'down' ? '#ef4444'
                    : '#000';
                node.style({
                    'border-width': intensity,
                    'border-color': borderColor as any,
                    'width': 16 + (intensity * 2),
                    'height': 16 + (intensity * 2),
                    'opacity': 1,
                    'font-weight': 'bold',
                    'color': '#0f172a',
                });
            } else if (affectedNodes.length > 0 && dimUnaffected !== false) {
                node.style({ 'opacity': 0.1, 'border-width': 0, 'width': settings.nodeSize, 'height': settings.nodeSize, 'font-weight': 'normal', 'color': '#94a3b8' });
            } else {
                node.style({ 'opacity': 1, 'border-width': 0, 'width': settings.nodeSize, 'height': settings.nodeSize, 'font-weight': 'normal', 'color': '#475569' });
            }
        });

        // --- Clear previous path highlighting ---
        cy.nodes().removeClass('path-node path-source path-target');
        cy.edges().removeClass('path-edge path-muted-edge');
        cy.edges().removeData('pathOrder');
        cy.edges().removeStyle('line-color target-arrow-color width opacity line-style line-dash-pattern line-dash-offset');

        if (pathAnimationRef.current) {
            clearInterval(pathAnimationRef.current);
            pathAnimationRef.current = null;
        }

        // --- Apply new path highlighting ---
        if (highlightedPath && highlightedPath.length > 0) {
            highlightedPath.forEach((nodeId, i) => {
                const ele = cy.$id(nodeId);
                if (!ele || ele.empty()) return;
                ele.addClass('path-node');
                if (i === 0) ele.addClass('path-source');
                if (i === highlightedPath.length - 1) ele.addClass('path-target');
            });

            for (let i = 0; i < highlightedPath.length - 1; i++) {
                const source = highlightedPath[i];
                const target = highlightedPath[i + 1];
                cy.edges().forEach((edge) => {
                    if (edge.data('source') === source && edge.data('target') === target) {
                        edge.addClass('path-edge');
                        edge.data('pathOrder', i);
                    }
                });
            }

            cy.edges().not('.path-edge').addClass('path-muted-edge');

            // Animated "pulse" travels along the highlighted path
            const maxOrder = Math.max(0, highlightedPath.length - 2);
            let head = 0;
            pathAnimationRef.current = setInterval(() => {
                head += 0.14;
                if (head > maxOrder + 1.5) head = 0;

                cy.edges('.path-edge').forEach((edge) => {
                    const order = Number(edge.data('pathOrder') || 0);
                    const domainProgress = maxOrder === 0 ? 1 : order / maxOrder;
                    const baseLineColor = blendHex('#06b6d4', '#8b5cf6', domainProgress);
                    const baseArrowColor = blendHex('#22d3ee', '#a78bfa', domainProgress);
                    const distance = Math.abs(order - head);
                    const pulse = Math.max(0, 1 - distance / 0.9);
                    const dashOffset = -((head * 36) - (order * 10));
                    edge.style({
                        'line-color': blendHex(baseLineColor, '#ffffff', pulse * 0.7) as any,
                        'target-arrow-color': blendHex(baseArrowColor, '#fef9c3', pulse * 0.6) as any,
                        'line-style': 'dashed',
                        'line-dash-pattern': [14, 12] as any,
                        'line-dash-offset': dashOffset as any,
                        'width': Math.max(3.5, settings.linkThickness * (2.1 + pulse * 1.2)),
                        'opacity': 0.72 + (pulse * 0.28),
                    });
                });
            }, 50);
        }

        // --- Keep stylesheet in sync with settings ---
        cy.style()
            .selector('node:childless')
            .style({
                'width': settings.nodeSize,
                'height': settings.nodeSize,
                'font-size': `${clampedFontSize}px`,
                'text-max-width': `${nodeTextMaxWidth}px`,
                'text-margin-y': 10,
                'line-height': 1.12,
            })
            .selector('edge')
            .style({
                'width': settings.linkThickness,
                'target-arrow-shape': settings.showArrows ? 'triangle' : 'none',
            })
            .update();

    }, [nodes, edges, affectedNodes, onNodeClick, dimUnaffected, settings, clampedFontSize, nodeTextMaxWidth, highlightedPath]);

    // Clean up path animation on unmount
    useEffect(() => {
        return () => { if (pathAnimationRef.current) clearInterval(pathAnimationRef.current); };
    }, []);

    return <div ref={containerRef} className="w-full h-full bg-[#f8fafc]" />;
});

GraphView.displayName = 'GraphView';

export default GraphView;
