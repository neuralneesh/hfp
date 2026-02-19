export type Domain = "cardio" | "pulm" | "renal" | "acidbase" | "neuro";
export type NodeType = "hormone" | "variable" | "organ" | "vessel" | "process";
export type Direction = "up" | "down" | "unknown" | "unchanged";
export type Timescale = "immediate" | "minutes" | "hours" | "days";

export interface Node {
    id: string;
    label: string;
    domain: Domain;
    type: NodeType;
    state_type: "qualitative" | "numeric";
    unit?: string;
    normal_range?: { min: number; max: number };
    aliases: string[];
    direction: Direction;
    value?: number;
}

export interface Edge {
    source: string;
    target: string;
    rel: "increases" | "decreases" | "converts_to" | "requires";
    weight: number;
    delay: Timescale;
    context: Record<string, boolean>;
    description?: string;
}

export interface Rule {
    id: string;
    when: string;
    then: Record<string, string>;
    description?: string;
}

export interface Perturbation {
    node_id: string;
    op: "increase" | "decrease" | "block" | "set";
    value?: number;
}

export interface SimulationOptions {
    max_hops: number;
    min_confidence: number;
    time_window: Timescale | "all";
    dim_unaffected: boolean;
}

export interface SimulationRequest {
    perturbations: Perturbation[];
    context: Record<string, boolean>;
    options: SimulationOptions;
}

export interface TraceStep {
    path: string[];
    steps: string[];
    confidence: number;
}

export interface AffectedNode {
    node_id: string;
    direction: Direction;
    magnitude: "none" | "small" | "medium" | "large";
    confidence: number;
    timescale: Timescale;
    tick: number;
}

export interface SimulationResponse {
    affected_nodes: AffectedNode[];
    traces: Record<string, TraceStep[]>;
    max_ticks: number;
}

export interface GraphData {
    nodes: Node[];
    edges: Edge[];
    rules: Rule[];
}

export interface GraphSettings {
    nodeSize: number;
    fontSize: number;
    linkThickness: number;
    nodeRepulsion: number;
    idealEdgeLength: number;
    showArrows: boolean;
    groupByDomain: boolean;
    textFadeThreshold: number;
}
