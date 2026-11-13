"use client";

import { useEffect, useState } from "react";
import {
  type AppRecord,
  displayLabel,
  initialSession,
  loadStore,
  newRecord,
  safeUrl,
  type Session,
  STORE_KEY,
  type Store,
} from "@/lib/applications";
import { describeLayoutChange, resolveLayout, tighteningSteps, withLayout } from "@/lib/layout";
import { postJson } from "@/lib/client/api";
import { applyProfileFacts, syncProfileFromCv } from "@/lib/rules";
import { cvToPlainText, downloadBlob, fileBaseName } from "@/lib/export/format";
import type { CandidateProfile, TailoredCV } from "@/lib/schemas";
import { ChatPanel, type ChatMessage } from "./ChatPanel";
import { Overview } from "./Overview";
import { CvEditor } from "./CvEditor";
import { JdStep, TagList } from "./JdStep";
import { LayoutPanel } from "./LayoutPanel";
import { cleanProfile } from "./ProfileForm";
import { ProfileStep } from "./ProfileStep";
import { Button, Card, ErrorBox, Field, Input } from "./ui";

const MAX_HISTORY = 30;

const STEPS = ["Your profile", "Job description", "Tailored CV"] as const;

export function CvTailorApp() {
  const [store, setStore] = useState<Store>({ apps: [], activeId: null, view: "work" });
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refining, setRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyText, setBusyText] = useState<string | null>(null);
  const [showLayout, setShowLayout] = useState(false);
  /** Real page count of the current CV's PDF export (null while measuring). */
  const [pageCount, setPageCount] = useState<number | null>(null);

  // Load from / persist to localStorage (nothing is stored on the server).
  useEffect(() => {
    setStore(loadStore());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }, [store, loaded]);

  const activeApp: AppRecord | undefined = store.apps.find((a) => a.id === store.activeId);
  const session: Session = activeApp?.session ?? initialSession();
  /** Applies a change to the active application's working state. */
  const setSession = (fn: (s: Session) => Session) =>
    setStore((st) => ({
      ...st,
      apps: st.apps.map((a) => (a.id === st.activeId ? { ...a, updatedAt: Date.now(), session: fn(a.session) } : a)),
    }));
  const patchApp = (id: string, patch: Partial<Pick<AppRecord, "label" | "url">>) =>
    setStore((st) => ({ ...st, apps: st.apps.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)) }));
  const busy = generating || refining;

  function openApp(id: string) {
    setError(null);
    setStore((st) => ({ ...st, activeId: id, view: "work" }));
  }
  /** New record from the overview: with a parsed old CV, or blank to enter details by hand. */
  function createApp(profile?: CandidateProfile) {
    const rec = newRecord({ ...initialSession(), ...(profile ? { profile } : {}), profileMode: profile ? "upload" : "manual" });
    setError(null);
    setStore((st) => ({ apps: [...st.apps, rec], activeId: rec.id, view: "work" }));
  }
  function deleteApp(id: string) {
    const app = store.apps.find((a) => a.id === id);
    if (!app || !confirm(`Delete "${displayLabel(app)}" and its CV from this browser?`)) return;
    setStore((st) => {
      const apps = st.apps.filter((a) => a.id !== id);
      if (apps.length === 0) {
        const rec = newRecord();
        return { apps: [rec], activeId: rec.id, view: "work" };
      }
      return { ...st, apps, activeId: st.activeId === id ? apps[0].id : st.activeId };
    });
  }
  /** New CV uploaded from the overview: replace the profile and open at the profile step to review it. */
  function uploadCvFor(id: string, profile: CandidateProfile) {
    setStore((st) => ({
      ...st,
      activeId: id,
      view: "work",
      apps: st.apps.map((a) =>
        a.id === id ? { ...a, updatedAt: Date.now(), session: { ...a.session, profile, step: 1 } } : a,
      ),
    }));
  }

  const update = (patch: Partial<Session>) => setSession((s) => ({ ...s, ...patch }));

  /**
   * The CV is a snapshot from generation time, so facts edited on the profile
   * page afterwards (e.g. a new certification) must be copied into it when the
   * CV view opens. Without this they were invisible, and the next CV edit
   * synced the stale CV back over the profile, deleting them.
   */
  function goToStep(step: Session["step"]) {
    setSession((s) => {
      const current = s.history[s.historyIndex];
      if (step !== 3 || !current) return { ...s, step };
      const synced = applyProfileFacts(current, cleanProfile(s.profile));
      if (JSON.stringify(synced) === JSON.stringify(current)) return { ...s, step };
      const history = [...s.history.slice(0, s.historyIndex + 1), synced].slice(-MAX_HISTORY);
      return { ...s, step, history, historyIndex: history.length - 1 };
    });
  }
  const cv = session.history[session.historyIndex] ?? null;

  // Re-measure the page count whenever the CV changes (debounced; renders the real PDF).
  useEffect(() => {
    if (!cv) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const n = await countPages(cv);
        if (!cancelled) setPageCount(n);
      } catch {
        if (!cancelled) setPageCount(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cv]);

  function pushVersion(next: TailoredCV, extra: Partial<Session> = {}) {
    setSession((s) => {
      const history = [...s.history.slice(0, s.historyIndex + 1), next].slice(-MAX_HISTORY);
      return { ...s, ...extra, history, historyIndex: history.length - 1 };
    });
  }

  function goToVersion(index: number) {
    setSession((s) => ({
      ...s,
      historyIndex: index,
      profile: syncProfileFromCv(cleanProfile(s.profile), s.history[index]),
    }));
  }

  async function generate() {
    if (!session.jd) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await postJson<{ cv: TailoredCV; warnings: string[] }>("/api/generate", {
        profile: cleanProfile(session.profile),
        jd: session.jd,
        jdRaw: session.jdRaw,
      });
      // Keep the user's formatting and extra sections; generation only rewrites the content.
      const next: TailoredCV = { ...res.cv, layout: cv?.layout, customSections: cv?.customSections };
      pushVersion(next, { step: 3, warnings: res.warnings, chat: [] });
      void fitToPageLimit(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function refine(instruction: string) {
    if (!cv) return;
    const history = session.chat
      .filter((m) => m.role !== "error")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        text: m.changes?.length ? `${m.text}\n(Changes made: ${m.changes.join("; ")})` : m.text,
      }));
    const chat: ChatMessage[] = [...session.chat, { role: "user", text: instruction }];
    update({ chat });
    setRefining(true);
    try {
      const res = await postJson<{
        reply: string;
        changed: boolean;
        changes: string[];
        cv?: TailoredCV;
        warnings: string[];
      }>("/api/refine", {
        cv,
        profile: cleanProfile(session.profile),
        jdRaw: session.jdRaw,
        instruction,
        history,
        pageCount: pageCount ?? undefined,
      });
      if (res.changed && res.cv) {
        const reply: ChatMessage = {
          role: "assistant",
          text: res.reply || "Done.",
          changes: res.changes.length ? res.changes : ["CV updated"],
          before: cv,
        };
        // Chat can change any fact (roles, education, certifications…); keep the profile in step.
        pushVersion(res.cv, {
          warnings: res.warnings,
          chat: [...chat, reply],
          profile: syncProfileFromCv(cleanProfile(session.profile), res.cv),
        });
        setRefining(false);
        await fitToPageLimit(res.cv);
      } else {
        update({ chat: [...chat, { role: "assistant", text: res.reply }] });
      }
    } catch (e) {
      update({ chat: [...chat, { role: "error", text: (e as Error).message }] });
    } finally {
      setRefining(false);
    }
  }

  async function countPages(target: TailoredCV) {
    const { countPdfPages } = await import("@/lib/export/pdf");
    return countPdfPages(target);
  }

  /**
   * Makes the CV fit layout.maxPages, measured on the real PDF:
   * 1. pick the roomiest layout (original → progressively tighter spacing/margins/font) that fits;
   * 2. if even the tightest layout is too long, ask the AI to condense the content (max 2 rounds), then repeat 1.
   * The result is one new version with a chat message listing what changed (revertable).
   */
  async function fitToPageLimit(start: TailoredCV) {
    const max = resolveLayout(start.layout).maxPages;
    if (!max) return;
    setRefining(true);
    setBusyText(`Checking the ${max}-page limit…`);
    try {
      const startLayout = resolveLayout(start.layout);
      const startPages = await countPages(start);
      if (startPages <= max) return;

      const contentChanges: string[] = [];
      let content = start;
      let result: { cv: TailoredCV; pages: number } | null = null;

      for (let round = 0; ; round++) {
        // Roomiest layout first; stop at the first one that fits.
        const candidates = [content, ...tighteningSteps(resolveLayout(content.layout)).map((st) => withLayout(content, st.patch))];
        let tightest = { cv: content, pages: Infinity };
        for (const candidate of candidates) {
          setBusyText(`Fitting to ${max} page${max > 1 ? "s" : ""}: adjusting layout…`);
          const pages = await countPages(candidate);
          tightest = { cv: candidate, pages };
          if (pages <= max) break;
        }
        result = tightest;
        if (tightest.pages <= max || round >= 2) break;

        // Layout alone isn't enough: ask the AI to cut content (from the tightest layout, with the real page count).
        setBusyText(`Fitting to ${max} page${max > 1 ? "s" : ""}: asking the AI to condense (currently ${tightest.pages} pages)…`);
        const cut = Math.min(60, Math.round(((tightest.pages - max) / tightest.pages) * 100) + 8);
        const res = await postJson<{ changed: boolean; changes: string[]; cv?: TailoredCV }>("/api/refine", {
          cv: tightest.cv,
          profile: cleanProfile(session.profile),
          jdRaw: session.jdRaw,
          history: [],
          pageCount: tightest.pages,
          instruction: `The CV renders as ${tightest.pages} pages but the page limit (layout.maxPages) is ${max}. Spacing, margins and font size are already as tight as allowed. Shorten the CONTENT so it fits on ${max} page(s): cut roughly ${cut}% of the text. Prioritise: shorten the summary to 2-3 lines; remove the weakest or most redundant bullets from older roles first (keep at least 2 bullets per role); tighten long bullets to one line; trim long skill lists to JD-relevant items; shorten custom sections. Never remove roles, employers, dates, education or certifications, and keep the quantified bullets. Keep the layout exactly as it is. List what you cut in "changes".`,
        });
        if (!res.changed || !res.cv) break;
        contentChanges.push(...res.changes);
        // Restore the original roomier layout; the next loop re-tightens only as much as needed.
        content = { ...res.cv, layout: start.layout };
      }

      if (!result) return;
      const fits = result.pages <= max;
      const changes = [...describeLayoutChange(startLayout, resolveLayout(result.cv.layout)), ...contentChanges];
      const text = fits
        ? `Fitted to ${max} page${max > 1 ? "s" : ""} (was ${startPages}).`
        : `I couldn't get it down to ${max} page${max > 1 ? "s" : ""} without removing roles or facts. It's now ${result.pages} pages (was ${startPages}). Tell me what to drop, e.g. "remove the oldest role" or "hide certifications".`;
      if (changes.length === 0) {
        setSession((s) => ({ ...s, chat: [...s.chat, { role: "assistant", text }] }));
        return;
      }
      const fitted = result.cv;
      setSession((s) => {
        const history = [...s.history.slice(0, s.historyIndex + 1), fitted].slice(-MAX_HISTORY);
        return {
          ...s,
          history,
          historyIndex: history.length - 1,
          profile: syncProfileFromCv(cleanProfile(s.profile), fitted),
          chat: [...s.chat, { role: "assistant", text, changes, before: start }],
        };
      });
    } catch (e) {
      setSession((s) => ({ ...s, chat: [...s.chat, { role: "error", text: `Page fitting failed: ${(e as Error).message}` }] }));
    } finally {
      setRefining(false);
      setBusyText(null);
    }
  }

  function revertChatChange(messageIndex: number) {
    const msg = session.chat[messageIndex];
    if (!msg?.before) return;
    // Mark this change and any later ones as reverted, then restore the earlier CV as a new version.
    const chat = session.chat.map((m, i) => (i >= messageIndex && m.changes ? { ...m, reverted: true } : m));
    pushVersion(msg.before, {
      chat: [...chat, { role: "assistant", text: "Reverted. Your CV is back to how it was before that change." }],
      profile: syncProfileFromCv(cleanProfile(session.profile), msg.before),
    });
  }

  async function exportAs(kind: "pdf" | "docx" | "text") {
    if (!cv) return;
    const base = fileBaseName(cv, session.jd?.jobTitle || session.profile.headlineTitle);
    try {
      if (kind === "pdf") {
        const { cvToPdf } = await import("@/lib/export/pdf");
        downloadBlob(await cvToPdf(cv), `${base}.pdf`);
      } else if (kind === "docx") {
        const { cvToDocx } = await import("@/lib/export/docx");
        downloadBlob(await cvToDocx(cv), `${base}.docx`);
      } else {
        await navigator.clipboard.writeText(cvToPlainText(cv));
        alert("CV copied to clipboard.");
      }
    } catch (e) {
      setError(`Export failed: ${(e as Error).message}`);
    }
  }

  function clearAll() {
    if (!confirm("Delete ALL applications, profiles and generated CVs from this browser?")) return;
    const rec = newRecord();
    setStore({ apps: [rec], activeId: rec.id, view: "work" });
    setError(null);
  }

  if (!loaded) return null;

  const maxPages = cv ? resolveLayout(cv.layout).maxPages : undefined;
  const unverified = cv?.experience.flatMap((e) => e.bullets).filter((b) => b.source === "ai_suggested").length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-lg font-bold text-slate-900">CV Tailor</h1>
          <nav className="flex items-center gap-1 text-sm">
            <button
              type="button"
              disabled={busy}
              onClick={() => setStore((st) => ({ ...st, view: "overview" }))}
              className={`rounded-md px-3 py-1.5 ${
                store.view === "overview" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
              }`}
            >
              Overview ({store.apps.length})
            </button>
            {store.view === "work" && <span className="mx-1 h-5 w-px bg-slate-200" />}
            {store.view === "work" && STEPS.map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3;
              const enabled = n === 1 || (n === 2 && session.profile.experience.length > 0) || (n === 3 && cv);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={!enabled}
                  onClick={() => goToStep(n)}
                  className={`rounded-md px-3 py-1.5 ${
                    session.step === n ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
                  }`}
                >
                  {n}. {label}
                </button>
              );
            })}
          </nav>
          <Button variant="ghost" onClick={clearAll}>
            Clear my data
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>

        {store.view === "overview" && (
          <Overview
            apps={store.apps}
            onOpen={openApp}
            onNew={createApp}
            onDelete={deleteApp}
            onEdit={patchApp}
            onUploadCv={uploadCvFor}
          />
        )}

        {store.view === "work" && activeApp && (
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <Field label="Working on" className="min-w-[200px]">
              <select
                value={activeApp.id}
                disabled={busy}
                onChange={(e) => openApp(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
              >
                {store.apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {displayLabel(a)}
                    {a.session.history.length === 0 ? " (no CV yet)" : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Label" className="min-w-[200px] flex-1">
              <Input
                value={activeApp.label}
                placeholder="e.g. Acme – Senior Engineer"
                onChange={(e) => patchApp(activeApp.id, { label: e.target.value })}
              />
            </Field>
            <Field label="Job application URL" className="min-w-[240px] flex-[2]">
              <Input
                value={activeApp.url}
                placeholder="https://company.com/jobs/123"
                onChange={(e) => patchApp(activeApp.id, { url: e.target.value })}
              />
            </Field>
            {safeUrl(activeApp.url) && (
              <a
                href={safeUrl(activeApp.url)!}
                target="_blank"
                rel="noopener noreferrer"
                className="pb-2 text-sm text-indigo-600 hover:underline"
              >
                Open ↗
              </a>
            )}
          </div>
        )}

        {store.view === "work" && session.step === 1 && (
          <div className="mx-auto max-w-4xl">
            <ProfileStep
              key={activeApp?.id}
              initialTab={session.profileMode}
              profile={session.profile}
              onChange={(profile) => update({ profile })}
              onNext={() => goToStep(2)}
            />
          </div>
        )}

        {store.view === "work" && session.step === 2 && (
          <div className="mx-auto max-w-4xl">
            <JdStep
              jdRaw={session.jdRaw}
              jd={session.jd}
              onChange={(jdRaw, jd) => update({ jdRaw, jd })}
              onBack={() => update({ step: 1 })}
              onGenerate={generate}
              generating={generating}
            />
          </div>
        )}

        {store.view === "work" && session.step === 3 && cv && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:h-[calc(100vh-6rem)]">
              <div className="min-h-[320px] flex-1">
                <ChatPanel
                  messages={session.chat}
                  busy={refining}
                  busyText={busyText}
                  onSend={refine}
                  onRevert={revertChatChange}
                  onClear={() => update({ chat: [] })}
                />
              </div>
              <Card title="ATS keyword coverage">
                <div className="flex flex-col gap-2">
                  <TagList label="Matched" items={cv.atsKeywordCoverage.matched} tone="green" />
                  <TagList label="Missing (consider adding if true)" items={cv.atsKeywordCoverage.missing} tone="amber" />
                </div>
              </Card>
            </aside>

            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={session.historyIndex <= 0}
                  onClick={() => goToVersion(session.historyIndex - 1)}
                >
                  Undo
                </Button>
                <Button
                  variant="secondary"
                  disabled={session.historyIndex >= session.history.length - 1}
                  onClick={() => goToVersion(session.historyIndex + 1)}
                >
                  Redo
                </Button>
                <span className="text-xs text-slate-400">
                  Version {session.historyIndex + 1} of {session.history.length}
                </span>
                <div className="flex-1" />
                <PageBadge pages={pageCount} max={maxPages} />
                {pageCount !== null && maxPages !== undefined && pageCount > maxPages && (
                  <Button variant="secondary" disabled={refining} onClick={() => fitToPageLimit(cv)}>
                    Fit to {maxPages} page{maxPages > 1 ? "s" : ""}
                  </Button>
                )}
                <Button variant={showLayout ? "primary" : "secondary"} onClick={() => setShowLayout(!showLayout)}>
                  Layout
                </Button>
                <Button variant="secondary" onClick={generate} disabled={generating}>
                  {generating ? "Regenerating…" : "Regenerate"}
                </Button>
                <Button variant="secondary" onClick={() => exportAs("text")}>
                  Copy text
                </Button>
                <Button variant="secondary" onClick={() => exportAs("docx")}>
                  Download DOCX
                </Button>
                <Button onClick={() => exportAs("pdf")}>Download PDF</Button>
              </div>

              {cleanProfile(session.profile).experience.length !== cv.experience.length && (
                <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  Your profile has {cleanProfile(session.profile).experience.length} work experience entries but this CV
                  has {cv.experience.length}. Click <b>Regenerate</b> to rebuild the CV with your current roles.
                </p>
              )}
              {unverified > 0 && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {unverified} bullet{unverified > 1 ? "s are" : " is"} AI-suggested. Check each one is true for you, then
                  click its badge to confirm (or edit/delete it). Pay special attention to the numbers in quantified bullets.
                </p>
              )}
              {session.warnings.length > 0 && (
                <details className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <summary className="cursor-pointer">
                    For your info: {session.warnings.length} default CV guideline(s) not met (fine if you asked for it)
                  </summary>
                  <ul className="mt-2 list-disc pl-5 text-xs">
                    {session.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </details>
              )}

              {showLayout && (
                <LayoutPanel
                  cv={cv}
                  onClose={() => setShowLayout(false)}
                  onChange={(next) => {
                    pushVersion(next);
                    // A new or lower page limit applies right away.
                    const before = resolveLayout(cv.layout).maxPages;
                    const after = resolveLayout(next.layout).maxPages;
                    if (after && after !== before) void fitToPageLimit(next);
                  }}
                />
              )}

              <p className="text-xs text-slate-400">
                Hover a section for <b>✎ Edit</b> and <b>✨ AI suggest</b>. You can also click any text to edit it in place.
              </p>
              <CvEditor
                cv={cv}
                aiContext={{ profile: cleanProfile(session.profile), jdRaw: session.jdRaw }}
                onChange={(next) =>
                  // Keep profile facts in step with manual edits so later AI calls don't revert them.
                  pushVersion(next, { profile: syncProfileFromCv(cleanProfile(session.profile), next) })
                }
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function PageBadge({ pages, max }: { pages: number | null; max?: number }) {
  if (pages === null) return <span className="text-xs text-slate-400">Measuring pages…</span>;
  const over = max !== undefined && pages > max;
  return (
    <span
      className={`rounded-md px-2 py-1 text-xs font-medium ${over ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}
      title="Page count of the PDF export"
    >
      {pages} page{pages > 1 ? "s" : ""}
      {max !== undefined && ` / limit ${max}`}
    </span>
  );
}
