import { EXTRACTION_PROMPT } from "./prompt";
import { parseInvoice, ParseError } from "./parse";
import type { Invoice } from "./types";

export type Provider = "openai" | "anthropic";

export const OPENAI_MODEL = "gpt-4o-mini";
export const ANTHROPIC_MODEL = "claude-sonnet-5-5";

/** A file ready to send: base64 (no "data:" prefix) plus its media type. */
export type Payload = { mediaType: string; base64: string };

export class ExtractionError extends Error {}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function providerLabel(p: Provider): string {
  return p === "openai" ? `OpenAI ${OPENAI_MODEL}` : `Anthropic ${ANTHROPIC_MODEL}`;
}

export function buildOpenAIRequest(apiKey: string, file: Payload) {
  return {
    url: "https://api.openai.com/v1/chat/completions",
    init: {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: EXTRACTION_PROMPT },
              { type: "image_url", image_url: { url: `data:${file.mediaType};base64,${file.base64}` } },
            ],
          },
        ],
      }),
    } satisfies RequestInit,
  };
}

export function buildAnthropicRequest(apiKey: string, file: Payload) {
  const source = { type: "base64", media_type: file.mediaType, data: file.base64 };
  const block =
    file.mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source };
  return {
    url: "https://api.anthropic.com/v1/messages",
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: [block, { type: "text", text: EXTRACTION_PROMPT }] }],
      }),
    } satisfies RequestInit,
  };
}

export function readOpenAIText(json: unknown): string {
  const content = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new ExtractionError("OpenAI returned an empty reply. Please try again.");
  }
  return content;
}

export function readAnthropicText(json: unknown): string {
  const blocks = (json as { content?: { type?: string; text?: string }[] })?.content;
  const text = Array.isArray(blocks)
    ? blocks.filter((b) => b?.type === "text" && typeof b.text === "string").map((b) => b.text).join("\n")
    : "";
  if (!text.trim()) throw new ExtractionError("Anthropic returned an empty reply. Please try again.");
  return text;
}

/** Turn an HTTP failure into a sentence a non-developer can act on. */
export function friendlyHttpError(provider: Provider, status: number, apiMessage?: string): string {
  const name = provider === "openai" ? "OpenAI" : "Anthropic";
  if (status === 401 || status === 403) {
    return `${name} didn't accept that API key. Check that it's copied in full and still active.`;
  }
  if (status === 429) {
    return `${name} says you've hit a rate or spending limit. Wait a moment, or check your plan's credit.`;
  }
  if (status === 413) return "That file is too large for the API. Try a smaller image or a single-page PDF.";
  if (status === 400) {
    return `${name} couldn't read that file${apiMessage ? ` (${apiMessage.slice(0, 160)})` : ""}. Try a clearer image or a different file type.`;
  }
  if (status === 404) return `${name} doesn't recognise the model this demo asks for. The demo may need updating.`;
  if (status >= 500) return `${name} is having trouble right now. Please try again in a minute.`;
  return `${name} returned an unexpected error (HTTP ${status}).`;
}

function apiMessageOf(body: unknown): string | undefined {
  const m = (body as { error?: { message?: unknown } })?.error?.message;
  return typeof m === "string" ? m : undefined;
}

export async function extractInvoice(opts: {
  provider: Provider;
  apiKey: string;
  file: Payload;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Invoice> {
  const { provider, apiKey, file, signal } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  if (!apiKey.trim()) throw new ExtractionError("Paste an API key first.");
  if (provider === "openai" && !IMAGE_TYPES.includes(file.mediaType)) {
    throw new ExtractionError("OpenAI needs an image here. Use a PNG or JPEG, or a PDF (page 1 is converted).");
  }
  if (provider === "anthropic" && ![...IMAGE_TYPES, "application/pdf"].includes(file.mediaType)) {
    throw new ExtractionError("Please use a PDF, PNG, JPEG, GIF or WebP file.");
  }
  const key = apiKey.trim();
  const { url, init } =
    provider === "openai" ? buildOpenAIRequest(key, file) : buildAnthropicRequest(key, file);

  let res: Response;
  try {
    res = await doFetch(url, { ...init, signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ExtractionError(
      "Couldn't reach the API. Check your internet connection (or an ad-blocker blocking the request) and try again.",
    );
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body; handled below
  }
  if (!res.ok) throw new ExtractionError(friendlyHttpError(provider, res.status, apiMessageOf(body)));

  const text = provider === "openai" ? readOpenAIText(body) : readAnthropicText(body);
  try {
    return parseInvoice(text);
  } catch (e) {
    if (e instanceof ParseError) throw new ExtractionError(e.message);
    throw e;
  }
}
