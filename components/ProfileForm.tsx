"use client";

import type { CandidateProfile, ExperienceInput } from "@/lib/schemas";
import { Button, Card, Field, Input, Textarea } from "./ui";

type Props = { profile: CandidateProfile; onChange: (p: CandidateProfile) => void };

function updateAt<T>(list: T[], i: number, patch: Partial<T>): T[] {
  return list.map((item, j) => (j === i ? { ...item, ...patch } : item));
}

function removeAt<T>(list: T[], i: number): T[] {
  return list.filter((_, j) => j !== i);
}

const emptyRole: ExperienceInput = {
  company: "",
  client: "",
  jobTitle: "",
  domain: "",
  location: "",
  startDate: "",
  endDate: "Present",
  originalBullets: [],
};

/** Blank input -> undefined, otherwise a non-negative number. */
const optNum = (v: string) => (v === "" ? undefined : Math.max(0, Number(v) || 0));

export function ProfileForm({ profile, onChange }: Props) {
  const set = (patch: Partial<CandidateProfile>) => onChange({ ...profile, ...patch });
  const p = profile.personal;
  const setPersonal = (patch: Partial<CandidateProfile["personal"]>) => set({ personal: { ...p, ...patch } });

  return (
    <div className="flex flex-col gap-4">
      <Card title="Personal details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Full name">
            <Input value={p.name} onChange={(e) => setPersonal({ name: e.target.value })} />
          </Field>
          <Field label="Email">
            <Input type="email" value={p.email} onChange={(e) => setPersonal({ email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={p.phone} onChange={(e) => setPersonal({ phone: e.target.value })} />
          </Field>
          <Field label="LinkedIn URL">
            <Input value={p.linkedin} onChange={(e) => setPersonal({ linkedin: e.target.value })} />
          </Field>
          <Field label="GitHub URL (optional)">
            <Input value={p.github ?? ""} onChange={(e) => setPersonal({ github: e.target.value })} />
          </Field>
          <Field label="Location">
            <Input value={p.location} onChange={(e) => setPersonal({ location: e.target.value })} />
          </Field>
          <Field label={`Experience in ${profile.headlineTitle || "your job title"} skills (years)`}>
            <Input
              type="number"
              min={0}
              step={0.5}
              value={profile.relevantExperienceYears ?? ""}
              onChange={(e) => set({ relevantExperienceYears: optNum(e.target.value) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Total IT experience (years)">
              <Input
                type="number"
                min={0}
                step={0.5}
                value={profile.totalExperienceYears || ""}
                onChange={(e) => set({ totalExperienceYears: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Job title">
              <Input
                placeholder="e.g. Mendix Developer"
                value={profile.headlineTitle}
                onChange={(e) => set({ headlineTitle: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="Technologies"
        actions={
          <Button variant="secondary" onClick={() => set({ skills: [...profile.skills, { name: "" }] })}>
            + Add
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {profile.skills.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder="Technology"
                value={s.name}
                onChange={(e) => set({ skills: updateAt(profile.skills, i, { name: e.target.value }) })}
              />
              <Input
                className="!w-20"
                type="number"
                min={0}
                step={0.5}
                placeholder="Yrs"
                value={s.years ?? ""}
                onChange={(e) =>
                  set({
                    skills: updateAt(profile.skills, i, {
                      years: e.target.value === "" ? undefined : Number(e.target.value),
                    }),
                  })
                }
              />
              <Button variant="danger" aria-label="Remove" onClick={() => set({ skills: removeAt(profile.skills, i) })}>
                ✕
              </Button>
            </div>
          ))}
          {profile.skills.length === 0 && <p className="text-sm text-slate-400">No technologies yet.</p>}
        </div>
      </Card>

      <Card title="Other skills">
        <Field label="Soft skills, methodologies, tools… (comma separated)">
          <Textarea
            rows={2}
            placeholder="Agile, Scrum, Stakeholder management, Jira"
            value={(profile.otherSkills ?? []).join(",")}
            onChange={(e) => set({ otherSkills: e.target.value.split(",") })}
          />
        </Field>
      </Card>

      <Card
        title="Work experience (most recent first)"
        actions={
          <Button variant="secondary" onClick={() => set({ experience: [...profile.experience, { ...emptyRole }] })}>
            + Add role
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-slate-500">
            Optional per-role controls: if you set &quot;Quantified bullets&quot; on any role, roles left blank get none.
            If you set it on no role, the AI adds 2 quantified bullets across the CV.
          </p>
          {profile.experience.map((r, i) => {
            const upd = (patch: Partial<ExperienceInput>) =>
              set({ experience: updateAt(profile.experience, i, patch) });
            return (
              <div key={i} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Role {i + 1}</span>
                  <Button variant="danger" onClick={() => set({ experience: removeAt(profile.experience, i) })}>
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Field label="Company">
                    <Input value={r.company} onChange={(e) => upd({ company: e.target.value })} />
                  </Field>
                  <Field label="Client (optional)">
                    <Input value={r.client ?? ""} onChange={(e) => upd({ client: e.target.value })} />
                  </Field>
                  <Field label="Job title">
                    <Input value={r.jobTitle} onChange={(e) => upd({ jobTitle: e.target.value })} />
                  </Field>
                  <Field label="Domain / industry">
                    <Input placeholder="e.g. Insurance" value={r.domain} onChange={(e) => upd({ domain: e.target.value })} />
                  </Field>
                  <Field label="Start">
                    <Input placeholder="Jan 2021" value={r.startDate} onChange={(e) => upd({ startDate: e.target.value })} />
                  </Field>
                  <Field label="End">
                    <Input placeholder="Present" value={r.endDate} onChange={(e) => upd({ endDate: e.target.value })} />
                  </Field>
                  <Field label="Location (optional)">
                    <Input value={r.location ?? ""} onChange={(e) => upd({ location: e.target.value })} />
                  </Field>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Field label="Bullet points to write (blank = auto)">
                    <Input
                      type="number"
                      min={0}
                      value={r.bulletCount ?? ""}
                      onChange={(e) => upd({ bulletCount: optNum(e.target.value) })}
                    />
                  </Field>
                  <Field label="Quantified bullets (0 = none, blank = auto)">
                    <Input
                      type="number"
                      min={0}
                      value={r.quantifiedCount ?? ""}
                      onChange={(e) => upd({ quantifiedCount: optNum(e.target.value) })}
                    />
                  </Field>
                  <Field label="How do you measure the achievement?">
                    <Input
                      placeholder="e.g. Jira cycle-time reports before vs. after"
                      disabled={!r.quantifiedCount}
                      value={r.metricMethod ?? ""}
                      onChange={(e) => upd({ metricMethod: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="What you did (optional, one point per line)" className="mt-2">
                  <Textarea
                    rows={4}
                    value={r.originalBullets.join("\n")}
                    onChange={(e) => upd({ originalBullets: e.target.value.split("\n") })}
                  />
                </Field>
              </div>
            );
          })}
          {profile.experience.length === 0 && <p className="text-sm text-slate-400">No roles yet.</p>}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Education"
          actions={
            <Button
              variant="secondary"
              onClick={() => set({ education: [...profile.education, { degree: "", institution: "", year: "" }] })}
            >
              + Add
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {profile.education.map((e, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Degree" value={e.degree} onChange={(ev) => set({ education: updateAt(profile.education, i, { degree: ev.target.value }) })} />
                <Input placeholder="Institution" value={e.institution} onChange={(ev) => set({ education: updateAt(profile.education, i, { institution: ev.target.value }) })} />
                <Input className="!w-20" placeholder="Year" value={e.year} onChange={(ev) => set({ education: updateAt(profile.education, i, { year: ev.target.value }) })} />
                <Button variant="danger" aria-label="Remove" onClick={() => set({ education: removeAt(profile.education, i) })}>✕</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Certifications"
          actions={
            <Button
              variant="secondary"
              onClick={() => set({ certifications: [...profile.certifications, { name: "", issuer: "", year: "" }] })}
            >
              + Add
            </Button>
          }
        >
          <div className="flex flex-col gap-2">
            {profile.certifications.map((c, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Certification" value={c.name} onChange={(ev) => set({ certifications: updateAt(profile.certifications, i, { name: ev.target.value }) })} />
                <Input placeholder="Issuer" value={c.issuer ?? ""} onChange={(ev) => set({ certifications: updateAt(profile.certifications, i, { issuer: ev.target.value }) })} />
                <Input className="!w-20" placeholder="Year" value={c.year ?? ""} onChange={(ev) => set({ certifications: updateAt(profile.certifications, i, { year: ev.target.value }) })} />
                <Button variant="danger" aria-label="Remove" onClick={() => set({ certifications: removeAt(profile.certifications, i) })}>✕</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Drops blank rows/lines before sending the profile to the server. */
export function cleanProfile(p: CandidateProfile): CandidateProfile {
  return {
    ...p,
    skills: p.skills.filter((s) => s.name.trim()),
    otherSkills: (p.otherSkills ?? []).map((s) => s.trim()).filter(Boolean),
    experience: p.experience
      .filter((r) => r.company.trim() || r.jobTitle.trim())
      .map((r) => ({ ...r, originalBullets: r.originalBullets.map((b) => b.trim()).filter(Boolean) })),
    education: p.education.filter((e) => e.degree.trim() || e.institution.trim()),
    certifications: p.certifications.filter((c) => c.name.trim()),
  };
}
