"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/api";
import type { CandidateProfile, SectionSuggestion, SectionTarget, TailoredCV } from "@/lib/schemas";
import { Button, ErrorBox, Spinner, Textarea } from "../ui";

export type AiContext = { profile: CandidateProfile; jdRaw: string };

const QUICK_ACTIONS: Record<SectionTarget["type"], string[]> = {
  headline: ["Match the JD's job title", "Make it more senior", "Include my main technology"],
  summary: [
    "Focus on the JD's must-have skills",
    "Make it shorter (3 lines)",
    "Highlight my domain/industry experience",
    "More impactful, less generic",
  ],
  skills: [
    "Reorder by relevance to the JD",
    "Regroup into clearer categories",
    "Remove skills irrelevant to this JD",
  ],
  experience: [
    "Rewrite bullets to match the JD",
    "Add 2 more bullets relevant to the JD",
    "Make bullets more concise",
    "Use stronger action verbs",
    "Emphasise the domain/industry context",
  ],
};

type Props = {
  target: SectionTarget;
  cv: TailoredCV;
  context: AiContext;
  /** Receives an updater so it applies to the latest CV, not a stale copy. */
  onApply: (update: (cv: TailoredCV) => TailoredCV) => void;
  onClose: () => void;
};

export function AiSuggestPanel({ target, cv, context, onApply, onClose }: Props) {
  const [instruction, setInstruction] = useState("");
  const [lastInstruction, setLastInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<SectionSuggestion | null>(null);

  async function ask(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setBusy(true);
    setLastInstruction(t);
    try {
      const res = await postJson<{ suggestion: SectionSuggestion }>("/api/suggest", {
        cv,
        profile: context.profile,
        jdRaw: context.jdRaw,
        target,
        instruction: t,
      });
      setSuggestion(res.suggestion);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function apply(update: (cv: TailoredCV) => TailoredCV) {
    onApply(update);
    onClose();
  }

  return (
    <div className="mt-2 mb-1 rounded-md border border-indigo-200 bg-white p-3 text-sm shadow-sm print:hidden">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-indigo-700">✨ AI suggestions for this section</p>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600" aria-label="Close">
          ✕
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ACTIONS[target.type].map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => ask(q)}
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Textarea
          rows={2}
          placeholder="Or describe what you want, e.g. “mention Azure DevOps CI/CD pipelines”"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(instruction);
            }
          }}
        />
        <Button onClick={() => ask(instruction)} disabled={busy || !instruction.trim()}>
          Suggest
        </Button>
      </div>

      {busy && (
        <p className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <Spinner /> Thinking about “{lastInstruction}”…
        </p>
      )}
      <div className="mt-2">
        <ErrorBox message={error} />
      </div>

      {suggestion && !busy && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          {suggestion.notes && <p className="mb-2 text-xs italic text-slate-500">{suggestion.notes}</p>}
          <SuggestionPreview suggestion={suggestion} onApply={apply} />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSuggestion(null)}>
              Discard
            </Button>
            <Button variant="secondary" onClick={() => ask(lastInstruction)}>
              Try again
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SuggestionPreview({
  suggestion,
  onApply,
}: {
  suggestion: SectionSuggestion;
  onApply: (update: (cv: TailoredCV) => TailoredCV) => void;
}) {
  switch (suggestion.type) {
    case "headline":
    case "summary": {
      const field = suggestion.type;
      return (
        <div className="flex flex-col gap-2">
          {suggestion.options.map((opt, i) => (
            <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-2">
              <p className="text-slate-800">{opt}</p>
              <div className="mt-1 flex justify-end">
                <Button className="!py-0.5 !text-xs" onClick={() => onApply((cv) => ({ ...cv, [field]: opt }))}>
                  Use this
                </Button>
              </div>
            </div>
          ))}
        </div>
      );
    }
    case "skills":
      return (
        <div>
          <ul className="space-y-0.5 rounded-md border border-slate-200 bg-slate-50 p-2">
            {suggestion.skills.map((s) => (
              <li key={s.category}>
                <b>{s.category}:</b> {s.items.join(", ")}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-end">
            <Button onClick={() => onApply((cv) => ({ ...cv, skills: suggestion.skills }))}>Accept</Button>
          </div>
        </div>
      );
    case "experience":
      return (
        <div>
          <ul className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-2">
            {suggestion.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span>•</span>
                <span>
                  {b.text}
                  {b.isQuantified && (
                    <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-800">quantified</span>
                  )}
                  {b.source === "ai_suggested" && (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">AI-suggested</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {suggestion.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[11px] text-amber-700">
              {suggestion.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex justify-end">
            <Button
              onClick={() =>
                onApply((cv) => ({
                  ...cv,
                  experience: cv.experience.map((e, i) =>
                    i === suggestion.index ? { ...e, bullets: suggestion.bullets } : e,
                  ),
                }))
              }
            >
              Replace bullets
            </Button>
          </div>
        </div>
      );
  }
}
