import { Document, Page, pdf, StyleSheet, Text, View } from "@react-pdf/renderer";
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

function makeStyles(cv: TailoredCV) {
  const l = resolveLayout(cv.layout);
  const f = FONTS[l.fontFamily];
  const fs = l.fontSize;
  const m = MARGIN_PT[l.margins];
  // Explicit lineHeight everywhere: an inherited unitless value is resolved against the page font size.
  return StyleSheet.create({
    page: { paddingVertical: m.v, paddingHorizontal: m.h, fontFamily: f.pdf, fontSize: fs, lineHeight: l.lineHeight },
    name: { fontSize: fs * 2.85, lineHeight: 1.2, fontFamily: f.pdfBold, textAlign: l.headerAlign, color: l.accentColor },
    headline: { fontSize: fs * 1.2, lineHeight: 1.3, textAlign: l.headerAlign, marginTop: 2, color: "#222" },
    contact: { fontSize: fs * 0.95, lineHeight: 1.3, textAlign: l.headerAlign, marginTop: 4, marginBottom: fs * 0.6, color: "#333" },
    heading: {
      fontSize: fs * 1.14,
      lineHeight: 1.3,
      fontFamily: f.pdfBold,
      color: l.accentColor,
      marginTop: fs * 0.9,
      marginBottom: fs * 0.35,
      paddingBottom: 2,
      borderBottomWidth: 0.75,
      borderBottomColor: "#999",
    },
    bold: { fontFamily: f.pdfBold },
    roleTitle: { fontFamily: f.pdfBold, fontSize: fs * 1.05, marginTop: fs * 0.5 },
    roleMeta: { fontFamily: f.pdfItalic, color: "#444", marginBottom: 2 },
    bulletRow: { flexDirection: "row", marginBottom: fs * 0.18 },
    bulletDot: { width: fs },
    bulletText: { flex: 1 },
  });
}

type Styles = ReturnType<typeof makeStyles>;

/** Renders text with **bold** segments. */
function Rich({ text, styles }: { text: string; styles: Styles }) {
  return (
    <>
      {richSegments(text).map((s, i) =>
        s.bold ? (
          <Text key={i} style={styles.bold}>
            {s.text}
          </Text>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

function BulletLine({ text, styles }: { text: string; styles: Styles }) {
  return (
    <View style={styles.bulletRow} wrap={false}>
      <Text style={styles.bulletDot}>•</Text>
      <Text style={styles.bulletText}>
        <Rich text={text} styles={styles} />
      </Text>
    </View>
  );
}

function SectionBody({ cv, section, styles }: { cv: TailoredCV; section: SectionRef; styles: Styles }) {
  if (section.kind === "custom") {
    const s = cv.customSections![section.index];
    const items = customSectionItems(s);
    if (s.style === "inline") return <Text><Rich text={items.join(", ")} styles={styles} /></Text>;
    return (
      <>
        {items.map((item, i) =>
          s.style === "lines" ? (
            <Text key={i}><Rich text={item} styles={styles} /></Text>
          ) : (
            <BulletLine key={i} text={item} styles={styles} />
          ),
        )}
      </>
    );
  }
  switch (section.key) {
    case "summary":
      return <Text><Rich text={cv.summary} styles={styles} /></Text>;
    case "skills":
      return (
        <>
          {cv.skills.map((s, i) => (
            <Text key={i}>
              <Text style={styles.bold}>{s.category}: </Text>
              {s.items.join(", ")}
            </Text>
          ))}
        </>
      );
    case "experience":
      return (
        <>
          {cv.experience.map((e, i) => (
            <View key={i}>
              {/* Keep the role heading with its first bullet. */}
              <View wrap={false}>
                <Text style={styles.roleTitle}>{roleTitle(e)}</Text>
                <Text style={styles.roleMeta}>{roleMeta(e)}</Text>
                {e.bullets[0] && <BulletLine text={e.bullets[0].text} styles={styles} />}
              </View>
              {e.bullets.slice(1).map((b, j) => (
                <BulletLine key={j} text={b.text} styles={styles} />
              ))}
            </View>
          ))}
        </>
      );
    case "education":
      return <>{cv.education.map((e, i) => <Text key={i}>{eduLine(e)}</Text>)}</>;
    case "certifications":
      return <>{cv.certifications.map((c, i) => <Text key={i}>{certLine(c)}</Text>)}</>;
  }
}

function CvDocument({ cv }: { cv: TailoredCV }) {
  const styles = makeStyles(cv);
  const layout = resolveLayout(cv.layout);
  return (
    <Document title={`${cv.header.name} CV`} author={cv.header.name}>
      <Page size={[PAGE_PT[layout.pageSize].w, PAGE_PT[layout.pageSize].h]} style={styles.page}>
        <Text style={styles.name}>{cv.header.name}</Text>
        {cv.headline ? <Text style={styles.headline}>{cv.headline}</Text> : null}
        <Text style={styles.contact}>{contactLine(cv)}</Text>

        {visibleSections(cv).map((section) => (
          <View key={`${section.kind}-${section.id}`}>
            {/* minPresenceAhead keeps a heading from being stranded at the bottom of a page. */}
            <Text style={styles.heading} minPresenceAhead={30}>
              {section.title.toUpperCase()}
            </Text>
            <SectionBody cv={cv} section={section} styles={styles} />
          </View>
        ))}
      </Page>
    </Document>
  );
}

export function cvToPdf(cv: TailoredCV): Promise<Blob> {
  return pdf(<CvDocument cv={cv} />).toBlob();
}

/** Renders the PDF and returns how many pages it has. */
export async function countPdfPages(cv: TailoredCV): Promise<number> {
  const blob = await cvToPdf(cv);
  const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
  // Page objects are written uncompressed: "/Type /Page" (but not "/Type /Pages").
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length || 1;
}
