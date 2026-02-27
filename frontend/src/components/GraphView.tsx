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
    highlightedPath?: string[];
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
            padding: 24,
            nodeDimensionsIncludeLabels: true,
            uniformNodeDimensions: false,
            nodeRepulsion: 9000,
            idealEdgeLength: 90,
            edgeElasticity: 0.35,
            nestingFactor: 0.25,
            gravity: 0.25,
            gravityRange: 120,
            gravityCompound: 1.2,
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

const buildGraphElements = (nodes: GNode[], edges: GEdge[], groupByDomain: boolean) => {
    const formatSubdomainLabel = (value: string) =>
        value.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    const subdomainParentId = (domain: string, subdomain: string) => `parent-${domain}-${subdomain}`;

    const nodeElements = nodes.map(node => {
        const parent = groupByDomain
            ? (node.subdomain ? subdomainParentId(node.domain, node.subdomain) : `parent-${node.domain}`)
            : undefined;
        return {
            data: {
                id: node.id,
                label: node.label,
                domain: node.domain,
                subdomain: node.subdomain,
                parent,
            }
        };
    });

    const domainParentElements = groupByDomain
        ? Array.from(new Set(nodes.map(n => n.domain))).map(domain => ({
            data: {
                id: `parent-${domain}`,
                label: domain.toUpperCase(),
                isParent: true,
                parentType: 'domain',
                domain,
            }
        }))
        : [];

    const subdomainParentElements = groupByDomain
        ? Array.from(
            new Set(
                nodes
                    .filter((n) => !!n.subdomain)
                    .map((n) => `${n.domain}::${n.subdomain}`)
            )
        ).map((key) => {
            const [domain, subdomain] = key.split("::");
            return {
                data: {
                    id: subdomainParentId(domain, subdomain),
                    label: formatSubdomainLabel(subdomain),
                    isParent: true,
                    parentType: 'subdomain',
                    domain,
                    subdomain,
                    parent: `parent-${domain}`,
                }
            };
        })
        : [];

    const edgeElements = edges.map((edge, i) => ({
        data: {
            id: `e${i}`,
            source: edge.source,
            target: edge.target,
            rel: edge.rel
        }
    }));

    return [...nodeElements, ...domainParentElements, ...subdomainParentElements, ...edgeElements];
};

const runLayout = (
    cy: cytoscape.Core,
    settings: import('@/lib/types').GraphSettings,
) => {
    const layout = cy.layout(getLayoutOptions(settings));
    layout.one('layoutstop', () => {
        arrangeDomainsAroundNeuro(cy, settings.groupByDomain, settings);
        cy.fit(undefined, 16);
        if (settings.groupByDomain) {
            const fittedZoom = cy.zoom();
            const boostedZoom = Math.min(1, fittedZoom * 1.65);
            if (boostedZoom > fittedZoom) {
                cy.zoom(boostedZoom);
                cy.center();
            }
        }
    });
    layout.run();
};

const domainCentroid = (cy: cytoscape.Core, domain: string) => {
    const nodes = cy.nodes(`[domain = "${domain}"]`).filter((n) => !n.data('isParent'));
    if (nodes.length === 0) return null;
    let x = 0;
    let y = 0;
    nodes.forEach((node) => {
        const pos = node.position();
        x += pos.x;
        y += pos.y;
    });
    return { x: x / nodes.length, y: y / nodes.length };
};

const translateDomain = (cy: cytoscape.Core, domain: string, dx: number, dy: number) => {
    const nodes = cy.nodes(`[domain = "${domain}"]`).filter((n) => !n.data('isParent'));
    nodes.forEach((node) => {
        const pos = node.position();
        node.position({ x: pos.x + dx, y: pos.y + dy });
    });
};

const subdomainNodeCollection = (cy: cytoscape.Core, domain: string, subdomain: string) =>
    cy.nodes(`[domain = "${domain}"][subdomain = "${subdomain}"]`).filter((n) => !n.data('isParent'));

const subdomainBounds = (cy: cytoscape.Core, domain: string, subdomain: string): DomainBounds | null => {
    const nodes = subdomainNodeCollection(cy, domain, subdomain);
    if (nodes.length === 0) return null;
    const bb = nodes.boundingBox({ includeLabels: true, includeOverlays: false });
    return {
        x1: bb.x1,
        x2: bb.x2,
        y1: bb.y1,
        y2: bb.y2,
        cx: (bb.x1 + bb.x2) / 2,
        cy: (bb.y1 + bb.y2) / 2,
        width: Math.max(1, bb.w),
        height: Math.max(1, bb.h),
    };
};

const translateSubdomain = (cy: cytoscape.Core, domain: string, subdomain: string, dx: number, dy: number) => {
    const nodes = subdomainNodeCollection(cy, domain, subdomain);
    nodes.forEach((node) => {
        const pos = node.position();
        node.position({ x: pos.x + dx, y: pos.y + dy });
    });
};

interface DomainBounds {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
}

const domainBounds = (cy: cytoscape.Core, domain: string): DomainBounds | null => {
    const domainNodes = cy.nodes(`[domain = "${domain}"]`).filter((n) => !n.data('isParent'));
    if (domainNodes.length === 0) return null;
    const bb = domainNodes.boundingBox({ includeLabels: true, includeOverlays: false });
    return {
        x1: bb.x1,
        x2: bb.x2,
        y1: bb.y1,
        y2: bb.y2,
        cx: (bb.x1 + bb.x2) / 2,
        cy: (bb.y1 + bb.y2) / 2,
        width: Math.max(1, bb.w),
        height: Math.max(1, bb.h),
    };
};

const resolveDomainOverlaps = (cy: cytoscape.Core, domains: string[], fixedDomain: string, minGap: number) => {
    for (let iter = 0; iter < 12; iter++) {
        let moved = false;
        for (let i = 0; i < domains.length; i++) {
            for (let j = i + 1; j < domains.length; j++) {
                const a = domains[i];
                const b = domains[j];
                const aBounds = domainBounds(cy, a);
                const bBounds = domainBounds(cy, b);
                if (!aBounds || !bBounds) continue;

                const overlapX = Math.min(aBounds.x2, bBounds.x2) - Math.max(aBounds.x1, bBounds.x1);
                const overlapY = Math.min(aBounds.y2, bBounds.y2) - Math.max(aBounds.y1, bBounds.y1);
                if (overlapX <= -minGap || overlapY <= -minGap) continue;

                const neededX = overlapX + minGap;
                const neededY = overlapY + minGap;
                const pushAlongX = neededX < neededY;
                const dirX = aBounds.cx <= bBounds.cx ? 1 : -1;
                const dirY = aBounds.cy <= bBounds.cy ? 1 : -1;

                if (a === fixedDomain && b !== fixedDomain) {
                    translateDomain(cy, b, pushAlongX ? dirX * neededX : 0, pushAlongX ? 0 : dirY * neededY);
                } else if (b === fixedDomain && a !== fixedDomain) {
                    translateDomain(cy, a, pushAlongX ? -dirX * neededX : 0, pushAlongX ? 0 : -dirY * neededY);
                } else if (a !== fixedDomain && b !== fixedDomain) {
                    const dx = pushAlongX ? dirX * neededX * 0.5 : 0;
                    const dy = pushAlongX ? 0 : dirY * neededY * 0.5;
                    translateDomain(cy, a, -dx, -dy);
                    translateDomain(cy, b, dx, dy);
                }
                moved = true;
            }
        }
        if (!moved) break;
    }
};

interface BentoSlot {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
}

const compactNodesInSubdomain = (
    cy: cytoscape.Core,
    domain: string,
    subdomain: string,
    settings: import('@/lib/types').GraphSettings,
) => {
    const nodes = subdomainNodeCollection(cy, domain, subdomain).sort((a, b) =>
        String(a.id()).localeCompare(String(b.id()))
    );
    if (nodes.length <= 1) return;

    let centerX = 0;
    let centerY = 0;
    nodes.forEach((node) => {
        const pos = node.position();
        centerX += pos.x;
        centerY += pos.y;
    });
    centerX /= nodes.length;
    centerY /= nodes.length;

    const cols = nodes.length <= 3 ? nodes.length : Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);
    const largestLabelLen = nodes.reduce((max, n) => {
        const label = String(n.data('label') || '');
        return Math.max(max, label.length);
    }, 0);
    const labelFactor = Math.max(0, largestLabelLen - 14);
    const fontFactor = Math.max(12, settings.fontSize);
    const baseNodeFactor = Math.max(40, settings.nodeSize * 4.2);
    const gapX = Math.max(baseNodeFactor, Math.min(210, 44 + fontFactor * 2 + labelFactor * 1.9));
    const gapY = Math.max(52, Math.min(190, 34 + fontFactor * 1.8 + labelFactor * 1.5));
    const startX = centerX - ((cols - 1) * gapX) / 2;
    const startY = centerY - ((rows - 1) * gapY) / 2;

    nodes.forEach((node, index) => {
        const row = Math.floor(index / cols);
        const colInRow = index % cols;
        const col = row % 2 === 0 ? colInRow : (cols - 1 - colInRow);
        node.position({
            x: startX + col * gapX,
            y: startY + row * gapY,
        });
    });
};

const bentoSlotsForCount = (count: number): BentoSlot[] => {
    if (count <= 1) return [{ col: 0, row: 0, colSpan: 1, rowSpan: 1 }];
    if (count === 2) {
        return [
            { col: 0, row: 0, colSpan: 2, rowSpan: 1 },
            { col: 0, row: 1, colSpan: 2, rowSpan: 1 },
        ];
    }
    if (count === 3) {
        return [
            { col: 0, row: 0, colSpan: 1, rowSpan: 2 },
            { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
            { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
        ];
    }

    const base: BentoSlot[] = [
        { col: 1, row: 1, colSpan: 2, rowSpan: 1 }, // center wide hero
        { col: 0, row: 0, colSpan: 1, rowSpan: 2 }, // left tall
        { col: 3, row: 0, colSpan: 1, rowSpan: 2 }, // right tall
        { col: 1, row: 0, colSpan: 1, rowSpan: 1 }, // top small
        { col: 2, row: 0, colSpan: 1, rowSpan: 1 }, // top small
        { col: 0, row: 2, colSpan: 1, rowSpan: 1 }, // bottom small
        { col: 1, row: 2, colSpan: 1, rowSpan: 1 }, // bottom small
        { col: 2, row: 2, colSpan: 1, rowSpan: 1 }, // bottom small
        { col: 3, row: 2, colSpan: 1, rowSpan: 1 }, // bottom small
        { col: 3, row: 1, colSpan: 1, rowSpan: 1 }, // right middle
    ];

    if (count <= base.length) {
        return base.slice(0, count);
    }

    const extended = [...base];
    let row = 3;
    while (extended.length < count) {
        for (let col = 0; col < 4 && extended.length < count; col++) {
            extended.push({ col, row, colSpan: 1, rowSpan: 1 });
        }
        row += 1;
    }
    return extended;
};

const resolveSubdomainOverlaps = (
    cy: cytoscape.Core,
    domain: string,
    subdomains: string[],
    minGap: number,
) => {
    for (let iter = 0; iter < 20; iter++) {
        let moved = false;
        for (let i = 0; i < subdomains.length; i++) {
            for (let j = i + 1; j < subdomains.length; j++) {
                const a = subdomains[i];
                const b = subdomains[j];
                const aBounds = subdomainBounds(cy, domain, a);
                const bBounds = subdomainBounds(cy, domain, b);
                if (!aBounds || !bBounds) continue;

                const overlapX = Math.min(aBounds.x2, bBounds.x2) - Math.max(aBounds.x1, bBounds.x1);
                const overlapY = Math.min(aBounds.y2, bBounds.y2) - Math.max(aBounds.y1, bBounds.y1);
                if (overlapX <= -minGap || overlapY <= -minGap) continue;

                const neededX = overlapX + minGap;
                const neededY = overlapY + minGap;
                const pushAlongX = neededX < neededY;
                const dirX = aBounds.cx <= bBounds.cx ? 1 : -1;
                const dirY = aBounds.cy <= bBounds.cy ? 1 : -1;

                const dx = pushAlongX ? dirX * neededX * 0.5 : 0;
                const dy = pushAlongX ? 0 : dirY * neededY * 0.5;
                translateSubdomain(cy, domain, a, -dx, -dy);
                translateSubdomain(cy, domain, b, dx, dy);
                moved = true;
            }
        }
        if (!moved) break;
    }
};

const arrangeSubdomainsAsBento = (
    cy: cytoscape.Core,
    settings: import('@/lib/types').GraphSettings,
) => {
    const domains = Array.from(new Set(
        cy.nodes(':childless')
            .map((n) => String(n.data('domain') || ''))
            .filter(Boolean)
    ));

    domains.forEach((domain) => {
        const subdomains = Array.from(new Set(
            cy.nodes(`[domain = "${domain}"]`)
                .filter((n) => !n.data('isParent'))
                .map((n) => String(n.data('subdomain') || ''))
                .filter(Boolean)
        )).sort();

        if (subdomains.length < 2) return;

        // Compact each subdomain's nodes first so tiles stay dense and readable.
        subdomains.forEach((subdomain) => compactNodesInSubdomain(cy, domain, subdomain, settings));

        const center = domainCentroid(cy, domain);
        if (!center) return;

        const boundsBySub = new Map<string, DomainBounds>();
        let maxWidth = 0;
        let maxHeight = 0;
        const nodeCountBySub = new Map<string, number>();

        subdomains.forEach((subdomain) => {
            const bb = subdomainBounds(cy, domain, subdomain);
            if (!bb) return;
            boundsBySub.set(subdomain, bb);
            maxWidth = Math.max(maxWidth, bb.width);
            maxHeight = Math.max(maxHeight, bb.height);
            nodeCountBySub.set(subdomain, subdomainNodeCollection(cy, domain, subdomain).length);
        });

        if (boundsBySub.size < 2) return;

        const rankedSubdomains = [...subdomains].sort((a, b) => {
            const na = nodeCountBySub.get(a) || 0;
            const nb = nodeCountBySub.get(b) || 0;
            if (nb !== na) return nb - na;
            return a.localeCompare(b);
        });

        const slots = bentoSlotsForCount(rankedSubdomains.length);
        const usedCols = Math.max(...slots.map((slot) => slot.col + slot.colSpan));
        const usedRows = Math.max(...slots.map((slot) => slot.row + slot.rowSpan));

        const unitW = Math.max(172, Math.round(maxWidth * 1.12));
        const unitH = Math.max(146, Math.round(maxHeight * 1.1));
        const gapX = 26;
        const gapY = 22;
        const totalW = usedCols * unitW + (usedCols - 1) * gapX;
        const totalH = usedRows * unitH + (usedRows - 1) * gapY;
        const startX = center.x - totalW / 2;
        const startY = center.y - totalH / 2;

        rankedSubdomains.forEach((subdomain, idx) => {
            const bb = boundsBySub.get(subdomain);
            if (!bb) return;
            const slot = slots[idx];
            const left = startX + slot.col * (unitW + gapX);
            const top = startY + slot.row * (unitH + gapY);
            const slotW = slot.colSpan * unitW + (slot.colSpan - 1) * gapX;
            const slotH = slot.rowSpan * unitH + (slot.rowSpan - 1) * gapY;
            const targetX = left + slotW / 2;
            const targetY = top + slotH / 2;
            translateSubdomain(cy, domain, subdomain, targetX - bb.cx, targetY - bb.cy);
        });

        resolveSubdomainOverlaps(cy, domain, rankedSubdomains, 18);
        const recentered = domainCentroid(cy, domain);
        if (recentered) {
            translateDomain(cy, domain, center.x - recentered.x, center.y - recentered.y);
        }
    });
};

const arrangeDomainsAroundNeuro = (
    cy: cytoscape.Core,
    groupByDomain: boolean,
    settings: import('@/lib/types').GraphSettings,
) => {
    if (!groupByDomain) return;
    arrangeSubdomainsAsBento(cy, settings);

    const neuroInitial = domainBounds(cy, 'neuro');
    if (!neuroInitial) return;

    const extent = cy.extent();
    const canvasCenter = {
        x: (extent.x1 + extent.x2) / 2,
        y: (extent.y1 + extent.y2) / 2,
    };

    const neuroDx = canvasCenter.x - neuroInitial.cx;
    const neuroDy = canvasCenter.y - neuroInitial.cy;
    translateDomain(cy, 'neuro', neuroDx, neuroDy);

    const neuro = domainBounds(cy, 'neuro');
    if (!neuro) return;
    const pulm = domainBounds(cy, 'pulm');
    const renal = domainBounds(cy, 'renal');
    const acidbase = domainBounds(cy, 'acidbase');
    const cardio = domainBounds(cy, 'cardio');
    const gap = 90;

    const targetCenters: Record<string, { x: number; y: number }> = {
        pulm: {
            x: neuro.cx - (neuro.width / 2 + (pulm?.width || 0) / 2 + gap),
            y: neuro.cy,
        },
        renal: {
            x: neuro.cx + (neuro.width / 2 + (renal?.width || 0) / 2 + gap),
            y: neuro.cy,
        },
        acidbase: {
            x: neuro.cx,
            y: neuro.cy - (neuro.height / 2 + (acidbase?.height || 0) / 2 + gap),
        },
        cardio: {
            x: neuro.cx,
            y: neuro.cy + (neuro.height / 2 + (cardio?.height || 0) / 2 + gap),
        },
    };

    Object.entries(targetCenters).forEach(([domain, target]) => {
        const centroid = domainCentroid(cy, domain);
        if (!centroid) return;
        translateDomain(cy, domain, target.x - centroid.x, target.y - centroid.y);
    });

    resolveDomainOverlaps(cy, ['neuro', 'pulm', 'renal', 'acidbase', 'cardio'], 'neuro', 36);
};

const GraphView = forwardRef<GraphViewRef, GraphViewProps>(({ nodes, edges, affectedNodes, perturbations, selectedNodeId, highlightedPath, onNodeClick, dimUnaffected, settings }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const pulseIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const pathAnimationRef = useRef<NodeJS.Timeout | null>(null);
    const clampedFontSize = Math.max(16, Math.min(42, settings.fontSize));
    const nodeTextMaxWidth = Math.max(120, Math.min(280, Math.round(clampedFontSize * 6.5)));
    const domainLabelSize = Math.max(20, Math.min(36, Math.round(clampedFontSize * 1.35)));
    const subdomainLabelSize = Math.max(16, Math.min(28, Math.round(clampedFontSize * 1.1)));
    const domainPadding = Math.max(14, Math.round(settings.nodeSize * 1.6));
    const subdomainPadding = Math.max(6, Math.round(settings.nodeSize * 0.7));

    const blendHex = (a: string, b: string, t: number): string => {
        const norm = Math.max(0, Math.min(1, t));
        const hexToRgb = (hex: string) => {
            const clean = hex.replace('#', '');
            const int = parseInt(clean, 16);
            return {
                r: (int >> 16) & 255,
                g: (int >> 8) & 255,
                b: int & 255,
            };
        };
        const c1 = hexToRgb(a);
        const c2 = hexToRgb(b);
        const r = Math.round(c1.r + (c2.r - c1.r) * norm);
        const g = Math.round(c1.g + (c2.g - c1.g) * norm);
        const bVal = Math.round(c1.b + (c2.b - c1.b) * norm);
        return `rgb(${r}, ${g}, ${bVal})`;
    };

    useImperativeHandle(ref, () => ({
        fit: () => {
            cyRef.current?.fit();
        },
        runLayout: () => {
            if (!cyRef.current) return;
            runLayout(cyRef.current, settings);
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
            const initialElements = nodes.length > 0 ? buildGraphElements(nodes, edges, settings.groupByDomain) : [];

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
                                const domain = ele.data('domain');
                                return DOMAIN_COLORS[domain] || '#cbd5e1';
                            },
                            'border-width': 1,
                            'border-style': 'dashed',
                            'border-color': (ele: any) => {
                                const domain = ele.data('domain');
                                return DOMAIN_COLORS[domain] || '#cbd5e1';
                            },
                            'label': 'data(label)',
                            'font-size': '12px',
                            'font-weight': 'bold',
                            'text-valign': 'top',
                            'text-halign': 'center',
                            'text-margin-y': -10,
                            'color': (ele: any) => {
                                const domain = ele.data('domain');
                                return DOMAIN_COLORS[domain] || '#475569';
                            },
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
                    },
                    {
                        selector: 'node.path-node',
                        style: {
                            'border-width': 4,
                            'border-color': '#f59e0b',
                            'opacity': 1,
                            'font-weight': 'bold',
                            'color': '#0f172a',
                        }
                    },
                    {
                        selector: 'node.path-source',
                        style: {
                            'border-color': '#0ea5e9',
                        }
                    },
                    {
                        selector: 'node.path-target',
                        style: {
                            'border-color': '#a855f7',
                        }
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
                        style: {
                            'opacity': 0.08,
                        }
                    }
                ],
                layout: { name: 'preset' }
            });

            cyRef.current.on('tap', 'node', (evt) => {
                onNodeClick(evt.target.id());
            });

            runLayout(cyRef.current, settings);
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
            const elements = buildGraphElements(nodes, edges, settings.groupByDomain);
            cy.json({ elements });
            runLayout(cy, settings);
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

        cy.nodes().removeClass('path-node path-source path-target');
        cy.edges().removeClass('path-edge path-muted-edge');
        cy.edges().removeData('pathOrder');
        cy.edges().removeStyle('line-color target-arrow-color width opacity line-style line-dash-pattern line-dash-offset');

        if (pathAnimationRef.current) {
            clearInterval(pathAnimationRef.current);
            pathAnimationRef.current = null;
        }

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
                    const lineColor = blendHex(baseLineColor, '#ffffff', pulse * 0.7);
                    const arrowColor = blendHex(baseArrowColor, '#fef9c3', pulse * 0.6);
                    const dashOffset = -((head * 36) - (order * 10));
                    edge.style({
                        'line-color': lineColor as any,
                        'target-arrow-color': arrowColor as any,
                        'line-style': 'dashed',
                        'line-dash-pattern': [14, 12] as any,
                        'line-dash-offset': dashOffset as any,
                        'width': Math.max(3.5, settings.linkThickness * (2.1 + pulse * 1.2)),
                        'opacity': 0.72 + (pulse * 0.28),
                    });
                });
            }, 50);
        }

        // Update Cytoscape Stylesheet Reactively (only childless / data nodes)
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

    useEffect(() => {
        return () => {
            if (pathAnimationRef.current) {
                clearInterval(pathAnimationRef.current);
            }
        };
    }, []);

    return <div ref={containerRef} className="w-full h-full bg-[#f8fafc]" />;
});

GraphView.displayName = 'GraphView';

export default GraphView;
