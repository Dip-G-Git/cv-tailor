"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/api";
import type { JDProfile } from "@/lib/schemas";
import { Button, Card, ErrorBox, Field, Input, Spinner, Textarea } from "./ui";

type Props = {
  jdRaw: string;
  jd: JDProfile | null;
  onChange: (raw: string, jd: JDProfile | null) => void;
  onBack: () => void;
  onGenerate: () => void;
  generating: boolean;
};

export function JdStep({ jdRaw, jd, onChange, onBack, onGenerate, generating }: Props) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze(payload: { text?: string; url?: string }) {
    setError(null);
    setBusy(true);
    try {
      const res = await postJson<{ jd: JDProfile; raw: string }>("/api/parse-jd", payload);
      onChange(res.raw, res.jd);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Job description">
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-2">
            <Field label="Job posting URL" className="flex-1">
              <Input placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </Field>
            <Button variant="secondary" disabled={!url.trim() || busy} onClick={() => analyze({ url: url.trim() })}>
              Fetch
            </Button>
          </div>
          <p className="text-center text-xs text-slate-400">or paste the text</p>
          <Textarea
            rows={12}
            placeholder="Paste the full job description here…"
            value={jdRaw}
            onChange={(e) => onChange(e.target.value, null)}
          />
          <div className="flex justify-end">
            <Button variant="secondary" disabled={jdRaw.trim().length < 50 || busy} onClick={() => analyze({ text: jdRaw })}>
              {busy ? <Spinner /> : null} Analyze JD
            </Button>
          </div>
        </div>
      </Card>

      <ErrorBox message={error} />

      {jd && (
        <Card title={`Detected: ${jd.jobTitle || "Role"}${jd.company ? ` at ${jd.company}` : ""}`}>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <TagList label="Must-have skills" items={jd.mustHaveSkills} />
            <TagList label="Nice-to-have" items={jd.niceToHaveSkills} />
            <TagList label="ATS keywords" items={jd.keywords} />
            <div>
              <p className="text-xs font-medium text-slate-500">Domain / seniority</p>
              <p className="text-slate-800">{[jd.domain, jd.seniority].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={onGenerate} disabled={!jd || generating}>
          {generating ? (
            <>
              <Spinner /> Generating CV (can take a minute)…
            </>
          ) : (
            "Generate tailored CV →"
          )}
        </Button>
      </div>
    </div>
  );
}

export function TagList({ label, items, tone = "slate" }: { label: string; items: string[]; tone?: "slate" | "green" | "amber" }) {
  const colors = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1">
        {items.length ? (
          items.map((s) => (
            <span key={s} className={`rounded px-1.5 py-0.5 text-xs ${colors[tone]}`}>
              {s}
            </span>
          ))
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )}
      </div>
    </div>
  );
}
