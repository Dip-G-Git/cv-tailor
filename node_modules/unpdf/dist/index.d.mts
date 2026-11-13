import { DocumentInitParameters, PDFDocumentProxy } from "./types/src/display/api.js";
import "./types/src/display/optional_content_config.js";
import * as PDFJS from "./types/src/pdf.js";
import { Metadata, Metadata as Metadata$1 } from "./types/src/display/metadata.js";
/**
 * Axis-aligned box in PDF user space, origin bottom-left: in the coordinates of
 * the page's `/MediaBox`, unrotated by its `/Rotate`, and unscaled by its
 * `/UserUnit`.
 */
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface ExtractImagesOptions {
  /**
   * Encoding of each image's `data`: raw RGBA pixels, or a PNG file.
   *
   * @default 'rgba'
   */
  format?: "rgba" | "png";
}
interface ExtractedImage {
  /** RGBA pixels, four bytes per pixel, row by row from the top – or PNG bytes with `format: 'png'`. */
  data: Uint8Array;
  width: number;
  height: number;
  /** PDF.js object ID of the image, `null` for a small inline image, which PDF.js passes without one. */
  key: string | null;
  /** Box the image covers on the page, in PDF user space with the origin at the bottom left. */
  bounds: Bounds;
}
/**
 * Extracts the images painted on a page – image XObjects, inline images, and
 * image masks – as RGBA pixels. Image masks come out opaque black where they
 * paint and transparent elsewhere, since their color is the fill color at the
 * time of painting. A 1×1 image mask that paints its pixel, which PDF.js
 * turns into a solid fill, is skipped.
 *
 * @remarks
 * A caller-supplied document proxy created with `isOffscreenCanvasSupported`
 * or `isImageDecoderSupported` (both on by default outside of Node.js) hands
 * some images out as bitmaps instead of pixels, which are skipped.
 */
export declare function extractImages(data: DocumentInitParameters["data"] | PDFDocumentProxy, pageNumber: number, options?: ExtractImagesOptions): Promise<ExtractedImage[]>;
interface RenderPageAsImageOptions {
  canvasImport?: () => Promise<typeof import("@napi-rs/canvas")>;
  /** @default 1 */
  scale?: number;
  width?: number;
  height?: number;
  /** @default 'png' */
  format?: "png" | "jpeg" | "webp";
  /** Encoder quality from 0 to 1, for `jpeg` and `webp` only. */
  quality?: number;
  toDataURL?: boolean;
}
export declare function renderPageAsImage(data: DocumentInitParameters["data"] | PDFDocumentProxy, pageNumber: number, options?: RenderPageAsImageOptions & {
  toDataURL?: false;
}): Promise<Uint8Array>;
export declare function renderPageAsImage(data: DocumentInitParameters["data"] | PDFDocumentProxy, pageNumber: number, options: RenderPageAsImageOptions & {
  toDataURL: true;
}): Promise<string>;
export declare function renderPageAsImage(data: DocumentInitParameters["data"] | PDFDocumentProxy, pageNumber: number, options?: RenderPageAsImageOptions): Promise<Uint8Array | string>;
/**
 * Registers PDF.js' JBIG2 and OpenJPEG decoders, which CCITT, JBIG2, and JPEG
 * 2000 images need, with the serverless PDF.js build. `extractImages`,
 * `renderPageAsImage`, and `inspectPages` call this themselves, so a bundle that
 * only extracts text leaves the decoders out. Call it before decoding these
 * images through PDF.js directly; the decoders load on the first such image.
 * Another build set through `definePDFJSModule`, such as `pdfjs-dist`, ignores
 * it and loads its decoders from `wasmUrl`, which `getDocumentProxy` sets in
 * Node.js.
 */
export declare function registerImageDecoders(): void;
interface PageInspection {
  /** Characters of all text on the page, visible or not, whitespace excluded. */
  textLength: number;
  /**
   * Characters that paint nothing: drawn with text rendering mode 3 or 7 –
   * typically the OCR layer of a scan – or in a layer the document hides.
   * Whitespace excluded.
   */
  invisibleTextLength: number;
  /** Image XObjects, inline images, and image masks painted on the page. */
  imageCount: number;
  /**
   * Fraction of the page's view box covered by images, from 0 to 1. Overlapping
   * images count once, and a rotated or skewed image counts with its
   * axis-aligned bounds.
   */
  imageCoverage: number;
}
/**
 * Measures the text and images of every page, such as to tell scanned pages
 * from born-digital ones. Where that line lies is left to the caller.
 */
export declare function inspectPages(data: DocumentInitParameters["data"] | PDFDocumentProxy): Promise<{
  totalPages: number;
  pages: PageInspection[];
}>;
export declare function extractLinks(data: DocumentInitParameters["data"] | PDFDocumentProxy): Promise<{
  totalPages: number;
  links: string[][];
}>;
interface PDFInfo<DateValue = string> {
  PDFFormatVersion: string;
  Language: string | null;
  EncryptFilterName: string | null;
  IsLinearized: boolean;
  IsAcroFormPresent: boolean;
  IsXFAPresent: boolean;
  IsCollectionPresent: boolean;
  IsSignaturesPresent: boolean;
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
  Creator?: string;
  Producer?: string;
  CreationDate?: DateValue;
  ModDate?: DateValue;
  Trapped?: {
    name: string;
  };
  /** Non-standard `/Info` entries, keyed by their PDF name. */
  Custom?: Map<string, string | number | boolean | {
    name: string;
  }>;
}
export declare function getMeta<ParseDates extends boolean = false>(data: DocumentInitParameters["data"] | PDFDocumentProxy, options?: {
  parseDates?: ParseDates;
}): Promise<{
  info: PDFInfo<ParseDates extends true ? Date | null : string>;
  metadata: Metadata$1 | null;
}>;
interface StructuredTextItem {
  str: string;
  /** X position in PDF coordinate space (origin: bottom-left). */
  x: number;
  /** Y position in PDF coordinate space (origin: bottom-left). */
  y: number;
  /** Width in device space. */
  width: number;
  /** Height in device space. */
  height: number;
  /** Font size derived from the transformation matrix. */
  fontSize: number;
  /** Font family, empty when unknown. */
  fontFamily: string;
  dir: "ltr" | "rtl" | "ttb";
  hasEOL: boolean;
}
export declare function extractTextItems(data: DocumentInitParameters["data"] | PDFDocumentProxy): Promise<{
  totalPages: number;
  items: StructuredTextItem[][];
}>;
export declare function extractText(data: DocumentInitParameters["data"] | PDFDocumentProxy, options?: {
  mergePages?: false;
}): Promise<{
  totalPages: number;
  text: string[];
}>;
export declare function extractText(data: DocumentInitParameters["data"] | PDFDocumentProxy, options: {
  mergePages: true;
}): Promise<{
  totalPages: number;
  text: string;
}>;
export declare function extractText(data: DocumentInitParameters["data"] | PDFDocumentProxy, options?: {
  mergePages?: boolean;
}): Promise<{
  totalPages: number;
  text: string | string[];
}>;
/**
 * Creates a `PDFDocumentProxy` from binary PDF data, with `useSystemFonts:
 * true`. In Node.js with `pdfjs-dist` installed, it uses that package's
 * standard fonts instead of system fonts and its packed CMaps. A PDF.js build
 * other than the serverless one also gets that package's image decoders.
 */
export declare function getDocumentProxy(data: DocumentInitParameters["data"], options?: DocumentInitParameters): Promise<PDFDocumentProxy>;
/**
 * Sets the PDF.js build every other method uses. The build loads on first use,
 * so call this before any other method. Without it, the serverless build is
 * used.
 *
 * @example
 * // In Node.js, the legacy build of `pdfjs-dist` (install it first)
 * import { definePDFJSModule } from 'unpdf'
 *
 * definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'))
 */
export declare function definePDFJSModule(pdfjs: () => Promise<any>): void;
export declare function getResolvedPDFJS(): Promise<typeof PDFJS>;
export type { Bounds, ExtractImagesOptions, ExtractedImage, Metadata, PDFInfo, PageInspection, RenderPageAsImageOptions, StructuredTextItem };