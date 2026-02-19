"use client";

import React from 'react';
import { AffectedNode, Domain, Node as GNode } from '@/lib/types';
import { TrendingUp, TrendingDown, HelpCircle, Activity } from 'lucide-react';

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

    const upCount = affectedNodes.filter(n => n.direction === 'up').length;
    const downCount = affectedNodes.filter(n => n.direction === 'down').length;
    const unknownCount = affectedNodes.filter(n => n.direction === 'unknown').length;

    // Count by domain
    const domainStats: Record<string, number> = {};
    affectedNodes.forEach(an => {
        const node = nodes.find(n => n.id === an.node_id);
        if (node) {
            domainStats[node.domain] = (domainStats[node.domain] || 0) + 1;
        }
    });

    return (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur border shadow-xl rounded-full px-6 py-3 flex items-center gap-8 z-10">
            <div className="flex items-center gap-4 border-r pr-6">
                <div className="flex items-center gap-1.5 text-emerald-600">
                    <TrendingUp className="w-5 h-5" />
                    <span className="font-bold text-lg">{upCount}</span>
                </div>
                <div className="flex items-center gap-1.5 text-red-600">
                    <TrendingDown className="w-5 h-5" />
                    <span className="font-bold text-lg">{downCount}</span>
                </div>
                {unknownCount > 0 && (
                    <div className="flex items-center gap-1.5 text-slate-500">
                        <HelpCircle className="w-5 h-5" />
                        <span className="font-bold text-lg">{unknownCount}</span>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-4">
                {Object.entries(domainStats).map(([domain, count]) => (
                    <div key={domain} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${DOMAIN_COLORS[domain]}`} />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-tighter">{domain}</span>
                        <span className="text-xs text-slate-400">{count}</span>
                    </div>
                ))}
            </div>

            <div className="pl-4 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500 animate-pulse" />
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest whitespace-nowrap">Simulation Active</span>
            </div>
        </div>
    );
};

export default RippleSummary;
