"use client";

import type { CSSProperties, ReactNode } from "react";

export type SectionMode = "edit" | "ai";
export type ActiveSection = { key: string; mode: SectionMode } | null;

type Props = {
  sectionKey: string;
  title?: string;
  /** Heading style from the CV layout (colour, size). */
  titleStyle?: CSSProperties;
  active: ActiveSection;
  setActive: (a: ActiveSection) => void;
  /** Hide the AI button for sections that must stay factual (education, certifications). */
  aiEnabled?: boolean;
  renderEdit: (close: () => void) => ReactNode;
  renderAi?: (close: () => void) => ReactNode;
  children: ReactNode;
};

export function SectionShell({
  sectionKey,
  title,
  titleStyle,
  active,
  setActive,
  aiEnabled = true,
  renderEdit,
  renderAi,
  children,
}: Props) {
  const mode = active?.key === sectionKey ? active.mode : null;
  const close = () => setActive(null);
  const toggle = (m: SectionMode) => setActive(mode === m ? null : { key: sectionKey, mode: m });

  return (
    <div
      className={`group/section relative -mx-3 rounded-md px-3 py-1 transition-colors ${
        mode ? "bg-indigo-50/60 ring-1 ring-indigo-200" : "hover:bg-slate-50"
      }`}
    >
      <div
        className={`absolute -top-3 right-2 z-10 flex gap-1 rounded-md border border-slate-200 bg-white p-0.5 shadow-sm transition-opacity print:hidden ${
          mode ? "opacity-100" : "opacity-0 group-hover/section:opacity-100 focus-within:opacity-100"
        }`}
      >
        <ToolbarButton active={mode === "edit"} onClick={() => toggle("edit")}>
          ✎ Edit
        </ToolbarButton>
        {aiEnabled && renderAi && (
          <ToolbarButton active={mode === "ai"} onClick={() => toggle("ai")}>
            ✨ AI suggest
          </ToolbarButton>
        )}
      </div>

      {title && (
        <h2 className="mt-3 mb-1 border-b border-slate-300 pb-0.5 font-bold text-slate-900" style={titleStyle}>
          {title.toUpperCase()}
        </h2>
      )}

      {mode === "edit" ? renderEdit(close) : children}
      {mode === "ai" && renderAi?.(close)}
    </div>
  );
}

function ToolbarButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[11px] font-medium ${
        active ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}
