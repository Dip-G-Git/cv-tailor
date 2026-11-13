"use client";

import { type ReactNode, useState } from "react";
import type { Bullet, CustomSection, TailoredCV } from "@/lib/schemas";
import { Button, Field, Input, Textarea } from "../ui";

type Role = TailoredCV["experience"][number];
type FormProps<T> = { value: T; onSave: (v: T) => void; onCancel: () => void };

function FormActions({ onSave, onCancel, extra }: { onSave: () => void; onCancel: () => void; extra?: ReactNode }) {
  return (
    <div className="mt-3 flex items-center gap-2">
      {extra}
      <div className="flex-1" />
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button onClick={onSave}>Save</Button>
    </div>
  );
}

function FactsNote() {
  return (
    <p className="mt-2 text-[11px] text-slate-500">
      These are facts from your profile. Changes here also update your profile so the AI keeps them.
    </p>
  );
}

export function HeaderForm({ value, onSave, onCancel }: FormProps<{ header: TailoredCV["header"]; headline: string }>) {
  const [d, setD] = useState(value);
  const h = d.header;
  const setH = (patch: Partial<TailoredCV["header"]>) => setD({ ...d, header: { ...h, ...patch } });
  return (
    <div className="py-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label="Name">
          <Input value={h.name} onChange={(e) => setH({ name: e.target.value })} />
        </Field>
        <Field label="Headline (job title under your name)">
          <Input value={d.headline} onChange={(e) => setD({ ...d, headline: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input value={h.email} onChange={(e) => setH({ email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <Input value={h.phone} onChange={(e) => setH({ phone: e.target.value })} />
        </Field>
        <Field label="LinkedIn URL">
          <Input value={h.linkedin} onChange={(e) => setH({ linkedin: e.target.value })} />
        </Field>
        <Field label="GitHub URL (optional)">
          <Input value={h.github ?? ""} onChange={(e) => setH({ github: e.target.value })} />
        </Field>
        <Field label="Location">
          <Input value={h.location} onChange={(e) => setH({ location: e.target.value })} />
        </Field>
      </div>
      <FactsNote />
      <FormActions onSave={() => onSave({ ...d, headline: d.headline.trim() })} onCancel={onCancel} />
    </div>
  );
}

export function SummaryForm({ value, onSave, onCancel }: FormProps<string>) {
  const [d, setD] = useState(value);
  const words = d.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="py-2">
      <Textarea rows={6} value={d} onChange={(e) => setD(e.target.value)} />
      <FormActions
        onSave={() => d.trim() && onSave(d.trim())}
        onCancel={onCancel}
        extra={<span className="text-[11px] text-slate-500">{words} words (aim for 50–90)</span>}
      />
    </div>
  );
}

export function SkillsForm({ value, onSave, onCancel }: FormProps<TailoredCV["skills"]>) {
  const [rows, setRows] = useState(value.map((s) => ({ category: s.category, items: s.items.join(", ") })));
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2 py-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input className="!w-44" placeholder="Category" value={r.category} onChange={(e) => set(i, { category: e.target.value })} />
          <Input placeholder="Comma-separated skills" value={r.items} onChange={(e) => set(i, { items: e.target.value })} />
          <Button variant="danger" aria-label="Remove category" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <FormActions
        extra={
          <Button variant="secondary" onClick={() => setRows([...rows, { category: "", items: "" }])}>
            + Category
          </Button>
        }
        onCancel={onCancel}
        onSave={() =>
          onSave(
            rows
              .map((r) => ({
                category: r.category.trim(),
                items: r.items.split(",").map((t) => t.trim()).filter(Boolean),
              }))
              .filter((r) => r.category && r.items.length),
          )
        }
      />
    </div>
  );
}

export function RoleForm({
  value,
  onSave,
  onCancel,
  quantifiedElsewhere,
}: FormProps<Role> & { quantifiedElsewhere: number }) {
  const [d, setD] = useState(value);
  const set = (patch: Partial<Role>) => setD({ ...d, ...patch });
  const setBullet = (i: number, patch: Partial<Bullet>) =>
    set({ bullets: d.bullets.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const total = quantifiedElsewhere + d.bullets.filter((b) => b.isQuantified).length;

  function save() {
    const original = new Map(value.bullets.map((b) => [b.text, b]));
    onSave({
      ...d,
      client: d.client?.trim() || undefined,
      location: d.location?.trim() || undefined,
      bullets: d.bullets
        .map((b) => ({ ...b, text: b.text.trim(), metricMethod: b.isQuantified ? b.metricMethod : undefined }))
        .filter((b) => b.text)
        // A bullet the user typed or changed by hand counts as reviewed.
        .map((b) => (original.has(b.text) ? b : { ...b, source: "user_confirmed" as const })),
    });
  }

  return (
    <div className="py-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label="Job title">
          <Input value={d.jobTitle} onChange={(e) => set({ jobTitle: e.target.value })} />
        </Field>
        <Field label="Company">
          <Input value={d.company} onChange={(e) => set({ company: e.target.value })} />
        </Field>
        <Field label="Client (optional)">
          <Input value={d.client ?? ""} onChange={(e) => set({ client: e.target.value })} />
        </Field>
        <Field label="Location (optional)">
          <Input value={d.location ?? ""} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Start">
          <Input value={d.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </Field>
        <Field label="End">
          <Input value={d.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs font-medium text-slate-600">Bullets</p>
        <p className={`text-[11px] ${total === 2 ? "text-green-700" : "text-amber-700"}`}>
          Quantified bullets in whole CV: {total} / 2
        </p>
      </div>
      <div className="mt-1 flex flex-col gap-2">
        {d.bullets.map((b, i) => (
          <div key={i} className="rounded-md border border-slate-200 bg-white p-2">
            <Textarea rows={2} value={b.text} onChange={(e) => setBullet(i, { text: e.target.value })} />
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={b.isQuantified}
                  onChange={(e) => setBullet(i, { isQuantified: e.target.checked })}
                />
                Quantified
              </label>
              {b.isQuantified && (
                <Input
                  className="!w-64 !py-0.5 !text-[11px]"
                  placeholder="How is the metric measured?"
                  value={b.metricMethod ?? ""}
                  onChange={(e) => setBullet(i, { metricMethod: e.target.value })}
                />
              )}
              <div className="flex-1" />
              <Button
                variant="ghost"
                className="!px-1.5 !py-0.5 !text-[11px]"
                disabled={i === 0}
                onClick={() => {
                  const bullets = [...d.bullets];
                  [bullets[i - 1], bullets[i]] = [bullets[i], bullets[i - 1]];
                  set({ bullets });
                }}
              >
                ↑
              </Button>
              <Button
                variant="danger"
                className="!px-1.5 !py-0.5 !text-[11px]"
                onClick={() => set({ bullets: d.bullets.filter((_, j) => j !== i) })}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
      <FactsNote />
      <FormActions
        extra={
          <Button
            variant="secondary"
            onClick={() => set({ bullets: [...d.bullets, { text: "", isQuantified: false, source: "user_confirmed" }] })}
          >
            + Bullet
          </Button>
        }
        onSave={save}
        onCancel={onCancel}
      />
    </div>
  );
}

export function EducationForm({ value, onSave, onCancel }: FormProps<TailoredCV["education"]>) {
  const [rows, setRows] = useState(value);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2 py-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Degree" value={r.degree} onChange={(e) => set(i, { degree: e.target.value })} />
          <Input placeholder="Institution" value={r.institution} onChange={(e) => set(i, { institution: e.target.value })} />
          <Input className="!w-20" placeholder="Year" value={r.year} onChange={(e) => set(i, { year: e.target.value })} />
          <Button variant="danger" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <FactsNote />
      <FormActions
        extra={
          <Button variant="secondary" onClick={() => setRows([...rows, { degree: "", institution: "", year: "" }])}>
            + Education
          </Button>
        }
        onCancel={onCancel}
        onSave={() => onSave(rows.filter((r) => r.degree.trim() || r.institution.trim()))}
      />
    </div>
  );
}

export function CertificationsForm({ value, onSave, onCancel }: FormProps<TailoredCV["certifications"]>) {
  const [rows, setRows] = useState(value);
  const set = (i: number, patch: Partial<(typeof rows)[number]>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2 py-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <Input placeholder="Certification" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
          <Input placeholder="Issuer" value={r.issuer ?? ""} onChange={(e) => set(i, { issuer: e.target.value })} />
          <Input className="!w-20" placeholder="Year" value={r.year ?? ""} onChange={(e) => set(i, { year: e.target.value })} />
          <Button variant="danger" aria-label="Remove" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <FactsNote />
      <FormActions
        extra={
          <Button variant="secondary" onClick={() => setRows([...rows, { name: "", issuer: "", year: "" }])}>
            + Certification
          </Button>
        }
        onCancel={onCancel}
        onSave={() => onSave(rows.filter((r) => r.name.trim()))}
      />
    </div>
  );
}

export function CustomSectionForm({
  value,
  onSave,
  onCancel,
  onDelete,
}: FormProps<CustomSection> & { onDelete: () => void }) {
  const [title, setTitle] = useState(value.title);
  const [style, setStyle] = useState<NonNullable<CustomSection["style"]>>(value.style ?? "bullets");
  const [items, setItems] = useState(value.items.join("\n"));
  return (
    <div className="py-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px]">
        <Field label="Section title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Projects, Languages, Awards" />
        </Field>
        <Field label="Display as">
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
            value={style}
            onChange={(e) => setStyle(e.target.value as typeof style)}
          >
            <option value="bullets">Bullet points</option>
            <option value="lines">Plain lines</option>
            <option value="inline">One comma-separated line</option>
          </select>
        </Field>
      </div>
      <Field label="Items (one per line, **text** for bold)" className="mt-2">
        <Textarea rows={6} value={items} onChange={(e) => setItems(e.target.value)} />
      </Field>
      <FormActions
        extra={
          <Button variant="danger" onClick={onDelete}>
            Delete section
          </Button>
        }
        onCancel={onCancel}
        onSave={() =>
          title.trim() &&
          onSave({
            title: title.trim(),
            style,
            items: items.split("\n").map((i) => i.trim()).filter(Boolean),
          })
        }
      />
    </div>
  );
}
