"use client";

import React from 'react';
import { TraceStep, Node as GNode } from '@/lib/types';
import { ChevronRight, GitMerge, Info } from 'lucide-react';

interface TraceViewerProps {
    nodeId: string;
    nodeLabel: string;
    traces: TraceStep[];
}

import { motion } from 'framer-motion';

const TraceViewer: React.FC<TraceViewerProps> = ({ nodeId, nodeLabel, traces }) => {
    if (!traces || traces.length === 0) return null;

    return (
        <motion.div
            drag
            dragMomentum={false}
            className="absolute top-6 right-[340px] w-96 max-h-[70vh] bg-white/95 backdrop-blur border shadow-xl rounded-xl flex flex-col z-10 overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
        >
            {/* Drag Handle */}
            <div className="flex items-center gap-2 p-4 cursor-grab active:cursor-grabbing border-b bg-slate-50/50">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">
                    <GitMerge className="w-4 h-4" />
                </div>
                <div className="flex-1">
                    <h3 className="text-xs font-bold text-slate-800">Causal Traces</h3>
                    <p className="text-[10px] text-slate-500">How {nodeLabel} was affected</p>
                </div>
                <div className="w-4 h-1 rounded-full bg-slate-200" />
            </div>

            <div className="p-4 overflow-y-auto">
                <div className="space-y-6">
                    {traces.map((trace, i) => (
                        <div key={i} className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase font-bold text-slate-400">Path {i + 1}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono">
                                    conf: {Math.round(trace.confidence * 100)}%
                                </span>
                            </div>

                            <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-100">
                                {trace.steps.map((step, si) => (
                                    <div key={si} className="flex gap-4 pl-6 relative">
                                        <div className="absolute left-1 top-1.5 w-2 h-2 rounded-full bg-slate-300 border-2 border-white ring-1 ring-slate-100" />
                                        <div className="text-xs text-slate-600 leading-relaxed">
                                            {step.split('→').map((part, pi) => (
                                                <span key={pi}>
                                                    {pi > 0 && <span className="mx-2 text-slate-300">→</span>}
                                                    {part}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-4 pt-4 border-t flex gap-2 items-start opacity-60">
                    <Info className="w-3 h-3 text-slate-400 mt-0.5" />
                    <p className="text-[9px] text-slate-500 leading-normal">
                        Traces show logical propagation through the HumanGraph. Weights and confidence scores are qualitative and represent certainty of direction.
                    </p>
                </div>
            </div>
        </motion.div>
    );
};

export default TraceViewer;
