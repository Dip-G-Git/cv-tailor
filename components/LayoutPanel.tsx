"use client";

import type { ReactNode } from "react";
import {
  allSections,
  DEFAULT_LAYOUT,
  DEFAULT_TITLES,
  isHidden,
  type ResolvedLayout,
  resolveLayout,
  withLayout,
} from "@/lib/layout";
import type { TailoredCV } from "@/lib/schemas";
import { Button } from "./ui";

type Props = {
  cv: TailoredCV;
  onChange: (cv: TailoredCV) => void;
  onClose: () => void;
};

const ACCENTS = [
  { name: "Black", value: "#111111" },
  { name: "Navy", value: "#1f3a8a" },
  { name: "Blue", value: "#1d4ed8" },
  { name: "Teal", value: "#0f766e" },
  { name: "Green", value: "#166534" },
  { name: "Burgundy", value: "#7f1d1d" },
  { name: "Purple", value: "#5b21b6" },
  { name: "Slate", value: "#334155" },
];

const FONT_SIZES = [8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14];
const LINE_HEIGHTS = [1, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5, 1.75, 2];

const selectClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900";

export function LayoutPanel({ cv, onChange, onClose }: Props) {
  const layout = resolveLayout(cv.layout);
  const set = (patch: Partial<ResolvedLayout>) => onChange(withLayout(cv, patch));
  const sections = allSections(cv);

  function move(i: number, dir: -1 | 1) {
    const ids = sections.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    set({ sectionOrder: ids });
  }

  function toggleHidden(id: string) {
    const hidden = isHidden(layout, id)
      ? layout.hiddenSections.filter((h) => h.trim().toLowerCase() !== id.toLowerCase())
      : [...layout.hiddenSections, id];
    set({ hiddenSections: hidden });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Layout & formatting</h3>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="!text-xs"
            onClick={() => onChange({ ...cv, layout: { maxPages: layout.maxPages } })}
            title="Reset fonts, spacing, margins, colours and section order (keeps the page limit)"
          >
            Reset to default
          </Button>
          <Button variant="ghost" className="!text-xs" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Ctl label="Page limit">
          <select
            className={selectClass}
            value={layout.maxPages ?? 0}
            onChange={(e) => set({ maxPages: Number(e.target.value) || undefined })}
          >
            <option value={0}>No limit</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} page{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </Ctl>
        <Ctl label="Paper size">
          <select className={selectClass} value={layout.pageSize} onChange={(e) => set({ pageSize: e.target.value as ResolvedLayout["pageSize"] })}>
            <option value="A4">A4</option>
            <option value="Letter">US Letter</option>
          </select>
        </Ctl>
        <Ctl label="Font">
          <select className={selectClass} value={layout.fontFamily} onChange={(e) => set({ fontFamily: e.target.value as ResolvedLayout["fontFamily"] })}>
            <option value="sans">Arial / Helvetica</option>
            <option value="serif">Times New Roman</option>
          </select>
        </Ctl>
        <Ctl label="Font size">
          <select className={selectClass} value={layout.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })}>
            {withCurrent(FONT_SIZES, layout.fontSize).map((n) => (
              <option key={n} value={n}>
                {n} pt{n === DEFAULT_LAYOUT.fontSize ? " (default)" : ""}
              </option>
            ))}
          </select>
        </Ctl>
        <Ctl label="Line spacing">
          <select className={selectClass} value={layout.lineHeight} onChange={(e) => set({ lineHeight: Number(e.target.value) })}>
            {withCurrent(LINE_HEIGHTS, layout.lineHeight).map((n) => (
              <option key={n} value={n}>
                {n}
                {n === DEFAULT_LAYOUT.lineHeight ? " (default)" : ""}
              </option>
            ))}
          </select>
        </Ctl>
        <Ctl label="Margins">
          <select className={selectClass} value={layout.margins} onChange={(e) => set({ margins: e.target.value as ResolvedLayout["margins"] })}>
            <option value="narrow">Narrow (0.5″)</option>
            <option value="normal">Normal (0.75″)</option>
            <option value="wide">Wide (1″)</option>
          </select>
        </Ctl>
        <Ctl label="Header alignment">
          <select className={selectClass} value={layout.headerAlign} onChange={(e) => set({ headerAlign: e.target.value as ResolvedLayout["headerAlign"] })}>
            <option value="center">Centered</option>
            <option value="left">Left</option>
          </select>
        </Ctl>
        <Ctl label="Accent colour (name & headings)">
          <div className="flex flex-wrap gap-1 pt-1">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                title={a.name}
                aria-label={a.name}
                onClick={() => set({ accentColor: a.value })}
                className={`h-5 w-5 rounded-full border-2 ${layout.accentColor.toLowerCase() === a.value ? "border-indigo-500" : "border-white ring-1 ring-slate-300"}`}
                style={{ background: a.value }}
              />
            ))}
          </div>
        </Ctl>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium text-slate-600">Sections (order, visibility, heading)</p>
        <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
          {sections.map((s, i) => {
            const hidden = isHidden(layout, s.id);
            return (
              <li key={`${s.kind}-${s.id}`} className="flex items-center gap-2 px-2 py-1 text-sm">
                <button type="button" className="h-6 w-6 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  ↑
                </button>
                <button type="button" className="h-6 w-6 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  ↓
                </button>
                {s.kind === "builtin" ? (
                  <input
                    // Remount when the title changes elsewhere (chat, undo) so the field shows it.
                    key={s.title}
                    className={`flex-1 rounded border border-transparent px-1 py-0.5 hover:border-slate-300 focus:border-indigo-500 focus:outline-none ${hidden ? "text-slate-400 line-through" : ""}`}
                    defaultValue={s.title}
                    title="Click to rename this heading"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v === s.title) return;
                      set({ sectionTitles: { ...layout.sectionTitles, [s.key]: v && v !== DEFAULT_TITLES[s.key] ? v : undefined } });
                    }}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  />
                ) : (
                  <span className={`flex-1 px-1 ${hidden ? "text-slate-400 line-through" : ""}`}>
                    {s.title} <span className="text-[10px] text-slate-400">(custom)</span>
                  </span>
                )}
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={!hidden} onChange={() => toggleHidden(s.id)} />
                  Show
                </label>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">
          Tip: you can also ask the chat, e.g. “limit to 2 pages”, “use Times New Roman 11pt”, “move Education to the top”, “add a Projects section”,
          “bold the key technologies”. DOCX uses the same fonts and spacing as the PDF, so page counts match closely.
        </p>
      </div>
    </section>
  );
}

function Ctl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

/** Option list that also contains the current value (the AI may set e.g. 10.25pt). */
function withCurrent(options: number[], current: number) {
  return options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
}
