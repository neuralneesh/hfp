"use client";

import React from "react";
import { GraphSettings } from "@/lib/types";
import { ChevronDown, Settings2 } from "lucide-react";

interface DisplayMenuProps {
  settings: GraphSettings;
  setSettings: (settings: GraphSettings) => void;
  className?: string;
}

const DisplayMenu: React.FC<DisplayMenuProps> = ({ settings, setSettings, className = "" }) => {
  const [open, setOpen] = React.useState(false);
  const [forcesOpen, setForcesOpen] = React.useState(false);

  const update = <K extends keyof GraphSettings>(key: K, value: GraphSettings[K]) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div className={`absolute top-4 z-40 ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-10 px-3 rounded-lg border bg-white/95 backdrop-blur shadow-md text-slate-700 text-sm font-semibold flex items-center gap-2 hover:bg-white"
      >
        <Settings2 className="w-4 h-4" />
        Display
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-2 w-72 rounded-xl border bg-white/95 backdrop-blur shadow-xl p-3 space-y-3">
          <label className="flex items-center justify-between text-xs text-slate-700">
            <span>Arrows</span>
            <input
              type="checkbox"
              checked={settings.showArrows}
              onChange={(e) => update("showArrows", e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center justify-between text-xs text-slate-700">
            <span>Group by Domain</span>
            <input
              type="checkbox"
              checked={settings.groupByDomain}
              onChange={(e) => update("groupByDomain", e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
          </label>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Node size</span>
              <span>{settings.nodeSize}</span>
            </div>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={settings.nodeSize}
              onChange={(e) => update("nodeSize", parseInt(e.target.value))}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Text size</span>
              <span>{settings.fontSize}px</span>
            </div>
            <input
              type="range"
              min="10"
              max="24"
              step="1"
              value={settings.fontSize}
              onChange={(e) => update("fontSize", parseInt(e.target.value))}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Label zoom threshold</span>
              <span>{settings.textFadeThreshold.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="1.4"
              step="0.05"
              value={settings.textFadeThreshold}
              onChange={(e) => update("textFadeThreshold", parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] text-slate-600">
              <span>Link thickness</span>
              <span>{settings.linkThickness}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={settings.linkThickness}
              onChange={(e) => update("linkThickness", parseFloat(e.target.value))}
              className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>

          <button
            onClick={() => setForcesOpen((v) => !v)}
            className="w-full text-left text-[11px] uppercase tracking-widest text-slate-500 font-semibold"
          >
            Forces {forcesOpen ? "−" : "+"}
          </button>
          {forcesOpen && (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Repel force</span>
                  <span>{Math.round(settings.nodeRepulsion / 1000)}k</span>
                </div>
                <input
                  type="range"
                  min="100000"
                  max="1000000"
                  step="50000"
                  value={settings.nodeRepulsion}
                  onChange={(e) => update("nodeRepulsion", parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Link distance</span>
                  <span>{settings.idealEdgeLength}</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="800"
                  step="50"
                  value={settings.idealEdgeLength}
                  onChange={(e) => update("idealEdgeLength", parseInt(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default DisplayMenu;
