import {
  AlignmentType,
  BorderStyle,
  Document,
  LineRuleType,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import {
  customSectionItems,
  FONTS,
  MARGIN_PT,
  PAGE_PT,
  resolveLayout,
  richSegments,
  type SectionRef,
  visibleSections,
} from "../layout";
import type { TailoredCV } from "../schemas";
import { certLine, contactLine, eduLine, roleMeta, roleTitle } from "./format";

// Units: docx font sizes are half-points; spacing and margins are twips (1pt = 20 twips).
const half = (pt: number) => Math.round(pt * 2);
const tw = (pt: number) => Math.round(pt * 20);

export async function cvToDocx(cv: TailoredCV): Promise<Blob> {
  const l = resolveLayout(cv.layout);
  const font = FONTS[l.fontFamily].docx;
  const fs = l.fontSize;
  const color = l.accentColor.replace("#", "");
  const align = l.headerAlign === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  // Exact line height in points, matching the PDF's lineHeight multiplier.
  const line = { line: tw(fs * l.lineHeight), lineRule: LineRuleType.EXACT };

  const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
    new TextRun({ text, font, size: half(opts.size ?? fs), bold: opts.bold, italics: opts.italics, color: opts.color });

  const rich = (text: string) => richSegments(text).map((s) => run(s.text, { bold: s.bold }));

  const body = (children: TextRun[], extra: { after?: number; keepNext?: boolean } = {}) =>
    new Paragraph({ spacing: { after: tw(extra.after ?? 0), ...line }, keepNext: extra.keepNext, children });

  const bullet = (text: string, keepNext = false) =>
    new Paragraph({ bullet: { level: 0 }, spacing: { after: tw(fs * 0.18), ...line }, keepNext, children: rich(text) });

  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: tw(fs * 0.9), after: tw(fs * 0.35) },
      keepNext: true,
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } },
      children: [run(text.toUpperCase(), { bold: true, size: fs * 1.14, color })],
    });

  function section(ref: SectionRef): Paragraph[] {
    const out = [heading(ref.title)];
    if (ref.kind === "custom") {
      const s = cv.customSections![ref.index];
      const items = customSectionItems(s);
      if (s.style === "inline") out.push(body(rich(items.join(", "))));
      else out.push(...items.map((i) => (s.style === "lines" ? body(rich(i)) : bullet(i))));
      return out;
    }
    switch (ref.key) {
      case "summary":
        out.push(body(rich(cv.summary)));
        break;
      case "skills":
        out.push(...cv.skills.map((s) => body([run(`${s.category}: `, { bold: true }), run(s.items.join(", "))])));
        break;
      case "experience":
        for (const e of cv.experience) {
          out.push(
            new Paragraph({
              spacing: { before: tw(fs * 0.5), ...line },
              keepNext: true,
              children: [run(roleTitle(e), { bold: true, size: fs * 1.05 })],
            }),
            body([run(roleMeta(e), { italics: true, color: "444444" })], { after: 2, keepNext: true }),
            ...e.bullets.map((b, i) => bullet(b.text, i === 0 && e.bullets.length > 1)),
          );
        }
        break;
      case "education":
        out.push(...cv.education.map((e) => body([run(eduLine(e))])));
        break;
      case "certifications":
        out.push(...cv.certifications.map((c) => body([run(certLine(c))])));
        break;
    }
    return out;
  }

  const children: Paragraph[] = [
    new Paragraph({
      alignment: align,
      children: [run(cv.header.name, { bold: true, size: fs * 2.85, color })],
    }),
    ...(cv.headline
      ? [new Paragraph({ alignment: align, spacing: { before: 40 }, children: [run(cv.headline, { size: fs * 1.2, color: "222222" })] })]
      : []),
    new Paragraph({
      alignment: align,
      spacing: { before: 80, after: tw(fs * 0.6) },
      children: [run(contactLine(cv), { size: fs * 0.95, color: "333333" })],
    }),
    ...visibleSections(cv).flatMap(section),
  ];

  const m = MARGIN_PT[l.margins];
  const page = PAGE_PT[l.pageSize];
  const doc = new Document({
    styles: { default: { document: { run: { font, size: half(fs) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: tw(page.w), height: tw(page.h) },
            margin: { top: tw(m.v), bottom: tw(m.v), left: tw(m.h), right: tw(m.h) },
          },
        },
        children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
