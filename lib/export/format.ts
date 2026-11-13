import { customSectionItems, stripBold, visibleSections } from "../layout";
import type { TailoredCV } from "../schemas";

type Role = TailoredCV["experience"][number];

export function contactLine(cv: TailoredCV) {
  const h = cv.header;
  return [h.email, h.phone, h.linkedin, h.github, h.location].filter(Boolean).join("  |  ");
}

export function roleTitle(e: Role) {
  const org = e.client ? `${e.company} (Client: ${e.client})` : e.company;
  return `${e.jobTitle} — ${org}`;
}

export function roleMeta(e: Role) {
  return [e.location, `${e.startDate} – ${e.endDate}`].filter(Boolean).join("  |  ");
}

export function certLine(c: TailoredCV["certifications"][number]) {
  return [c.name, c.issuer, c.year].filter(Boolean).join(" — ");
}

export function eduLine(e: TailoredCV["education"][number]) {
  return [e.degree, e.institution, e.year].filter(Boolean).join(" — ");
}

export function fileBaseName(cv: TailoredCV, jobTitle: string) {
  const clean = (s: string) => s.trim().replace(/[^\w]+/g, "_").replace(/^_|_$/g, "");
  return `${clean(cv.header.name) || "CV"}_${clean(jobTitle) || "Role"}_CV`;
}

export function cvToPlainText(cv: TailoredCV): string {
  const lines: string[] = [cv.header.name.toUpperCase(), ...(cv.headline ? [cv.headline] : []), contactLine(cv), ""];
  for (const ref of visibleSections(cv)) {
    lines.push(ref.title.toUpperCase());
    if (ref.kind === "custom") {
      const s = cv.customSections![ref.index];
      const items = customSectionItems(s).map(stripBold);
      lines.push(...(s.style === "inline" ? [items.join(", ")] : items.map((i) => (s.style === "lines" ? i : `• ${i}`))));
    } else if (ref.key === "summary") {
      lines.push(stripBold(cv.summary));
    } else if (ref.key === "skills") {
      lines.push(...cv.skills.map((s) => `${s.category}: ${s.items.join(", ")}`));
    } else if (ref.key === "experience") {
      for (const [i, e] of cv.experience.entries()) {
        if (i > 0) lines.push("");
        lines.push(roleTitle(e), roleMeta(e), ...e.bullets.map((b) => `• ${stripBold(b.text)}`));
      }
    } else if (ref.key === "education") {
      lines.push(...cv.education.map(eduLine));
    } else {
      lines.push(...cv.certifications.map(certLine));
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
