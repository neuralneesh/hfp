"use client";

import React, { useState } from "react";
import { ComparedNode, Node as GNode } from "@/lib/types";
import { ChevronDown, ChevronUp, Shuffle } from "lucide-react";
import { motion, useDragControls } from "framer-motion";

interface ComparisonSummaryProps {
  changedNodes: ComparedNode[];
  nodes: GNode[];
}

const CHANGE_LABELS: Record<ComparedNode["change_type"], string> = {
  new: "New effect",
  resolved: "Resolved effect",
  direction_flip: "Direction flip",
  strengthened: "Strengthened",
  weakened: "Weakened",
  unchanged: "Unchanged",
};

const ComparisonSummary: React.FC<ComparisonSummaryProps> = ({ changedNodes, nodes }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const dragControls = useDragControls();

  if (!changedNodes.length) return null;

  return (
    <motion.div
      drag
      dragControls={dragControls}
      dragListener={false}
      dragMomentum={false}
      className="absolute top-6 left-6 w-80 max-h-[55vh] bg-white/95 backdrop-blur border shadow-xl rounded-xl z-20 overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div
        className="p-3 border-b bg-slate-50 flex items-center gap-2 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => dragControls.start(e)}
      >
        <Shuffle className="w-4 h-4 text-slate-600" />
        <div className="flex-1">
          <h3 className="text-xs font-bold text-slate-800">Baseline Comparison</h3>
          <p className="text-[10px] text-slate-500">Context only vs context + perturbations</p>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsMinimized((v) => !v);
          }}
          className="cursor-pointer p-1 rounded hover:bg-slate-200/70 text-slate-500"
          aria-label={isMinimized ? "Expand baseline comparison" : "Minimize baseline comparison"}
          title={isMinimized ? "Expand" : "Minimize"}
        >
          {isMinimized ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>
      {!isMinimized && (
        <div className="p-3 space-y-2 overflow-y-auto max-h-[45vh]">
          {changedNodes.slice(0, 12).map((item) => {
            const label = nodes.find((n) => n.id === item.node_id)?.label || item.node_id;
            return (
              <div key={item.node_id} className="rounded-lg border border-slate-200 p-2.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800 truncate">{label}</p>
                  <span className="text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
                    {CHANGE_LABELS[item.change_type]}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-mono truncate">{item.node_id}</p>
                <p className="text-[10px] text-slate-600">
                  {item.baseline_direction || "none"} -> {item.intervention_direction || "none"} | delta {Math.round(item.confidence_delta * 100)}%
                </p>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

export default ComparisonSummary;
