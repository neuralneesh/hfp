/**
 * cytoscape-utils.ts
 *
 * Pure (non-React) helpers for building graph elements, computing layouts, and
 * orchestrating domain/subdomain positioning in Cytoscape.
 *
 * Keeping these functions here (rather than inside GraphView) means:
 *  - They can be unit-tested without mounting a React component.
 *  - GraphView stays focused on React lifecycle and event wiring.
 *  - Layout logic can be reused or extended in isolation.
 */

import cytoscape from 'cytoscape';
import type { Node as GNode, Edge as GEdge, GraphSettings } from './types';
import { DOMAIN_HEX_COLORS } from './constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DomainBounds {
    x1: number;
    x2: number;
    y1: number;
    y2: number;
    cx: number;
    cy: number;
    width: number;
    height: number;
}

export interface BentoSlot {
    col: number;
    row: number;
    colSpan: number;
    rowSpan: number;
}

// ---------------------------------------------------------------------------
// Graph element construction
// ---------------------------------------------------------------------------

/**
 * Converts graph data into the Cytoscape element format.
 * When groupByDomain is true, compound (parent) nodes are created for each
 * domain and subdomain so nodes render inside labelled bounding boxes.
 */
export const buildGraphElements = (nodes: GNode[], edges: GEdge[], groupByDomain: boolean) => {
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
            const [domain, subdomain] = key.split('::');
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

// ---------------------------------------------------------------------------
// Layout options
// ---------------------------------------------------------------------------

// Constellation (non-grouped) layout: spacious, Obsidian-like feel.
const FCOSE_CONSTELLATION_OPTIONS = {
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    animate: true,
    animationDuration: 1000,
    fit: true,
    padding: 100,
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    nodeRepulsion: 450000,
    idealEdgeLength: 400,
    sampleSize: 100,
    edgeElasticity: 0.1,
    nestingFactor: 0.1,
    gravity: 0.1,
    gravityRange: 0,
    gravityCompound: 0,
    numIter: 5000,
    tilingPaddingVertical: 200,
    tilingPaddingHorizontal: 200,
    initialEnergyOnIncremental: 1.0,
};

/**
 * Returns fcose layout options appropriate for the current settings.
 * Grouped mode uses tighter parameters so domain bounding boxes stay compact;
 * constellation mode uses the spacious defaults above.
 */
export const getLayoutOptions = (settings: GraphSettings): object => {
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
        ...FCOSE_CONSTELLATION_OPTIONS,
        nodeRepulsion: settings.nodeRepulsion,
        idealEdgeLength: settings.idealEdgeLength,
    };
};

// ---------------------------------------------------------------------------
// Domain / subdomain geometry helpers
// ---------------------------------------------------------------------------

/** Returns the average position (centroid) of all leaf nodes in a domain. */
export const domainCentroid = (cy: cytoscape.Core, domain: string) => {
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

/** Shifts all leaf nodes in a domain by (dx, dy). */
export const translateDomain = (cy: cytoscape.Core, domain: string, dx: number, dy: number) => {
    cy.nodes(`[domain = "${domain}"]`)
        .filter((n) => !n.data('isParent'))
        .forEach((node) => {
            const pos = node.position();
            node.position({ x: pos.x + dx, y: pos.y + dy });
        });
};

/** Returns the Cytoscape collection of leaf nodes in a specific subdomain. */
export const subdomainNodeCollection = (cy: cytoscape.Core, domain: string, subdomain: string) =>
    cy.nodes(`[domain = "${domain}"][subdomain = "${subdomain}"]`).filter((n) => !n.data('isParent'));

/** Returns the bounding box of a subdomain's leaf nodes, or null if empty. */
export const subdomainBounds = (cy: cytoscape.Core, domain: string, subdomain: string): DomainBounds | null => {
    const nodes = subdomainNodeCollection(cy, domain, subdomain);
    if (nodes.length === 0) return null;
    const bb = nodes.boundingBox({ includeLabels: true, includeOverlays: false });
    return {
        x1: bb.x1, x2: bb.x2,
        y1: bb.y1, y2: bb.y2,
        cx: (bb.x1 + bb.x2) / 2,
        cy: (bb.y1 + bb.y2) / 2,
        width: Math.max(1, bb.w),
        height: Math.max(1, bb.h),
    };
};

/** Shifts all leaf nodes in a subdomain by (dx, dy). */
export const translateSubdomain = (
    cy: cytoscape.Core,
    domain: string,
    subdomain: string,
    dx: number,
    dy: number,
) => {
    subdomainNodeCollection(cy, domain, subdomain).forEach((node) => {
        const pos = node.position();
        node.position({ x: pos.x + dx, y: pos.y + dy });
    });
};

/** Returns the bounding box of all leaf nodes in a domain, or null if empty. */
export const domainBounds = (cy: cytoscape.Core, domain: string): DomainBounds | null => {
    const domainNodes = cy.nodes(`[domain = "${domain}"]`).filter((n) => !n.data('isParent'));
    if (domainNodes.length === 0) return null;
    const bb = domainNodes.boundingBox({ includeLabels: true, includeOverlays: false });
    return {
        x1: bb.x1, x2: bb.x2,
        y1: bb.y1, y2: bb.y2,
        cx: (bb.x1 + bb.x2) / 2,
        cy: (bb.y1 + bb.y2) / 2,
        width: Math.max(1, bb.w),
        height: Math.max(1, bb.h),
    };
};

// ---------------------------------------------------------------------------
// Overlap resolution
// ---------------------------------------------------------------------------

/**
 * Iteratively pushes overlapping domains apart.
 * fixedDomain is treated as an anchor — only the other domain moves when
 * one of the two colliding domains is the fixed one.
 */
export const resolveDomainOverlaps = (
    cy: cytoscape.Core,
    domains: string[],
    fixedDomain: string,
    minGap: number,
) => {
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

/**
 * Iteratively pushes overlapping subdomains (within a single domain) apart.
 * Both sides move equally since there is no fixed subdomain.
 */
export const resolveSubdomainOverlaps = (
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

// ---------------------------------------------------------------------------
// Node compaction inside subdomains
// ---------------------------------------------------------------------------

/**
 * Arranges nodes within a subdomain into a tight grid centered on their
 * current centroid. Spacing adapts to label length and font size.
 */
export const compactNodesInSubdomain = (
    cy: cytoscape.Core,
    domain: string,
    subdomain: string,
    settings: GraphSettings,
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
        // Alternate row direction for a denser snake-grid look
        const col = row % 2 === 0 ? colInRow : (cols - 1 - colInRow);
        node.position({
            x: startX + col * gapX,
            y: startY + row * gapY,
        });
    });
};

// ---------------------------------------------------------------------------
// Bento-box slot layout for subdomain tiles
// ---------------------------------------------------------------------------

/**
 * Returns an array of grid slot descriptors for `count` subdomains.
 * The first few slots form a visually interesting "bento box" arrangement;
 * overflow slots are appended in a regular grid below.
 */
export const bentoSlotsForCount = (count: number): BentoSlot[] => {
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

    if (count <= base.length) return base.slice(0, count);

    // Append overflow rows for unusually dense domains
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

// ---------------------------------------------------------------------------
// Domain arrangement orchestration
// ---------------------------------------------------------------------------

/**
 * Arranges subdomains within each domain into a bento-box grid, then
 * re-centers the domain on its original centroid.
 */
export const arrangeSubdomainsAsBento = (
    cy: cytoscape.Core,
    settings: GraphSettings,
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

        // Compact each subdomain's nodes first so tiles stay dense and readable
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

        // Sort subdomains by node count descending so the densest ones claim
        // the hero slot in the bento layout
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
            translateSubdomain(cy, domain, subdomain, (left + slotW / 2) - bb.cx, (top + slotH / 2) - bb.cy);
        });

        resolveSubdomainOverlaps(cy, domain, rankedSubdomains, 18);

        // Re-center the domain on its original centroid after shuffling tiles
        const recentered = domainCentroid(cy, domain);
        if (recentered) {
            translateDomain(cy, domain, center.x - recentered.x, center.y - recentered.y);
        }
    });
};

/**
 * Top-level layout orchestrator for grouped mode.
 * Places neuro at the canvas center, then positions pulm/renal/acidbase/cardio
 * around it in a compass arrangement, and resolves any remaining overlaps.
 */
export const arrangeDomainsAroundNeuro = (
    cy: cytoscape.Core,
    groupByDomain: boolean,
    settings: GraphSettings,
) => {
    if (!groupByDomain) return;
    arrangeSubdomainsAsBento(cy, settings);

    const neuroInitial = domainBounds(cy, 'neuro');
    if (!neuroInitial) return;

    // Move neuro to canvas center
    const extent = cy.extent();
    const canvasCenter = {
        x: (extent.x1 + extent.x2) / 2,
        y: (extent.y1 + extent.y2) / 2,
    };
    translateDomain(cy, 'neuro', canvasCenter.x - neuroInitial.cx, canvasCenter.y - neuroInitial.cy);

    const neuro = domainBounds(cy, 'neuro');
    if (!neuro) return;

    const pulm = domainBounds(cy, 'pulm');
    const renal = domainBounds(cy, 'renal');
    const acidbase = domainBounds(cy, 'acidbase');
    const cardio = domainBounds(cy, 'cardio');
    const gap = 90;

    // Compass arrangement: pulm=left, renal=right, acidbase=top, cardio=bottom
    const targetCenters: Record<string, { x: number; y: number }> = {
        pulm:     { x: neuro.cx - (neuro.width / 2 + (pulm?.width || 0) / 2 + gap),     y: neuro.cy },
        renal:    { x: neuro.cx + (neuro.width / 2 + (renal?.width || 0) / 2 + gap),    y: neuro.cy },
        acidbase: { x: neuro.cx, y: neuro.cy - (neuro.height / 2 + (acidbase?.height || 0) / 2 + gap) },
        cardio:   { x: neuro.cx, y: neuro.cy + (neuro.height / 2 + (cardio?.height || 0) / 2 + gap) },
    };

    Object.entries(targetCenters).forEach(([domain, target]) => {
        const centroid = domainCentroid(cy, domain);
        if (!centroid) return;
        translateDomain(cy, domain, target.x - centroid.x, target.y - centroid.y);
    });

    resolveDomainOverlaps(cy, ['neuro', 'pulm', 'renal', 'acidbase', 'cardio'], 'neuro', 36);
};

// ---------------------------------------------------------------------------
// Layout runner
// ---------------------------------------------------------------------------

/**
 * Runs the fcose layout, then applies domain arrangement post-processing
 * once the layout animation completes.
 */
export const runCytoscapeLayout = (
    cy: cytoscape.Core,
    settings: GraphSettings,
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

// ---------------------------------------------------------------------------
// Animation utilities
// ---------------------------------------------------------------------------

/**
 * Linearly interpolates between two hex colors.
 * t=0 returns color `a`; t=1 returns color `b`.
 * Used for the animated path highlight effect.
 */
export const blendHex = (a: string, b: string, t: number): string => {
    const norm = Math.max(0, Math.min(1, t));
    const hexToRgb = (hex: string) => {
        const clean = hex.replace('#', '');
        const int = parseInt(clean, 16);
        return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
    };
    const c1 = hexToRgb(a);
    const c2 = hexToRgb(b);
    return `rgb(${Math.round(c1.r + (c2.r - c1.r) * norm)}, ${Math.round(c1.g + (c2.g - c1.g) * norm)}, ${Math.round(c1.b + (c2.b - c1.b) * norm)})`;
};

// Re-export domain colors so cytoscape stylesheet code can reference a single source of truth
export { DOMAIN_HEX_COLORS };
