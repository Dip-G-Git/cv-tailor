"use client";

import { type CSSProperties, useState } from "react";
import { certLine, contactLine, eduLine, roleMeta, roleTitle } from "@/lib/export/format";
import {
  allSections,
  FONTS,
  isHidden,
  MARGIN_PT,
  PAGE_PT,
  resolveLayout,
  richSegments,
  type SectionRef,
  sectionIsEmpty,
} from "@/lib/layout";
import type { Bullet, CustomSection, TailoredCV } from "@/lib/schemas";
import { type AiContext, AiSuggestPanel } from "./cv/AiSuggestPanel";
import {
  CertificationsForm,
  CustomSectionForm,
  EducationForm,
  HeaderForm,
  RoleForm,
  SkillsForm,
  SummaryForm,
} from "./cv/SectionForms";
import { type ActiveSection, SectionShell } from "./cv/SectionShell";

type Props = { cv: TailoredCV; onChange: (cv: TailoredCV) => void; aiContext: AiContext };

function EditableText({
  value,
  onSave,
  className = "",
  multiline = true,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft !== null) {
    const save = () => {
      if (draft.trim() && draft !== value) onSave(draft.trim());
      setDraft(null);
    };
    return multiline ? (
      <textarea
        autoFocus
        className="w-full rounded border border-indigo-400 p-1 text-sm focus:outline-none"
        rows={Math.max(2, Math.ceil(draft.length / 90))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDraft(null);
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          }
        }}
      />
    ) : (
      <input
        autoFocus
        className="w-full rounded border border-indigo-400 p-1 text-sm focus:outline-none"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") setDraft(null);
          if (e.key === "Enter") save();
        }}
      />
    );
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit"
      className={`cursor-text rounded hover:bg-indigo-50 ${className}`}
      onClick={() => setDraft(value)}
      onKeyDown={(e) => e.key === "Enter" && setDraft(value)}
    >
      <Rich text={value} />
    </span>
  );
}

/** Shows **bold** segments in bold. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {richSegments(text).map((seg, i) => (seg.bold ? <b key={i}>{seg.text}</b> : <span key={i}>{seg.text}</span>))}
    </>
  );
}

export function CvEditor({ cv, onChange, aiContext }: Props) {
  const [active, setActive] = useState<ActiveSection>(null);
  const shell = { active, setActive };
  const applyAi = (update: (cv: TailoredCV) => TailoredCV) => onChange(update(cv));

  const setBullets = (roleIdx: number, bullets: Bullet[]) =>
    onChange({
      ...cv,
      experience: cv.experience.map((e, i) => (i === roleIdx ? { ...e, bullets } : e)),
    });

  function move(roleIdx: number, i: number, dir: -1 | 1) {
    const bullets = [...cv.experience[roleIdx].bullets];
    const j = i + dir;
    if (j < 0 || j >= bullets.length) return;
    [bullets[i], bullets[j]] = [bullets[j], bullets[i]];
    setBullets(roleIdx, bullets);
  }

  const quantifiedOutside = (roleIdx: number) =>
    cv.experience
      .filter((_, i) => i !== roleIdx)
      .flatMap((e) => e.bullets)
      .filter((b) => b.isQuantified).length;

  const layout = resolveLayout(cv.layout);
  const fs = layout.fontSize;
  const margin = MARGIN_PT[layout.margins];
  // Points in CSS, so the on-screen page wraps text the same way the PDF does.
  const pageStyle: CSSProperties = {
    width: `${PAGE_PT[layout.pageSize].w}pt`,
    padding: `${margin.v}pt ${margin.h}pt`,
    fontFamily: FONTS[layout.fontFamily].css,
    fontSize: `${fs}pt`,
    lineHeight: layout.lineHeight,
  };
  const headerAlign = layout.headerAlign === "center" ? "text-center" : "text-left";
  const titleStyle: CSSProperties = { color: layout.accentColor, fontSize: "1.14em", marginTop: "0.9em" };

  const setCustom = (index: number, next: CustomSection | null) => {
    const prev = cv.customSections ?? [];
    const old = prev[index];
    const customSections = next ? prev.map((s, i) => (i === index ? next : s)) : prev.filter((_, i) => i !== index);
    // Custom sections are referenced by title in the layout, so follow renames/deletes there too.
    const rename = (ids: string[]) =>
      ids.flatMap((id) => (id.trim().toLowerCase() === old.title.trim().toLowerCase() ? (next ? [next.title] : []) : [id]));
    onChange({
      ...cv,
      customSections,
      layout: cv.layout && {
        ...cv.layout,
        sectionOrder: cv.layout.sectionOrder && rename(cv.layout.sectionOrder),
        hiddenSections: cv.layout.hiddenSections && rename(cv.layout.hiddenSections),
      },
    });
  };

  const sections = allSections(cv).filter((ref) => !isHidden(layout, ref.id));

  function renderSection(ref: SectionRef) {
    const key = `${ref.kind}-${ref.id}`;
    if (ref.kind === "custom") {
      const s = cv.customSections![ref.index];
      const items = s.items.filter((i) => i.trim());
      return (
        <SectionShell
          key={key}
          sectionKey={`custom-${ref.index}`}
          title={ref.title}
          titleStyle={titleStyle}
          {...shell}
          aiEnabled={false}
          renderEdit={(close) => (
            <CustomSectionForm
              value={s}
              onCancel={close}
              onDelete={() => {
                setCustom(ref.index, null);
                close();
              }}
              onSave={(next) => {
                setCustom(ref.index, next);
                close();
              }}
            />
          )}
        >
          {items.length === 0 ? (
            <p className="text-slate-400 italic">Empty section (not exported). Click ✎ Edit to add items.</p>
          ) : s.style === "inline" ? (
            <p>
              <Rich text={items.join(", ")} />
            </p>
          ) : (
            <ul>
              {items.map((item, i) => (
                <li key={i} className="flex gap-2">
                  {s.style !== "lines" && <span className="select-none">•</span>}
                  <span>
                    <Rich text={item} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionShell>
      );
    }

    switch (ref.key) {
      case "summary":
        return (
          <SectionShell
            key={key}
            sectionKey="summary"
            title={ref.title}
            titleStyle={titleStyle}
            {...shell}
            renderEdit={(close) => (
              <SummaryForm
                value={cv.summary}
                onCancel={close}
                onSave={(summary) => {
                  onChange({ ...cv, summary });
                  close();
                }}
              />
            )}
            renderAi={(close) => (
              <AiSuggestPanel target={{ type: "summary" }} cv={cv} context={aiContext} onApply={applyAi} onClose={close} />
            )}
          >
            <EditableText value={cv.summary} onSave={(summary) => onChange({ ...cv, summary })} />
          </SectionShell>
        );

      case "skills":
        return (
          <SectionShell
            key={key}
            sectionKey="skills"
            title={ref.title}
            titleStyle={titleStyle}
            {...shell}
            renderEdit={(close) => (
              <SkillsForm
                value={cv.skills}
                onCancel={close}
                onSave={(skills) => {
                  onChange({ ...cv, skills });
                  close();
                }}
              />
            )}
            renderAi={(close) => (
              <AiSuggestPanel target={{ type: "skills" }} cv={cv} context={aiContext} onApply={applyAi} onClose={close} />
            )}
          >
            <ul>
              {cv.skills.map((s, i) => (
                <li key={i}>
                  <b>{s.category}: </b>
                  <EditableText
                    multiline={false}
                    value={s.items.join(", ")}
                    onSave={(v) =>
                      onChange({
                        ...cv,
                        skills: cv.skills.map((x, j) =>
                          j === i ? { ...x, items: v.split(",").map((t) => t.trim()).filter(Boolean) } : x,
                        ),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </SectionShell>
        );

      case "experience":
        return (
          <div key={key}>
            <h2 className="mb-1 border-b border-slate-300 pb-0.5 font-bold text-slate-900" style={titleStyle}>
              {ref.title.toUpperCase()}
            </h2>
            {cv.experience.map((role, r) => (
              <SectionShell
                key={r}
                sectionKey={`experience-${r}`}
                {...shell}
                renderEdit={(close) => (
                  <RoleForm
                    value={role}
                    quantifiedElsewhere={quantifiedOutside(r)}
                    onCancel={close}
                    onSave={(next) => {
                      onChange({ ...cv, experience: cv.experience.map((e, i) => (i === r ? next : e)) });
                      close();
                    }}
                  />
                )}
                renderAi={(close) => (
                  <AiSuggestPanel
                    target={{ type: "experience", index: r }}
                    cv={cv}
                    context={aiContext}
                    onApply={applyAi}
                    onClose={close}
                  />
                )}
              >
                <div className="mb-1">
                  <p className="font-bold text-slate-900" style={{ fontSize: "1.05em", marginTop: "0.5em" }}>
                    {roleTitle(role)}
                  </p>
                  <p className="italic text-slate-500">{roleMeta(role)}</p>
                  <ul>
                    {role.bullets.map((b, i) => (
                      <li key={`${r}-${i}-${b.text.slice(0, 20)}`} className="group flex gap-2" style={{ marginBottom: "0.18em" }}>
                        <span className="select-none">•</span>
                        <div className="flex-1">
                          <EditableText
                            value={b.text}
                            onSave={(text) =>
                              setBullets(
                                r,
                                role.bullets.map((x, j) => (j === i ? { ...x, text } : x)),
                              )
                            }
                          />
                          <span className="ml-1 inline-flex flex-wrap gap-1 align-middle font-sans leading-normal">
                            {b.isQuantified && (
                              <span
                                className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-800"
                                title={b.metricMethod ? `Measured: ${b.metricMethod}` : undefined}
                              >
                                quantified
                              </span>
                            )}
                            {b.source === "ai_suggested" && (
                              <button
                                type="button"
                                className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 hover:bg-amber-200"
                                title="This content isn't backed by your original CV. Click to confirm it's accurate."
                                onClick={() =>
                                  setBullets(
                                    r,
                                    role.bullets.map((x, j) => (j === i ? { ...x, source: "user_confirmed" } : x)),
                                  )
                                }
                              >
                                AI-suggested – verify ✓
                              </button>
                            )}
                          </span>
                        </div>
                        <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <IconBtn label="Move up" onClick={() => move(r, i, -1)}>↑</IconBtn>
                          <IconBtn label="Move down" onClick={() => move(r, i, 1)}>↓</IconBtn>
                          <IconBtn label="Delete" onClick={() => setBullets(r, role.bullets.filter((_, j) => j !== i))}>✕</IconBtn>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </SectionShell>
            ))}
          </div>
        );

      case "education":
        if (sectionIsEmpty(cv, ref) && active?.key !== "education") return null;
        return (
          <SectionShell
            key={key}
            sectionKey="education"
            title={ref.title}
            titleStyle={titleStyle}
            {...shell}
            aiEnabled={false}
            renderEdit={(close) => (
              <EducationForm
                value={cv.education}
                onCancel={close}
                onSave={(education) => {
                  onChange({ ...cv, education });
                  close();
                }}
              />
            )}
          >
            {cv.education.map((e, i) => (
              <p key={i}>{eduLine(e)}</p>
            ))}
          </SectionShell>
        );

      case "certifications":
        if (sectionIsEmpty(cv, ref) && active?.key !== "certifications") return null;
        return (
          <SectionShell
            key={key}
            sectionKey="certifications"
            title={ref.title}
            titleStyle={titleStyle}
            {...shell}
            aiEnabled={false}
            renderEdit={(close) => (
              <CertificationsForm
                value={cv.certifications}
                onCancel={close}
                onSave={(certifications) => {
                  onChange({ ...cv, certifications });
                  close();
                }}
              />
            )}
          >
            {cv.certifications.map((c, i) => (
              <p key={i}>{certLine(c)}</p>
            ))}
          </SectionShell>
        );
    }
  }

  const showAddEducation = cv.education.length === 0 && active?.key !== "education" && !isHidden(layout, "education");
  const showAddCerts =
    cv.certifications.length === 0 && active?.key !== "certifications" && !isHidden(layout, "certifications");

  return (
    <div className="max-w-full overflow-x-auto">
      <article className="mx-auto bg-white text-slate-800 shadow-md" style={pageStyle}>
        <SectionShell
          sectionKey="header"
          {...shell}
          renderEdit={(close) => (
            <HeaderForm
              value={{ header: cv.header, headline: cv.headline ?? "" }}
              onCancel={close}
              onSave={({ header, headline }) => {
                onChange({ ...cv, header, headline: headline || undefined });
                close();
              }}
            />
          )}
          renderAi={(close) => (
            <AiSuggestPanel target={{ type: "headline" }} cv={cv} context={aiContext} onApply={applyAi} onClose={close} />
          )}
        >
          <div className={headerAlign}>
            <h1 className="font-bold leading-tight" style={{ fontSize: "2.85em", color: layout.accentColor }}>
              {cv.header.name}
            </h1>
            {cv.headline && (
              <p className="text-slate-700" style={{ fontSize: "1.2em" }}>
                {cv.headline}
              </p>
            )}
            <p className="text-slate-600" style={{ fontSize: "0.95em", marginTop: "0.3em" }}>
              {contactLine(cv)}
            </p>
          </div>
        </SectionShell>

        {sections.map(renderSection)}

        <div className="mt-4 flex flex-wrap gap-3 font-sans text-xs print:hidden">
          {showAddEducation && (
            <button type="button" className="text-indigo-600 hover:underline" onClick={() => setActive({ key: "education", mode: "edit" })}>
              + Add education section
            </button>
          )}
          {showAddCerts && (
            <button type="button" className="text-indigo-600 hover:underline" onClick={() => setActive({ key: "certifications", mode: "edit" })}>
              + Add certifications section
            </button>
          )}
          <button
            type="button"
            className="text-indigo-600 hover:underline"
            onClick={() => {
              const n = cv.customSections?.length ?? 0;
              onChange({ ...cv, customSections: [...(cv.customSections ?? []), { title: "New Section", items: [], style: "bullets" }] });
              setActive({ key: `custom-${n}`, mode: "edit" });
            }}
          >
            + Add section (Projects, Languages, Awards…)
          </button>
        </div>
      </article>
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="h-5 w-5 rounded text-xs text-slate-500 hover:bg-slate-200"
    >
      {children}
    </button>
  );
}
