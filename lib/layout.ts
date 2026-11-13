import {
  BUILTIN_SECTIONS,
  type BuiltinSection,
  type CustomSection,
  type Layout,
  type TailoredCV,
} from "./schemas";

/** A layout with every field filled in. */
export type ResolvedLayout = {
  pageSize: "A4" | "Letter";
  fontFamily: "sans" | "serif";
  fontSize: number;
  lineHeight: number;
  margins: "narrow" | "normal" | "wide";
  headerAlign: "center" | "left";
  accentColor: string;
  maxPages?: number;
  sectionOrder: string[];
  hiddenSections: string[];
  sectionTitles: Partial<Record<BuiltinSection, string>>;
};

export const DEFAULT_LAYOUT: ResolvedLayout = {
  pageSize: "A4",
  fontFamily: "sans",
  fontSize: 10.5,
  lineHeight: 1.35,
  margins: "narrow",
  headerAlign: "center",
  accentColor: "#111111",
  sectionOrder: [...BUILTIN_SECTIONS],
  hiddenSections: [],
  sectionTitles: {},
};

export const DEFAULT_TITLES: Record<BuiltinSection, string> = {
  summary: "Professional Summary",
  skills: "Skills",
  experience: "Work Experience",
  education: "Education",
  certifications: "Certifications",
};

export const LIMITS = {
  fontSize: { min: 8, max: 14 },
  lineHeight: { min: 1, max: 2 },
  maxPages: { min: 1, max: 10 },
};

/** Page margins in points (72pt = 1 inch). */
export const MARGIN_PT: Record<ResolvedLayout["margins"], { v: number; h: number }> = {
  narrow: { v: 36, h: 40 }, // ~0.5"
  normal: { v: 54, h: 54 }, // 0.75"
  wide: { v: 72, h: 72 }, // 1"
};

/** Page sizes in points. */
export const PAGE_PT: Record<ResolvedLayout["pageSize"], { w: number; h: number }> = {
  A4: { w: 595.28, h: 841.89 },
  Letter: { w: 612, h: 792 },
};

/** Fonts with identical metrics in PDF (built-in) and Word, so page counts match. */
export const FONTS = {
  sans: { pdf: "Helvetica", pdfBold: "Helvetica-Bold", pdfItalic: "Helvetica-Oblique", docx: "Arial", css: "Arial, Helvetica, sans-serif" },
  serif: { pdf: "Times-Roman", pdfBold: "Times-Bold", pdfItalic: "Times-Italic", docx: "Times New Roman", css: "'Times New Roman', Times, serif" },
} as const;

const clamp = (n: number, { min, max }: { min: number; max: number }) => Math.min(max, Math.max(min, n));
const round = (n: number, step: number) => Math.round(n / step) * step;

export function resolveLayout(layout?: Layout): ResolvedLayout {
  const l = layout ?? {};
  const maxPages = l.maxPages && l.maxPages > 0 ? Math.round(clamp(l.maxPages, LIMITS.maxPages)) : undefined;
  return {
    pageSize: l.pageSize ?? DEFAULT_LAYOUT.pageSize,
    fontFamily: l.fontFamily ?? DEFAULT_LAYOUT.fontFamily,
    fontSize: l.fontSize ? round(clamp(l.fontSize, LIMITS.fontSize), 0.25) : DEFAULT_LAYOUT.fontSize,
    lineHeight: l.lineHeight ? round(clamp(l.lineHeight, LIMITS.lineHeight), 0.05) : DEFAULT_LAYOUT.lineHeight,
    margins: l.margins ?? DEFAULT_LAYOUT.margins,
    headerAlign: l.headerAlign ?? DEFAULT_LAYOUT.headerAlign,
    accentColor: /^#[0-9a-f]{6}$/i.test(l.accentColor ?? "") ? l.accentColor! : DEFAULT_LAYOUT.accentColor,
    maxPages,
    sectionOrder: l.sectionOrder?.length ? l.sectionOrder : DEFAULT_LAYOUT.sectionOrder,
    hiddenSections: l.hiddenSections ?? [],
    sectionTitles: Object.fromEntries(
      Object.entries(l.sectionTitles ?? {}).filter(([, v]) => typeof v === "string" && v.trim()),
    ) as ResolvedLayout["sectionTitles"],
  };
}

/** Normalises a layout (e.g. from the AI) so it is stored in a clean, clamped form. */
export function sanitizeLayout(layout?: Layout): Layout | undefined {
  if (!layout) return undefined;
  const r = resolveLayout(layout);
  return { ...r, maxPages: r.maxPages };
}

// --- Sections ---

export type SectionRef =
  | { kind: "builtin"; key: BuiltinSection; id: string; title: string }
  | { kind: "custom"; index: number; id: string; title: string };

const norm = (s: string) => s.trim().toLowerCase();

function builtinKey(id: string): BuiltinSection | undefined {
  return BUILTIN_SECTIONS.find((k) => k === norm(id));
}

export function isHidden(layout: ResolvedLayout, id: string) {
  return layout.hiddenSections.some((h) => norm(h) === norm(id));
}

/**
 * All sections in display order (hidden ones included, flagged by isHidden).
 * Listed ids come first in the given order; anything not listed keeps its
 * default position (built-ins in standard order, custom sections at the end).
 */
export function allSections(cv: TailoredCV): SectionRef[] {
  const layout = resolveLayout(cv.layout);
  const custom = cv.customSections ?? [];
  const refs: SectionRef[] = [
    ...BUILTIN_SECTIONS.map((key) => ({
      kind: "builtin" as const,
      key,
      id: key,
      title: layout.sectionTitles[key] || DEFAULT_TITLES[key],
    })),
    ...custom.map((s, index) => ({ kind: "custom" as const, index, id: s.title, title: s.title })),
  ];
  const ordered: SectionRef[] = [];
  const taken = new Set<SectionRef>();
  for (const id of layout.sectionOrder) {
    const key = builtinKey(id);
    const ref = refs.find((r) => !taken.has(r) && (key ? r.kind === "builtin" && r.key === key : r.kind === "custom" && norm(r.title) === norm(id)));
    if (ref) {
      ordered.push(ref);
      taken.add(ref);
    }
  }
  return [...ordered, ...refs.filter((r) => !taken.has(r))];
}

export function sectionIsEmpty(cv: TailoredCV, ref: SectionRef) {
  if (ref.kind === "custom") return !(cv.customSections?.[ref.index]?.items.some((i) => i.trim()));
  switch (ref.key) {
    case "summary":
      return !cv.summary.trim();
    case "skills":
      return cv.skills.length === 0;
    case "experience":
      return cv.experience.length === 0;
    case "education":
      return cv.education.length === 0;
    case "certifications":
      return cv.certifications.length === 0;
  }
}

/** Sections that appear in the exported CV: visible and non-empty. */
export function visibleSections(cv: TailoredCV): SectionRef[] {
  const layout = resolveLayout(cv.layout);
  return allSections(cv).filter((r) => !isHidden(layout, r.id) && !sectionIsEmpty(cv, r));
}

export function withLayout(cv: TailoredCV, patch: Partial<ResolvedLayout>): TailoredCV {
  return { ...cv, layout: sanitizeLayout({ ...resolveLayout(cv.layout), ...patch }) };
}

export function customSectionItems(s: CustomSection) {
  return s.items.map((i) => i.trim()).filter(Boolean);
}

// --- Fit to page limit ---

/**
 * Progressive layout tightening used before asking the AI to cut content.
 * Each step is a bit more compact than the previous, never below readable sizes.
 */
export function tighteningSteps(layout: ResolvedLayout): { patch: Partial<ResolvedLayout>; label: string }[] {
  const steps: { patch: Partial<ResolvedLayout>; label: string }[] = [];
  let cur = { ...layout };
  const push = (patch: Partial<ResolvedLayout>, label: string) => {
    cur = { ...cur, ...patch };
    steps.push({ patch: { ...cur }, label });
  };
  if (cur.margins !== "narrow") push({ margins: "narrow" }, "narrow margins");
  if (cur.lineHeight > 1.25) push({ lineHeight: 1.25 }, "line spacing 1.25");
  if (cur.fontSize > 10) push({ fontSize: 10 }, "font size 10pt");
  if (cur.lineHeight > 1.15) push({ lineHeight: 1.15 }, "line spacing 1.15");
  if (cur.fontSize > 9.5) push({ fontSize: 9.5 }, "font size 9.5pt");
  return steps;
}

export function describeLayoutChange(before: ResolvedLayout, after: ResolvedLayout): string[] {
  const out: string[] = [];
  if (before.margins !== after.margins) out.push(`Margins: ${before.margins} → ${after.margins}`);
  if (before.fontSize !== after.fontSize) out.push(`Font size: ${before.fontSize}pt → ${after.fontSize}pt`);
  if (before.lineHeight !== after.lineHeight) out.push(`Line spacing: ${before.lineHeight} → ${after.lineHeight}`);
  return out;
}

// --- Inline **bold** ---

export type TextSegment = { text: string; bold: boolean };

/** Splits "Built **Kafka** pipelines" into plain/bold segments. Unmatched ** are kept as text. */
export function richSegments(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

export function stripBold(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}
