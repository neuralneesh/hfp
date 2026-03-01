"use client";

import React from 'react';
import { Domain, Node as GNode } from '@/lib/types';
import { DOMAIN_BG_CLASSES } from '@/lib/constants';
import { Search, Pin, Shield } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: Array<string | false | null | undefined>) {
    return twMerge(inputs.filter(Boolean).join(' '));
}

interface SidebarProps {
    nodes: GNode[];
    selectedDomain: Domain | 'all';
    setSelectedDomain: (domain: Domain | 'all') => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    pinnedNodes: string[];
    togglePin: (nodeId: string) => void;
    onNodeClick: (nodeId: string) => void;
    domainCounts: Record<string, number>;
}


const Sidebar: React.FC<SidebarProps> = ({
    nodes,
    selectedDomain,
    setSelectedDomain,
    searchQuery,
    setSearchQuery,
    pinnedNodes,
    togglePin,
    onNodeClick,
    domainCounts,
}) => {
    const filteredNodesBySearch = nodes.filter(node =>
        node.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        node.aliases.some(a => a.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="w-80 h-full border-r bg-white/95 backdrop-blur flex flex-col overflow-hidden shadow-xl">
            <div className="p-4 border-b">
                <h1 className="text-xl font-bold text-slate-800">HFP</h1>
                <p className="text-xs text-slate-500">Human Framework Project</p>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                {/* Domain Filters */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Domains</label>
                    <div className="grid grid-cols-1 gap-1">
                        <button
                            onClick={() => setSelectedDomain('all')}
                            className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                                selectedDomain === 'all' ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
                            )}
                        >
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4" />
                                <span>All Domains</span>
                            </div>
                            <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded-full">{nodes.length}</span>
                        </button>

                        {(['cardio', 'renal', 'pulm', 'acidbase'] as Domain[]).map(domain => (
                            <button
                                key={domain}
                                onClick={() => setSelectedDomain(domain)}
                                className={cn(
                                    "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                                    selectedDomain === domain ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50"
                                )}
                            >
                                <div className="flex items-center gap-2 text-slate-700">
                                    <div className={cn("w-2 h-2 rounded-full", DOMAIN_BG_CLASSES[domain])} />
                                    {domain.charAt(0).toUpperCase() + domain.slice(1)}
                                </div>
                                {domainCounts[domain] > 0 && (
                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">+{domainCounts[domain]}</span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Search</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Label, ID, or Alias..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Pinned Nodes */}
                {pinnedNodes.length > 0 && (
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pinned</label>
                        <div className="space-y-1">
                            {pinnedNodes.map(id => {
                                const node = nodes.find(n => n.id === id);
                                if (!node) return null;
                                return (
                                    <div
                                        key={id}
                                        className="flex items-center justify-between px-3 py-2 rounded-md text-sm bg-blue-50 text-blue-800 cursor-pointer hover:bg-blue-100"
                                        onClick={() => onNodeClick(id)}
                                    >
                                        <span>{node.label}</span>
                                        <button onClick={(e) => { e.stopPropagation(); togglePin(id); }}>
                                            <Pin className="w-3 h-3 rotate-45" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Search Results */}
                {searchQuery && (
                    <div className="space-y-2 pt-2">
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Results</label>
                        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
                            {filteredNodesBySearch.slice(0, 10).map(node => (
                                <div
                                    key={node.id}
                                    className="px-3 py-2 rounded-md text-sm hover:bg-slate-50 border border-transparent hover:border-slate-200 cursor-pointer transition-all"
                                    onClick={() => onNodeClick(node.id)}
                                >
                                    <div className="font-medium text-slate-900">{node.label}</div>
                                    <div className="text-[10px] text-slate-500 uppercase">{node.domain}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;
