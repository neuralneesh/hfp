"use client";

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import { Node as GNode, Edge as GEdge, AffectedNode, Perturbation } from '@/lib/types';

// Register the fcose layout extension
// cytoscape.use() is safe to call multiple times in most environments,
// but we'll wrap it just in case of environment-specific issues.
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
    onNodeClick: (nodeId: string) => void;
    dimUnaffected?: boolean;
    settings: import('@/lib/types').GraphSettings;
}

// fcose options for an expansive, Obsidian-like "constellation" look
const FCOSE_LAYOUT_OPTIONS = {
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    animate: true,
    animationDuration: 1000,
    fit: true,
    padding: 100,
    nodeDimensionsIncludeLabels: true, // Crucial for label separation
    uniformNodeDimensions: false,

    // Physics Parameters
    nodeRepulsion: 450000,            // Balanced high repulsion
    idealEdgeLength: 400,             // Long edges for airiness
    sampleSize: 100,
    edgeElasticity: 0.1,              // Moderate loose springs
    nestingFactor: 0.1,
    gravity: 0.1,                     // Minimal gravity to keep it centered but not clumped
    gravityRange: 0,
    gravityCompound: 0,

    // Iterations
    numIter: 5000,
    tilingPaddingVertical: 200,
    tilingPaddingHorizontal: 200,
    initialEnergyOnIncremental: 1.0,
};

const getLayoutOptions = (settings: import('@/lib/types').GraphSettings): any => {
    if (settings.groupByDomain) {
        return {
            name: 'fcose',
            quality: 'proof',
            randomize: true,
            animate: true,
            animationDuration: 1000,
            fit: true,
            padding: 60,
            nodeDimensionsIncludeLabels: true,
            uniformNodeDimensions: false,
            nodeRepulsion: 8000,
            idealEdgeLength: 80,
            edgeElasticity: 0.45,
            nestingFactor: 0.5,
            gravity: 0.4,
            gravityRange: 100,
            gravityCompound: 1.5,
            numIter: 5000,
            tilingPaddingVertical: 20,
            tilingPaddingHorizontal: 20,
        };
    }

    return {
        ...FCOSE_LAYOUT_OPTIONS,
        nodeRepulsion: settings.nodeRepulsion,
        idealEdgeLength: settings.idealEdgeLength,
    };
};

export interface GraphViewRef {
    fit: () => void;
    runLayout: () => void;
}

const DOMAIN_COLORS: Record<string, string> = {
    cardio: '#ef4444', // red-500
    pulm: '#3b82f6',   // blue-500
    renal: '#10b981',  // emerald-500
    acidbase: '#f59e0b', // amber-500
    neuro: '#8b5cf6', // violet-500
};

const GraphView = forwardRef<GraphViewRef, GraphViewProps>(({ nodes, edges, affectedNodes, perturbations, selectedNodeId, onNodeClick, dimUnaffected, settings }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const pulseIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const clampedFontSize = Math.max(16, Math.min(42, settings.fontSize));

    useImperativeHandle(ref, () => ({
        fit: () => {
            cyRef.current?.fit();
        },
        runLayout: () => {
            if (!cyRef.current) return;
            cyRef.current.layout(getLayoutOptions(settings)).run();
        }
    }));

    // Handle Pulsating Animation
    useEffect(() => {
        if (!cyRef.current) return;

        // Clear previous interval
        if (pulseIntervalRef.current) {
            clearInterval(pulseIntervalRef.current);
        }

        const cy = cyRef.current;
        const emphasizedNodeIds = new Set(perturbations.map(p => p.node_id));
        if (selectedNodeId) emphasizedNodeIds.add(selectedNodeId);

        if (emphasizedNodeIds.size > 0) {
            pulseIntervalRef.current = setInterval(() => {
                cy.nodes().forEach(node => {
                    if (emphasizedNodeIds.has(node.id()) && !node.data('isParent')) {
                        const baseSize = Math.max(14, settings.nodeSize + 4);
                        const pulseSize = Math.max(26, Math.round(baseSize * 2.1));

                        node.stop(true); // Stop existing animations
                        node.animate({
                            style: {
                                'width': pulseSize,
                                'height': pulseSize,
                                'border-width': 5,
                                'border-color': '#0ea5e9',
                                'opacity': 1,
                            },
                        }, {
                            duration: 550,
                            easing: 'ease-in-out-sine',
                            complete: () => {
                                node.animate({
                                    style: {
                                        'width': baseSize,
                                        'height': baseSize,
                                        'border-width': 2,
                                        'border-color': '#0284c7',
                                    },
                                }, {
                                    duration: 850,
                                    easing: 'ease-in-out-sine'
                                });
                            }
                        });
                    }
                });
            }, 1200);
        }

        return () => {
            if (pulseIntervalRef.current) clearInterval(pulseIntervalRef.current);
        };
    }, [perturbations, selectedNodeId, settings.nodeSize]);

    useEffect(() => {
        if (!containerRef.current) return;

        if (!cyRef.current) {
            const initialElements = nodes.length > 0 ? [
                ...nodes.map(node => ({
                    data: {
                        id: node.id,
                        label: node.label,
                        domain: node.domain,
                        parent: settings.groupByDomain ? `parent-${node.domain}` : undefined
                    }
                })),
                ...(settings.groupByDomain ? Array.from(new Set(nodes.map(n => n.domain))).map(domain => ({
                    data: { id: `parent-${domain}`, label: domain.toUpperCase(), isParent: true }
                })) : []),
                ...edges.map((edge, i) => ({
                    data: {
                        id: `e${i}`,
                        source: edge.source,
                        target: edge.target,
                        rel: edge.rel
                    }
                }))
            ] : [];

            cyRef.current = cytoscape({
                container: containerRef.current,
                elements: initialElements,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'label': 'data(label)',
                            'background-color': (ele: any) => DOMAIN_COLORS[ele.data('domain')] || '#cbd5e1',
                            'color': '#475569', // slate-600
                            'text-valign': 'bottom',
                            'text-halign': 'center',
                            'font-size': `${clampedFontSize}px`,
                            'font-family': 'Inter, system-ui, sans-serif',
                            'text-margin-y': '8px',
                            'text-wrap': 'wrap',
                            'text-max-width': '100px',
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
                                if (rel === 'increases') return '#10b981'; // green-500
                                if (rel === 'decreases') return '#ef4444'; // red-500
                                return '#cbd5e1'; // slate-300
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
                            'background-color': (ele: any) => {
                                const domain = ele.id().replace('parent-', '');
                                return DOMAIN_COLORS[domain] || '#cbd5e1';
                            },
                            'border-width': 1,
                            'border-style': 'dashed',
                            'border-color': (ele: any) => {
                                const domain = ele.id().replace('parent-', '');
                                return DOMAIN_COLORS[domain] || '#cbd5e1';
                            },
                            'label': 'data(label)',
                            'font-size': '12px',
                            'font-weight': 'bold',
                            'text-valign': 'top',
                            'text-halign': 'center',
                            'text-margin-y': -10,
                            'color': (ele: any) => {
                                const domain = ele.id().replace('parent-', '');
                                return DOMAIN_COLORS[domain] || '#475569';
                            },
                            'padding': 30,
                        }
                    },
                    {
                        selector: 'node[?isParent]',
                        style: {
                            'shape': 'round-rectangle',
                        }
                    },
                    {
                        selector: 'node:selected',
                        style: {
                            'border-width': 2,
                            'border-color': '#1e293b', // slate-800
                            'width': settings.nodeSize * 1.5,
                            'height': settings.nodeSize * 1.5,
                            'font-weight': 'bold',
                        }
                    }
                ],
                layout: getLayoutOptions(settings)
            });

            cyRef.current.on('tap', 'node', (evt) => {
                onNodeClick(evt.target.id());
            });
        }

        const cy = cyRef.current;
        const affectedMap = new Map(affectedNodes.map(a => [a.node_id, a]));
        const currentDataNodes = cy.nodes().filter(n => !n.data('isParent'));
        const currentEdges = cy.edges();

        const needsFullUpdate = nodes.length !== currentDataNodes.length ||
            edges.length !== currentEdges.length ||
            (settings.groupByDomain && cy.nodes('[?isParent]').length === 0) ||
            (!settings.groupByDomain && cy.nodes('[?isParent]').length > 0);

        if (needsFullUpdate) {
            const elements = [
                ...nodes.map(node => ({
                    data: {
                        id: node.id,
                        label: node.label,
                        domain: node.domain,
                        parent: settings.groupByDomain ? `parent-${node.domain}` : undefined
                    }
                })),
                ...(settings.groupByDomain ? Array.from(new Set(nodes.map(n => n.domain))).map(domain => ({
                    data: { id: `parent-${domain}`, label: domain.toUpperCase(), isParent: true }
                })) : []),
                ...edges.map((edge, i) => ({
                    data: {
                        id: `e${i}`,
                        source: edge.source,
                        target: edge.target,
                        rel: edge.rel
                    }
                }))
            ];
            cy.json({ elements });
            cy.layout(getLayoutOptions(settings)).run();
        }

        // Always update visual state based on affectedNodes
        cy.nodes(':childless').forEach(node => {
            const nodeData = nodes.find(n => n.id === node.id());
            const affected = affectedMap.get(node.id());

            // Update label with direction icon
            let displayLabel = nodeData?.label || '';
            if (affected) {
                if (affected.direction === 'up') displayLabel = `↑ ${displayLabel}`;
                if (affected.direction === 'down') displayLabel = `↓ ${displayLabel}`;
            }
            node.data('label', displayLabel);

            // Update styling
            if (affected) {
                const intensity = (affected.confidence * 3) + 1;
                const borderColor = affected.direction === 'up' ? '#22c55e' : (affected.direction === 'down' ? '#ef4444' : '#000');
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
                node.style({
                    'opacity': 0.1,
                    'border-width': 0,
                    'width': settings.nodeSize,
                    'height': settings.nodeSize,
                    'font-weight': 'normal',
                    'color': '#94a3b8',
                });
            } else {
                node.style({
                    'opacity': 1,
                    'border-width': 0,
                    'width': settings.nodeSize,
                    'height': settings.nodeSize,
                    'font-weight': 'normal',
                    'color': '#475569',
                });
            }
        });

        // Update Cytoscape Stylesheet Reactively (only childless / data nodes)
        cy.style()
            .selector('node:childless')
            .style({
                'width': settings.nodeSize,
                'height': settings.nodeSize,
                'font-size': `${clampedFontSize}px`,
            })
            .selector('edge')
            .style({
                'width': settings.linkThickness,
                'target-arrow-shape': settings.showArrows ? 'triangle' : 'none',
            })
            .update();

    }, [nodes, edges, affectedNodes, onNodeClick, dimUnaffected, settings, clampedFontSize]);

    return <div ref={containerRef} className="w-full h-full bg-[#f8fafc]" />;
});

GraphView.displayName = 'GraphView';

export default GraphView;
