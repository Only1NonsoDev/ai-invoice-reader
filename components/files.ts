import { ExtractionError, IMAGE_TYPES, type Payload, type Provider } from "@/lib/vision";

export const MAX_BYTES = 15 * 1024 * 1024;
/** Anthropic rejects images over 5 MB (after base64), so anything bigger is downscaled. */
const RAW_IMAGE_LIMIT = 3 * 1024 * 1024;

export type Prepared = { payload: Payload; previewUrl: string | null };

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function checkFile(file: File): string | null {
  if (file.size > MAX_BYTES) return "That file is over 15 MB. Try a smaller scan or a single-page PDF.";
  if (isPdf(file) || file.type.startsWith("image/")) return null;
  return "Please choose a PDF or an image (PNG, JPEG, WebP).";
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new ExtractionError("Couldn't read that file."));
    r.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ExtractionError("Couldn't convert that file."))), type, quality),
  );
}

async function rasterise(file: File, maxSide: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || maxSide, img.naturalHeight || maxSide));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((img.naturalWidth || maxSide) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || maxSide) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToBlob(canvas, "image/jpeg", 0.9);
  } catch {
    throw new ExtractionError("Couldn't open that image. Try a PNG or JPEG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Render page 1 of a PDF to a PNG in the browser (pdf.js is loaded on demand). */
async function renderPdfPage(file: File): Promise<Blob> {
  try {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 1600 / Math.max(base.width, base.height)) });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await canvasToBlob(canvas, "image/png");
    void doc.destroy();
    return blob;
  } catch (e) {
    if (e instanceof ExtractionError) throw e;
    throw new ExtractionError("Couldn't open that PDF. It may be password-protected or damaged.");
  }
}

/** Turn a chosen file into what the chosen provider can accept, plus a preview image URL. */
export async function prepareFile(file: File, provider: Provider): Promise<Prepared> {
  if (isPdf(file)) {
    if (provider === "anthropic") {
      // Anthropic reads the PDF directly; the page render is only for the preview, so a failure there is not fatal.
      const base64 = await blobToBase64(file);
      const preview = await renderPdfPage(file).then(URL.createObjectURL, () => null);
      return { payload: { mediaType: "application/pdf", base64 }, previewUrl: preview };
    }
    const png = await renderPdfPage(file);
    return { payload: { mediaType: "image/png", base64: await blobToBase64(png) }, previewUrl: URL.createObjectURL(png) };
  }
  if (IMAGE_TYPES.includes(file.type) && file.size <= RAW_IMAGE_LIMIT) {
    return { payload: { mediaType: file.type, base64: await blobToBase64(file) }, previewUrl: URL.createObjectURL(file) };
  }
  const jpeg = await rasterise(file, 2000);
  return { payload: { mediaType: "image/jpeg", base64: await blobToBase64(jpeg) }, previewUrl: URL.createObjectURL(file) };
}

export function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Public asset URL that respects NEXT_PUBLIC_BASE_PATH for sub-path hosting. */
export function assetUrl(file: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${file}`;
}

export function downloadText(filename: string, text: string, mime: string): void {
  // CSV only: the BOM makes Excel read non-ASCII vendor names (e.g. "Café") as UTF-8.
  // JSON must not have a BOM, or strict JSON parsers reject it.
  const parts = mime.includes("csv") ? ["\uFEFF", text] : [text];
  const blob = new Blob(parts, { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
