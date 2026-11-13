// src/_internal/dommatrix-polyfill.ts
/**
* Stubs `DOMMatrix`, which PDF.js reads while its modules evaluate, so it must
* run before any PDF.js module is imported.
*/
function polyfillDOMMatrix() {
	if (typeof globalThis.DOMMatrix !== "undefined") return;
	globalThis.DOMMatrix = class DOMMatrix {
		constructor(init) {
			if (Array.isArray(init) && init.length === 6) {
				this.a = init[0];
				this.b = init[1];
				this.c = init[2];
				this.d = init[3];
				this.e = init[4];
				this.f = init[5];
			} else {
				this.a = 1;
				this.b = 0;
				this.c = 0;
				this.d = 1;
				this.e = 0;
				this.f = 0;
			}
		}
		translateSelf(tx, ty = 0) {
			this.e = this.a * tx + this.c * ty + this.e;
			this.f = this.b * tx + this.d * ty + this.f;
			return this;
		}
		scaleSelf(sx, sy = sx) {
			this.a *= sx;
			this.b *= sx;
			this.c *= sy;
			this.d *= sy;
			return this;
		}
	};
}
// src/utils.ts
let pdfjsLoader;
let resolvedModule;
let isWasmCompilable;
/**
* Whether PDF.js takes its Node.js code paths, by PDF.js' own rule: a
* `process` object outside of NW.js and Electron renderers. It decides between
* PDF.js' Node.js and DOM factories for canvases, fonts, and CMaps.
*/
const isNode = isNodeProcess(globalThis.process);
/**
* Creates a `PDFDocumentProxy` from binary PDF data, with `useSystemFonts:
* true`. In Node.js with `pdfjs-dist` installed, it uses that package's
* standard fonts instead of system fonts and its packed CMaps. A PDF.js build
* other than the serverless one also gets that package's image decoders.
*/
async function getDocumentProxy(data, options = {}) {
	const { getDocument } = await getResolvedPDFJS();
	let nodeDefaults = {};
	if (isNode) try {
		const nodeProcess = globalThis.process;
		const { dirname, join } = nodeProcess.getBuiltinModule("node:path");
		const { fileURLToPath } = nodeProcess.getBuiltinModule("node:url");
		const pdfjsDir = dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/package.json")));
		nodeDefaults = {
			useSystemFonts: false,
			standardFontDataUrl: `${join(pdfjsDir, "standard_fonts")}/`,
			cMapUrl: `${join(pdfjsDir, "cmaps")}/`,
			cMapPacked: true,
			wasmUrl: `${join(pdfjsDir, "wasm")}/`
		};
	} catch {}
	return await getDocument({
		data,
		useSystemFonts: true,
		useWasm: canCompileWasm(),
		...nodeDefaults,
		...options
	}).promise;
}
/**
* Runs an operation on a `PDFDocumentProxy` resolved from either binary data
* or an existing proxy. Documents created here are destroyed once the
* operation settles – caller-supplied proxies keep their lifecycle with the
* caller.
*/
async function withDocument(data, operation, options) {
	const pdf = isPDFDocumentProxy(data) ? data : await getDocumentProxy(data, options);
	try {
		return await operation(pdf);
	} finally {
		if (pdf !== data) await pdf.loadingTask.destroy();
	}
}
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
function definePDFJSModule(pdfjs) {
	pdfjsLoader = pdfjs;
	resolvedModule = void 0;
}
function getResolvedPDFJS() {
	resolvedModule ??= loadPDFJS(pdfjsLoader).catch((error) => {
		resolvedModule = void 0;
		throw error;
	});
	return resolvedModule;
}
function isPDFDocumentProxy(data) {
	return typeof data === "object" && data !== null && "_pdfInfo" in data;
}
async function interopDefault(m) {
	const resolved = await m;
	return resolved.default || resolved;
}
async function loadPDFJS(loader) {
	polyfillDOMMatrix();
	try {
		return await interopDefault(loader ? loader() : import("unpdf/pdfjs"));
	} catch (error) {
		throw new Error(`PDF.js could not be resolved: ${error}`, { cause: error });
	}
}
function canCompileWasm() {
	if (isWasmCompilable === void 0) try {
		new WebAssembly.Module(new Uint8Array([
			0,
			97,
			115,
			109,
			1,
			0,
			0,
			0
		]));
		isWasmCompilable = true;
	} catch {
		isWasmCompilable = false;
	}
	return isWasmCompilable;
}
function isNodeProcess(nodeProcess) {
	return typeof nodeProcess === "object" && `${nodeProcess}` === "[object process]" && !nodeProcess.versions.nw && !(nodeProcess.versions.electron && nodeProcess.type && nodeProcess.type !== "browser");
}
// src/_internal/canvas.ts
let resolvedCanvasModule;
async function resolveCanvasModule(canvasImport) {
	resolvedCanvasModule ??= await interopDefault(canvasImport());
	globalThis[Symbol.for("unpdf.canvasModule")] = resolvedCanvasModule;
}
/**
* Injects the `DOMMatrix` and `Path2D` constructors of `@napi-rs/canvas` into
* the global scope, which the PDF.js display layer instantiates while
* rendering. Only the legacy `pdfjs-dist` build polyfills them itself.
*
* @remarks
* `DOMMatrix` is always set because {@link polyfillDOMMatrix} may have
* installed a minimal stub to allow PDF.js to import – the real
* `@napi-rs/canvas` implementation must take precedence for rendering.
*/
function injectCanvasConstructors() {
	if (!resolvedCanvasModule) return;
	globalThis.DOMMatrix = resolvedCanvasModule.DOMMatrix;
	if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = resolvedCanvasModule.Path2D;
}
// src/_internal/operator-list.ts
const IDENTITY_MATRIX = [
	1,
	0,
	0,
	1,
	0,
	0
];
/**
* Walks an operator list in painting order, with the graphics state each
* operation draws with and whether it is visible. Skips the content of soft
* masks, which only modulates transparency.
*/
function* walkOperatorList(operatorList, ops, optionalContentConfig) {
	const stateStack = [];
	let state = {
		transform: IDENTITY_MATRIX,
		textRenderingMode: 0
	};
	const softMaskGroupFlags = [];
	const contentVisibilityFlags = [];
	for (let i = 0; i < operatorList.fnArray.length; i++) {
		const fn = operatorList.fnArray[i];
		const args = operatorList.argsArray[i];
		if (fn === ops.save) stateStack.push(state);
		else if (fn === ops.restore || fn === ops.paintFormXObjectEnd || fn === ops.endAnnotation) state = stateStack.pop() ?? state;
		else if (fn === ops.transform) state = {
			...state,
			transform: multiplyMatrices(state.transform, args)
		};
		else if (fn === ops.paintFormXObjectBegin) {
			stateStack.push(state);
			const [formMatrix] = args;
			if (formMatrix) state = {
				...state,
				transform: multiplyMatrices(state.transform, formMatrix)
			};
		} else if (fn === ops.beginAnnotation) {
			stateStack.push(state);
			const [, , annotationTransform, appearanceMatrix] = args;
			state = {
				transform: multiplyMatrices(Array.from(annotationTransform), appearanceMatrix),
				textRenderingMode: 0
			};
		} else if (fn === ops.setTextRenderingMode) state = {
			...state,
			textRenderingMode: args[0]
		};
		else if (fn === ops.beginGroup) softMaskGroupFlags.push(Boolean(args[0]?.smask));
		else if (fn === ops.endGroup) softMaskGroupFlags.pop();
		else if (fn === ops.beginMarkedContent) contentVisibilityFlags.push(true);
		else if (fn === ops.beginMarkedContentProps) {
			const [tag, properties] = args;
			contentVisibilityFlags.push(tag !== "OC" || optionalContentConfig.isVisible(properties));
		} else if (fn === ops.endMarkedContent) contentVisibilityFlags.pop();
		if (softMaskGroupFlags.includes(true)) continue;
		yield {
			fn,
			args,
			...state,
			isVisible: !contentVisibilityFlags.includes(false)
		};
	}
}
/**
* Maps the unit square, which PDF images are drawn into, through a transform
* and returns the axis-aligned box around the result.
*/
function getUnitSquareBounds(transform) {
	const [a, b, c, d, e, f] = transform;
	const xs = [
		e,
		a + e,
		c + e,
		a + c + e
	];
	const ys = [
		f,
		b + f,
		d + f,
		b + d + f
	];
	const minX = Math.min(...xs);
	const minY = Math.min(...ys);
	return {
		x: minX,
		y: minY,
		width: Math.max(...xs) - minX,
		height: Math.max(...ys) - minY
	};
}
/** Applies `inner` first, then `outer`, like `cm` concatenating onto the current matrix. */
function multiplyMatrices(outer, inner) {
	const [a, b, c, d, e, f] = outer;
	const [a2, b2, c2, d2, e2, f2] = Array.from(inner);
	return [
		a * a2 + c * b2,
		b * a2 + d * b2,
		a * c2 + c * d2,
		b * c2 + d * d2,
		a * e2 + c * f2 + e,
		b * e2 + d * f2 + f
	];
}
// src/_internal/png.ts
const PNG_SIGNATURE = [
	137,
	80,
	78,
	71,
	13,
	10,
	26,
	10
];
let crcTable;
/**
* Encodes RGBA pixels as an unfiltered 8-bit RGBA PNG, compressed through
* `CompressionStream`, which Node.js, Cloudflare Workers, and browsers all provide.
*/
async function encodePNG(rgba, width, height) {
	const rowLength = width * 4;
	const scanlines = new Uint8Array((rowLength + 1) * height);
	for (let y = 0; y < height; y++) scanlines.set(rgba.subarray(y * rowLength, (y + 1) * rowLength), y * (rowLength + 1) + 1);
	const header = /* @__PURE__ */ new Uint8Array(13);
	const headerView = new DataView(header.buffer);
	headerView.setUint32(0, width);
	headerView.setUint32(4, height);
	header[8] = 8;
	header[9] = 6;
	const chunks = [
		createChunk("IHDR", header),
		createChunk("IDAT", await deflate(scanlines)),
		createChunk("IEND", /* @__PURE__ */ new Uint8Array(0))
	];
	const png = new Uint8Array(PNG_SIGNATURE.length + chunks.reduce((sum, chunk) => sum + chunk.length, 0));
	png.set(PNG_SIGNATURE);
	let offset = PNG_SIGNATURE.length;
	for (const chunk of chunks) {
		png.set(chunk, offset);
		offset += chunk.length;
	}
	return png;
}
async function deflate(data) {
	const stream = new CompressionStream("deflate");
	const writer = stream.writable.getWriter();
	const [compressed] = await Promise.all([
		new Response(stream.readable).arrayBuffer(),
		writer.write(data),
		writer.close()
	]);
	return new Uint8Array(compressed);
}
/** Lays out a chunk as length, type, data, and the CRC of type and data. */
function createChunk(type, data) {
	const chunk = new Uint8Array(12 + data.length);
	const view = new DataView(chunk.buffer);
	view.setUint32(0, data.length);
	for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
	chunk.set(data, 8);
	view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
	return chunk;
}
function crc32(bytes) {
	crcTable ??= createCRCTable();
	let crc = 4294967295;
	for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
	return (crc ^ 4294967295) >>> 0;
}
function createCRCTable() {
	const table = /* @__PURE__ */ new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let crc = n;
		for (let k = 0; k < 8; k++) crc = crc & 1 ? 3988292384 ^ crc >>> 1 : crc >>> 1;
		table[n] = crc;
	}
	return table;
}
// src/image-decoders.ts
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
function registerImageDecoders() {
	globalThis[Symbol.for("unpdf.loadImageDecoder")] ??= async (fileName) => {
		const { loadDecoder } = await import("#pdfjs-decoders");
		return await loadDecoder(fileName);
	};
}
// src/image.ts
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
async function extractImages(data, pageNumber, options = {}) {
	registerImageDecoders();
	return await withDocument(data, async (pdf) => {
		if (pageNumber < 1 || pageNumber > pdf.numPages) throw new Error(`Invalid page number. Must be between 1 and ${pdf.numPages}.`);
		const page = await pdf.getPage(pageNumber);
		const [operatorList, optionalContentConfig] = await Promise.all([page.getOperatorList(), pdf.getOptionalContentConfig()]);
		const { ImageKind, OPS } = await getResolvedPDFJS();
		const images = [];
		for (const { fn, args, transform, isVisible } of walkOperatorList(operatorList, OPS, optionalContentConfig)) {
			if (!isVisible) continue;
			let key = null;
			let image;
			if (fn === OPS.paintImageXObject) {
				key = args[0];
				image = await getPageObject(page, key);
			} else if (fn === OPS.paintInlineImageXObject) image = args[0];
			else if (fn === OPS.paintImageMaskXObject) {
				key = args[0].data;
				image = await getPageObject(page, key);
			} else continue;
			if (!image) continue;
			const pixels = toRGBA(image, fn === OPS.paintImageMaskXObject, ImageKind);
			if (!pixels) continue;
			images.push({
				data: options.format === "png" ? await encodePNG(pixels, image.width, image.height) : pixels,
				width: image.width,
				height: image.height,
				key,
				bounds: getUnitSquareBounds(transform)
			});
		}
		return images;
	}, {
		isOffscreenCanvasSupported: false,
		isImageDecoderSupported: false
	});
}
async function renderPageAsImage(data, pageNumber, options = {}) {
	registerImageDecoders();
	await prepareCanvasEnvironment(options.canvasImport);
	return await withDocument(data, async (pdf) => {
		if (pageNumber < 1 || pageNumber > pdf.numPages) throw new Error(`Invalid page number. Must be between 1 and ${pdf.numPages}.`);
		const page = await pdf.getPage(pageNumber);
		const defaultViewport = page.getViewport({ scale: 1 });
		let scale = options.scale ?? 1;
		if (options.width !== void 0) scale = options.width / defaultViewport.width;
		else if (options.height !== void 0) scale = options.height / defaultViewport.height;
		const viewport = page.getViewport({ scale });
		const canvasFactory = pdf.canvasFactory;
		const canvasAndContext = canvasFactory.create(viewport.width, viewport.height);
		try {
			const { canvas } = canvasAndContext;
			await page.render({
				canvas,
				viewport
			}).promise;
			const { format = "png", quality } = options;
			const mimeType = `image/${format}`;
			if (options.toDataURL) {
				const dataURL = canvas.toDataURL(mimeType, quality);
				assertEncodedType(dataURL.slice(5, dataURL.indexOf(";")), mimeType);
				return dataURL;
			}
			if ("encode" in canvas) {
				const buffer = format === "png" ? await canvas.encode(format) : await canvas.encode(format, quality === void 0 ? void 0 : quality * 100);
				return new Uint8Array(buffer);
			}
			const blob = await new Promise((resolve) => {
				canvas.toBlob(resolve, mimeType, quality);
			});
			if (!blob) throw new Error(`Failed to encode canvas as ${mimeType}.`);
			assertEncodedType(blob.type, mimeType);
			return new Uint8Array(await blob.arrayBuffer());
		} finally {
			canvasFactory.destroy(canvasAndContext);
		}
	});
}
function getPageObject(page, objectId) {
	const objects = objectId.startsWith("g_") ? page.commonObjs : page.objs;
	return new Promise((resolve) => objects.get(objectId, resolve));
}
/**
* Converts PDF.js image data into a fresh RGBA buffer, so the result never
* aliases a buffer PDF.js keeps cached.
*/
function toRGBA(image, isMask, imageKind) {
	const { data, width, height, kind } = image;
	if (!data) return;
	const rgba = new Uint8Array(width * height * 4);
	if (kind === imageKind.RGBA_32BPP) {
		rgba.set(data.subarray(0, rgba.length));
		return rgba;
	}
	if (kind === imageKind.RGB_24BPP) {
		for (let source = 0, target = 0; target < rgba.length; source += 3, target += 4) {
			rgba[target] = data[source];
			rgba[target + 1] = data[source + 1];
			rgba[target + 2] = data[source + 2];
			rgba[target + 3] = 255;
		}
		return rgba;
	}
	if (!isMask && kind !== imageKind.GRAYSCALE_1BPP) return;
	const bytesPerRow = Math.ceil(width / 8);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
		const bit = data[y * bytesPerRow + (x >> 3)] >> 7 - (x & 7) & 1;
		const target = (y * width + x) * 4;
		if (isMask) rgba[target + 3] = bit === 0 ? 255 : 0;
		else {
			rgba.fill(bit === 0 ? 0 : 255, target, target + 3);
			rgba[target + 3] = 255;
		}
	}
	return rgba;
}
async function prepareCanvasEnvironment(canvasImport) {
	if (isNode) {
		if (!canvasImport) throw new Error("Parameter \"canvasImport\" is required in Node.js environment.");
		await resolveCanvasModule(canvasImport);
		injectCanvasConstructors();
		return;
	}
	if (typeof document === "undefined") throw new Error("Unsupported environment for canvas creation.");
}
function assertEncodedType(encodedType, mimeType) {
	if (encodedType !== mimeType) throw new Error(`This environment can't encode ${mimeType}, only ${encodedType}.`);
}
// src/inspect.ts
const WHITESPACE_PATTERN = /\s/g;
/**
* Measures the text and images of every page, such as to tell scanned pages
* from born-digital ones. Where that line lies is left to the caller.
*/
async function inspectPages(data) {
	registerImageDecoders();
	return await withDocument(data, async (pdf) => {
		const { OPS } = await getResolvedPDFJS();
		const optionalContentConfig = await pdf.getOptionalContentConfig();
		const shouldReleasePages = !isPDFDocumentProxy(data);
		const pages = [];
		for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) pages.push(await inspectPage(pdf, pageNumber, OPS, optionalContentConfig, shouldReleasePages));
		return {
			totalPages: pdf.numPages,
			pages
		};
	});
}
async function inspectPage(document, pageNumber, ops, optionalContentConfig, shouldReleasePage) {
	const page = await document.getPage(pageNumber);
	const [textContent, operatorList] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
	const textLength = textContent.items.reduce((sum, item) => sum + ("str" in item ? countCharacters(item.str) : 0), 0);
	let invisibleTextLength = 0;
	const imageBounds = [];
	for (const { fn, args, transform, textRenderingMode, isVisible } of walkOperatorList(operatorList, ops, optionalContentConfig)) if (fn === ops.showText && (!isVisible || textRenderingMode === 3 || textRenderingMode === 7)) {
		for (const glyph of args[0]) if (typeof glyph === "object" && glyph?.unicode) invisibleTextLength += countCharacters(glyph.unicode);
	} else if (isVisible && (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject)) imageBounds.push(getUnitSquareBounds(transform));
	if (shouldReleasePage) page.cleanup();
	return {
		textLength,
		invisibleTextLength,
		imageCount: imageBounds.length,
		imageCoverage: getCoverage(imageBounds, page.view)
	};
}
function countCharacters(text) {
	return Array.from(text.replace(WHITESPACE_PATTERN, "")).length;
}
/**
* Computes the fraction of a view box the union of boxes covers, exactly: cuts
* the view box into vertical slabs at every box edge and merges the vertical
* extents of the boxes spanning each slab.
*/
function getCoverage(boxes, view) {
	const [viewX0, viewY0, viewX1, viewY1] = view;
	const viewArea = (viewX1 - viewX0) * (viewY1 - viewY0);
	if (viewArea <= 0) return 0;
	const clippedBoxes = boxes.map((box) => ({
		x0: Math.max(box.x, viewX0),
		x1: Math.min(box.x + box.width, viewX1),
		y0: Math.max(box.y, viewY0),
		y1: Math.min(box.y + box.height, viewY1)
	})).filter((box) => box.x0 < box.x1 && box.y0 < box.y1);
	const edges = [...new Set(clippedBoxes.flatMap((box) => [box.x0, box.x1]))].sort((a, b) => a - b);
	let area = 0;
	for (let i = 0; i < edges.length - 1; i++) {
		const left = edges[i];
		const right = edges[i + 1];
		const spans = clippedBoxes.filter((box) => box.x0 <= left && box.x1 >= right).sort((a, b) => a.y0 - b.y0);
		let coveredHeight = 0;
		let coveredTop = -Infinity;
		for (const { y0, y1 } of spans) {
			const start = Math.max(y0, coveredTop);
			if (y1 > start) {
				coveredHeight += y1 - start;
				coveredTop = y1;
			}
		}
		area += coveredHeight * (right - left);
	}
	return area / viewArea;
}
// src/links.ts
async function extractLinks(data) {
	return await withDocument(data, async (pdf) => {
		const links = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => getPageLinks(pdf, i + 1)));
		return {
			totalPages: pdf.numPages,
			links
		};
	});
}
async function getPageLinks(document, pageNumber) {
	const annotations = await (await document.getPage(pageNumber)).getAnnotations();
	const links = [];
	for (const annotation of annotations) if (annotation.subtype === "Link" && annotation.url) links.push(annotation.url);
	return links;
}
// src/meta.ts
const XMP_DATE_PROPERTIES = [
	"xmp:createdate",
	"xmp:modifydate",
	"xmp:metadatadate",
	"xap:createdate",
	"xap:modifydate",
	"xap:metadatadate"
];
async function getMeta(data, options = {}) {
	return await withDocument(data, async (pdf) => {
		const meta = await pdf.getMetadata();
		const info = { ...meta.info };
		let metadata = meta.metadata;
		if (options.parseDates) {
			const { PDFDateString } = await getResolvedPDFJS();
			if (info.CreationDate) info.CreationDate = PDFDateString.toDateObject(info.CreationDate);
			if (info.ModDate) info.ModDate = PDFDateString.toDateObject(info.ModDate);
			if (metadata) {
				const Metadata = metadata.constructor;
				metadata = new Metadata({
					parsedData: new Map(Array.from(metadata, ([name, value]) => [name, XMP_DATE_PROPERTIES.includes(name) && value ? parseISODateString(value) : value])),
					rawData: metadata.getRaw()
				});
			}
		}
		return {
			info,
			metadata: metadata ?? null
		};
	});
}
function parseISODateString(isoDateString) {
	const parsedDate = Date.parse(isoDateString);
	return Number.isNaN(parsedDate) ? null : new Date(parsedDate);
}
// src/text.ts
async function extractTextItems(data) {
	return await withDocument(data, async (pdf) => {
		const items = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => getPageTextItems(pdf, i + 1)));
		return {
			totalPages: pdf.numPages,
			items
		};
	});
}
async function getPageTextItems(document, pageNumber) {
	const content = await (await document.getPage(pageNumber)).getTextContent();
	const styles = content.styles;
	return content.items.filter((item) => item.str != null).map((item) => {
		const [_a, _b, c, d, e, f] = item.transform;
		return {
			str: item.str,
			x: e,
			y: f,
			width: item.width,
			height: item.height,
			fontSize: Math.hypot(c, d),
			fontFamily: styles[item.fontName]?.fontFamily ?? "",
			dir: item.dir,
			hasEOL: item.hasEOL
		};
	});
}
async function extractText(data, options = {}) {
	const { mergePages = false } = options;
	return await withDocument(data, async (pdf) => {
		const texts = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => getPageText(pdf, i + 1)));
		return {
			totalPages: pdf.numPages,
			text: mergePages ? normalizeMergedText(texts) : texts
		};
	});
}
async function getPageText(document, pageNumber) {
	return (await (await document.getPage(pageNumber)).getTextContent()).items.filter((item) => item.str != null).map((item) => item.str + (item.hasEOL ? "\n" : "")).join("");
}
/**
* Collapses whitespace without destroying the line structure: `hasEOL` and
* page-join line breaks survive, but at most one blank line remains.
*/
function normalizeMergedText(texts) {
	return texts.join("\n").replace(/[^\S\n]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n");
}
export { definePDFJSModule, extractImages, extractLinks, extractText, extractTextItems, getDocumentProxy, getMeta, getResolvedPDFJS, inspectPages, registerImageDecoders, renderPageAsImage };
