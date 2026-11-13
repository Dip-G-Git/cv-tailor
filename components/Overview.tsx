"use client";

import { useState } from "react";
import { postForm } from "@/lib/client/api";
import { type AppRecord, currentCv, displayLabel, safeUrl } from "@/lib/applications";
import type { CandidateProfile } from "@/lib/schemas";
import { Button, Card, ErrorBox, Input, Spinner } from "./ui";

type Props = {
  apps: AppRecord[];
  onOpen: (id: string) => void;
  /** Create a record: with a parsed CV profile, or blank (enter details manually). */
  onNew: (profile?: CandidateProfile) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string, patch: { label?: string; url?: string }) => void;
  /** Replace the record's profile with a freshly parsed CV. */
  onUploadCv: (id: string, profile: CandidateProfile) => void;
};

export function Overview({ apps, onOpen, onNew, onDelete, onEdit, onUploadCv }: Props) {
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingBusy, setAddingBusy] = useState(false);

  async function uploadForNew(file: File) {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("File is larger than 5 MB.");
      return;
    }
    setAddingBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { profile } = await postForm<{ profile: CandidateProfile }>("/api/parse-cv", form);
      onNew(profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAddingBusy(false);
    }
  }

  async function upload(id: string, file: File) {
    setError(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("File is larger than 5 MB.");
      return;
    }
    setUploadingId(id);
    try {
      const form = new FormData();
      form.append("file", file);
      const { profile } = await postForm<{ profile: CandidateProfile }>("/api/parse-cv", form);
      onUploadCv(id, profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingId(null);
    }
  }

  const sorted = [...apps].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">My applications</h2>
          <p className="text-sm text-slate-500">
            One tailored CV per job. Click a row to generate, regenerate or edit it with AI.
          </p>
        </div>
        <Button onClick={() => setAdding((v) => !v)}>{adding ? "Cancel" : "+ New application"}</Button>
      </div>

      {adding && (
        <Card title="Add a new application">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer flex-col gap-1 rounded-lg border-2 border-dashed border-slate-300 p-4 hover:border-indigo-400 ${
                addingBusy ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                {addingBusy && <Spinner />}
                {addingBusy ? "Reading your CV…" : "I have a CV"}
              </span>
              <span className="text-xs text-slate-500">
                Upload your existing CV (PDF, DOCX or TXT, max 5 MB). It is parsed into editable details, then tailored to the job description.
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                disabled={addingBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadForNew(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              type="button"
              disabled={addingBusy}
              onClick={() => onNew()}
              className="flex flex-col gap-1 rounded-lg border-2 border-slate-200 p-4 text-left hover:border-indigo-400 disabled:opacity-60"
            >
              <span className="text-sm font-semibold text-slate-800">I don&apos;t have a CV</span>
              <span className="text-xs text-slate-500">
                Enter your details (contact, experience, skills, education, certifications) and a new CV is written to match the job description.
              </span>
            </button>
          </div>
        </Card>
      )}

      <ErrorBox message={error} />

      <div className="flex flex-col gap-3">
        {sorted.map((app) => {
          const cv = currentCv(app);
          const link = safeUrl(app.url);
          const busy = uploadingId === app.id;
          return (
            <Card key={app.id}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1.1fr_1.4fr_auto]">
                <button type="button" onClick={() => onOpen(app.id)} className="flex flex-col gap-1 text-left" title="Open this CV">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-400">CV</span>
                  {cv ? (
                    <>
                      <span className="font-semibold text-indigo-700 hover:underline">{cv.header.name || "Unnamed"}</span>
                      <span className="text-sm text-slate-600">{cv.headline || cv.experience[0]?.jobTitle}</span>
                      <span className="text-xs text-slate-400">
                        Version {app.session.historyIndex + 1} · updated {new Date(app.updatedAt).toLocaleDateString()}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-indigo-700 hover:underline">
                        {app.session.profile.personal.name || "No CV yet"}
                      </span>
                      <span className="text-sm text-slate-500">Not generated yet. Click to continue.</span>
                    </>
                  )}
                </button>

                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    Label
                    <Input
                      value={app.label}
                      placeholder={displayLabel({ ...app, label: "" })}
                      onChange={(e) => onEdit(app.id, { label: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                    <span className="flex items-center justify-between">
                      Job application URL
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                          Open ↗
                        </a>
                      )}
                    </span>
                    <Input
                      value={app.url}
                      placeholder="https://company.com/jobs/123"
                      onChange={(e) => onEdit(app.id, { url: e.target.value })}
                    />
                  </label>
                </div>

                <div className="flex flex-row flex-wrap items-start gap-2 md:flex-col md:items-stretch">
                  <Button onClick={() => onOpen(app.id)}>Open</Button>
                  <label
                    className={`inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 ${
                      busy ? "pointer-events-none opacity-60" : ""
                    }`}
                  >
                    {busy ? <Spinner /> : null}
                    {busy ? "Reading…" : "Upload new CV"}
                    <input
                      type="file"
                      accept=".pdf,.docx,.txt"
                      className="hidden"
                      disabled={uploadingId !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void upload(app.id, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <Button variant="danger" onClick={() => onDelete(app.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
