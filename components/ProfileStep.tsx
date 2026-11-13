"use client";

import { useState } from "react";
import { postForm } from "@/lib/client/api";
import type { CandidateProfile } from "@/lib/schemas";
import { ProfileForm } from "./ProfileForm";
import { Button, Card, ErrorBox, Spinner } from "./ui";

type Props = {
  profile: CandidateProfile;
  onChange: (p: CandidateProfile) => void;
  onNext: () => void;
  initialTab?: "upload" | "manual";
};

export function ProfileStep({ profile, onChange, onNext, initialTab = "upload" }: Props) {
  const [tab, setTab] = useState<"upload" | "manual">(initialTab);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedFrom, setParsedFrom] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("File is larger than 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { profile: parsed } = await postForm<{ profile: CandidateProfile }>("/api/parse-cv", form);
      onChange(parsed);
      setParsedFrom(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ready = profile.personal.name.trim() && profile.experience.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(
          [
            ["upload", "Upload my existing CV"],
            ["manual", "Enter my details manually"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-md px-3 py-2 font-medium ${tab === key ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "upload" && (
        <Card>
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-indigo-400">
            {busy ? (
              <span className="flex items-center gap-2 text-sm text-slate-600">
                <Spinner /> Reading your CV…
              </span>
            ) : (
              <>
                <span className="text-sm font-medium text-slate-700">Click to upload your CV (PDF, DOCX or TXT, max 5 MB)</span>
                {parsedFrom && <span className="text-xs text-green-700">Parsed {parsedFrom}. Review the details below.</span>}
              </>
            )}
            <input
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </Card>
      )}

      <ErrorBox message={error} />

      {(tab === "manual" || parsedFrom || ready) && (
        <>
          {tab === "upload" && (
            <p className="text-sm text-slate-600">Check the parsed details and fix anything the parser got wrong.</p>
          )}
          <ProfileForm profile={profile} onChange={onChange} />
        </>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!ready}>
          Next: Job description →
        </Button>
      </div>
      {!ready && (
        <p className="text-right text-xs text-slate-400">Add your name and at least one work experience entry to continue.</p>
      )}
    </div>
  );
}
