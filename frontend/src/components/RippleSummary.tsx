"use client";

import React from 'react';
import { AffectedNode, Domain, Node as GNode } from '@/lib/types';
import { Activity } from 'lucide-react';

interface RippleSummaryProps {
    affectedNodes: AffectedNode[];
    nodes: GNode[];
}

const DOMAIN_COLORS: Record<string, string> = {
    cardio: 'bg-red-500',
    renal: 'bg-emerald-500',
    pulm: 'bg-blue-500',
    acidbase: 'bg-amber-500',
    neuro: 'bg-violet-500',
};

const RippleSummary: React.FC<RippleSummaryProps> = ({ affectedNodes, nodes }) => {
    if (affectedNodes.length === 0) return null;

    const domainDirectionStats: Record<Domain, { up: number; down: number }> = {
        cardio: { up: 0, down: 0 },
        renal: { up: 0, down: 0 },
        pulm: { up: 0, down: 0 },
        acidbase: { up: 0, down: 0 },
        neuro: { up: 0, down: 0 },
    };
    let changedCount = 0;
    affectedNodes.forEach(an => {
        const node = nodes.find(n => n.id === an.node_id);
        if (!node) return;
        if (an.direction === 'up') {
            domainDirectionStats[node.domain].up += 1;
            changedCount += 1;
        } else if (an.direction === 'down') {
            domainDirectionStats[node.domain].down += 1;
            changedCount += 1;
        }
    });

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur border shadow-xl rounded-2xl px-5 py-3 flex items-center gap-5 z-10">
            <div className="pr-5 border-r border-slate-200">
                <p className="text-[10px] uppercase tracking-widest font-semibold text-slate-500">Changed Variables</p>
                <p className="text-lg font-bold text-slate-800">{changedCount}</p>
            </div>

            <div className="flex items-center gap-3">
                {(Object.entries(domainDirectionStats) as Array<[Domain, { up: number; down: number }]>)
                    .filter(([, counts]) => counts.up > 0 || counts.down > 0)
                    .map(([domain, counts]) => (
                    <div key={domain} className="flex items-center gap-1.5 text-xs">
                        <div className={`w-2 h-2 rounded-full ${DOMAIN_COLORS[domain]}`} />
                        <span className="font-bold text-slate-700 uppercase">{domain}:</span>
                        {counts.up > 0 && <span className="font-semibold text-emerald-600">↑ {counts.up}</span>}
                        {counts.down > 0 && <span className="font-semibold text-red-600">↓ {counts.down}</span>}
                        <span className="text-slate-400">variables</span>
                    </div>
                ))}
            </div>

            <div className="pl-2 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest whitespace-nowrap">Simulation Active</span>
            </div>
        </div>
    );
};

export default RippleSummary;
