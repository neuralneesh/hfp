"use client";

import React from 'react';
import { Node as GNode, Perturbation, SimulationOptions } from '@/lib/types';
import { Play, RotateCcw, Settings, Beaker, MapPin } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: Array<string | false | null | undefined>) {
    return twMerge(inputs.filter(Boolean).join(' '));
}

interface ControlPanelProps {
    selectedNode: GNode | null;
    onSimulate: () => void;
    onReset: () => void;
    perturbations: Perturbation[];
    setPerturbations: (p: Perturbation[]) => void;
    options: SimulationOptions;
    setOptions: (o: SimulationOptions) => void;
    context: Record<string, boolean>;
    setContext: (c: Record<string, boolean>) => void;
    isSimulating: boolean;
    canSimulate: boolean;
}

const CONTEXT_OPTIONS = [
    { id: 'ace_inhibitor', label: 'ACE Inhibitor' },
    { id: 'beta_blocker', label: 'Beta Blocker' },
    { id: 'heart_failure', label: 'Heart Failure' },
    { id: 'dehydration', label: 'Dehydration' },
    { id: 'ckd', label: 'Chronic Kidney Disease' },
    { id: 'copd', label: 'COPD' },
];

const ControlPanel: React.FC<ControlPanelProps> = ({
    selectedNode,
    onSimulate,
    onReset,
    perturbations,
    setPerturbations,
    options,
    setOptions,
    context,
    setContext,
    isSimulating,
    canSimulate,
}) => {
    const addPerturbation = (op: "increase" | "decrease" | "block") => {
        if (!selectedNode) return;
        const newPerturbations = [
            ...perturbations.filter(p => p.node_id !== selectedNode.id),
            { node_id: selectedNode.id, op }
        ];
        setPerturbations(newPerturbations);
    };

    const removePerturbation = (nodeId: string) => {
        setPerturbations(perturbations.filter(p => p.node_id !== nodeId));
    };

    return (
        <div className="w-80 h-full border-l bg-white flex flex-col overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Simulation Control
                </h2>
                <button
                    onClick={onReset}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600 transition-colors"
                    title="Reset Simulation"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* Selected Node Controls */}
                <section className="space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        Selected Node
                    </h3>
                    {selectedNode ? (
                        <div className="space-y-3 p-3 bg-slate-50 rounded-lg border">
                            <div>
                                <div className="font-bold text-slate-900 leading-tight">{selectedNode.label}</div>
                                <div className="text-[10px] text-slate-500 font-mono mt-1">{selectedNode.id}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-4">
                                <button
                                    onClick={() => addPerturbation('increase')}
                                    className="flex flex-col items-center justify-center p-2 rounded bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors"
                                >
                                    <span className="text-xl font-bold">↑</span>
                                    <span className="text-[10px] uppercase font-bold">Increase</span>
                                </button>
                                <button
                                    onClick={() => addPerturbation('decrease')}
                                    className="flex flex-col items-center justify-center p-2 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                                >
                                    <span className="text-xl font-bold">↓</span>
                                    <span className="text-[10px] uppercase font-bold">Decrease</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 border border-dashed rounded-lg text-center text-slate-400 text-xs italic">
                            Select a node in the graph to apply perturbations
                        </div>
                    )}
                </section>

                {/* Active Perturbations */}
                {perturbations.length > 0 && (
                    <section className="space-y-3">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Inputs</h3>
                        <div className="space-y-1">
                            {perturbations.map(p => (
                                <div key={p.node_id} className="flex items-center justify-between p-2 bg-slate-900 text-white rounded text-xs">
                                    <span className="truncate max-w-[120px]">{p.node_id.split('.').pop()}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            "font-bold uppercase text-[9px]",
                                            p.op === 'increase' ? "text-red-400" : (p.op === 'decrease' ? "text-blue-400" : "text-slate-400")
                                        )}>{p.op}</span>
                                        <button onClick={() => removePerturbation(p.node_id)} className="text-slate-500 hover:text-white">✕</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Context Toggles */}
                <section className="space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Beaker className="w-3 h-3" />
                        Clinical Context
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                        {CONTEXT_OPTIONS.map(opt => (
                            <label key={opt.id} className="flex items-center justify-between p-2 rounded border hover:bg-slate-50 cursor-pointer">
                                <span className="text-xs text-slate-700">{opt.label}</span>
                                <input
                                    type="checkbox"
                                    checked={!!context[opt.id]}
                                    onChange={(e) => setContext({ ...context, [opt.id]: e.target.checked })}
                                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                            </label>
                        ))}
                    </div>
                </section>

                {/* Options */}
                <section className="space-y-4 pt-2">
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            <span>Max Hops</span>
                            <span className="text-slate-900">{options.max_hops}</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="15"
                            step="1"
                            value={options.max_hops}
                            onChange={(e) => setOptions({ ...options, max_hops: parseInt(e.target.value) })}
                            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time Window</div>
                        <select
                            value={options.time_window}
                            onChange={(e) => setOptions({ ...options, time_window: e.target.value as any })}
                            className="w-full p-2 bg-slate-50 border rounded-md text-xs focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="all">All Timescales</option>
                            <option value="immediate">Immediate</option>
                            <option value="minutes">Minutes</option>
                            <option value="hours">Hours</option>
                            <option value="days">Days</option>
                        </select>
                    </div>

                    <div className="space-y-2">
                        <label className="flex items-center justify-between p-2 rounded border hover:bg-slate-50 cursor-pointer">
                            <span className="text-xs text-slate-700">Dim unaffected nodes</span>
                            <input
                                type="checkbox"
                                checked={options.dim_unaffected}
                                onChange={(e) => setOptions({ ...options, dim_unaffected: e.target.checked })}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                        </label>
                    </div>
                </section>
            </div>

            <div className="p-4 border-t bg-slate-50">
                <button
                    onClick={onSimulate}
                    disabled={isSimulating || !canSimulate}
                    className={cn(
                        "w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95",
                        canSimulate
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-200 text-slate-400 cursor-not-allowed"
                    )}
                >
                    <Play className={cn("w-4 h-4 fill-current", isSimulating && "animate-pulse")} />
                    {isSimulating ? "Simulating..." : "Run Simulation"}
                </button>
                {!canSimulate && (
                    <p className="mt-2 text-[10px] text-slate-500">
                        Add a perturbation or select clinical context to run.
                    </p>
                )}
            </div>
        </div>
    );
};

export default ControlPanel;
