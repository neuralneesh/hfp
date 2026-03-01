import type { GraphSettings, SimulationOptions } from './types';

// Domain color map used by Cytoscape (hex values required for the style API).
// Add new domains here; GraphView and cytoscape-utils will pick them up automatically.
export const DOMAIN_HEX_COLORS: Record<string, string> = {
    cardio: '#ef4444',   // red-500
    pulm: '#3b82f6',     // blue-500
    renal: '#10b981',    // emerald-500
    acidbase: '#f59e0b', // amber-500
    neuro: '#8b5cf6',    // violet-500
};

// Domain color map used by Tailwind className strings (sidebar badges, domain dots, etc.).
// Must stay in sync with DOMAIN_HEX_COLORS above.
export const DOMAIN_BG_CLASSES: Record<string, string> = {
    cardio: 'bg-red-500',
    renal: 'bg-emerald-500',
    pulm: 'bg-blue-500',
    acidbase: 'bg-amber-500',
    neuro: 'bg-violet-500',
};

// Clinical contexts shown in the ControlPanel.
// To add a new context: append an entry here — no component edits needed.
export const CLINICAL_CONTEXTS = [
    { id: 'ace_inhibitor', label: 'ACE Inhibitor' },
    { id: 'beta_blocker', label: 'Beta Blocker' },
    { id: 'heart_failure', label: 'Heart Failure' },
    { id: 'dehydration', label: 'Dehydration' },
    { id: 'ckd', label: 'Chronic Kidney Disease' },
    { id: 'copd', label: 'COPD' },
] as const;

export const DEFAULT_SIMULATION_OPTIONS: SimulationOptions = {
    max_hops: 8,
    min_confidence: 0.1,
    time_window: 'all',
    dim_unaffected: true,
};

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
    nodeSize: 10,
    fontSize: 12,
    linkThickness: 1.5,
    nodeRepulsion: 450000,
    idealEdgeLength: 50,
    showArrows: true,
    groupByDomain: true,
    textFadeThreshold: 0.9,
};
