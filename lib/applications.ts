import { type CandidateProfile, emptyProfile, type JDProfile, type TailoredCV } from "@/lib/schemas";
import type { ChatMessage } from "@/components/ChatPanel";

/** Working state of one job application (what the 3-step flow edits). */
export type Session = {
  step: 1 | 2 | 3;
  profile: CandidateProfile;
  jdRaw: string;
  jd: JDProfile | null;
  history: TailoredCV[];
  historyIndex: number;
  chat: ChatMessage[];
  warnings: string[];
  /** Which profile tab to open first (set when the record is created from the overview). */
  profileMode?: "upload" | "manual";
};

/** One entry in the overview list: a tailored CV plus the job application it is for. */
export type AppRecord = {
  id: string;
  label: string;
  url: string;
  createdAt: number;
  updatedAt: number;
  session: Session;
};

export type Store = {
  apps: AppRecord[];
  activeId: string | null;
  view: "overview" | "work";
};

export const initialSession = (): Session => ({
  step: 1,
  profile: emptyProfile(),
  jdRaw: "",
  jd: null,
  history: [],
  historyIndex: -1,
  chat: [],
  warnings: [],
});

export function newRecord(session: Session = initialSession()): AppRecord {
  const now = Date.now();
  return { id: crypto.randomUUID(), label: "", url: "", createdAt: now, updatedAt: now, session };
}

export function currentCv(app: AppRecord): TailoredCV | null {
  return app.session.history[app.session.historyIndex] ?? null;
}

/** Name shown for a record: the user's label, else something derived from the JD/CV. */
export function displayLabel(app: AppRecord): string {
  if (app.label.trim()) return app.label.trim();
  const jd = app.session.jd;
  if (jd?.jobTitle) return jd.jobTitle;
  return "Untitled application";
}

/** Only http(s) URLs are rendered as links (blocks javascript: and similar). */
export function safeUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export const STORE_KEY = "cv-tailor-apps-v1";
const LEGACY_KEY = "cv-tailor-session-v1";

/** Loads the store from localStorage, migrating the old single-session format if present. */
export function loadStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (Array.isArray(parsed.apps) && parsed.apps.length > 0) {
        const apps = parsed.apps.map((a) => ({ ...a, session: { ...initialSession(), ...a.session } }));
        const activeId = apps.some((a) => a.id === parsed.activeId) ? parsed.activeId : apps[0].id;
        return { apps, activeId, view: parsed.view === "work" ? "work" : "overview" };
      }
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const rec = newRecord({ ...initialSession(), ...JSON.parse(legacy) });
      localStorage.removeItem(LEGACY_KEY);
      return { apps: [rec], activeId: rec.id, view: "overview" };
    }
  } catch {
    localStorage.removeItem(STORE_KEY);
  }
  const rec = newRecord();
  return { apps: [rec], activeId: rec.id, view: "work" };
}
