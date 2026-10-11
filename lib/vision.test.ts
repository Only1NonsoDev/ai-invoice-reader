import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildAnthropicRequest,
  buildOpenAIRequest,
  ExtractionError,
  extractInvoice,
  friendlyHttpError,
  readAnthropicText,
} from "./vision";

const png = { mediaType: "image/png", base64: "AAAA" };
const pdf = { mediaType: "application/pdf", base64: "BBBB" };
const reply = JSON.stringify({ vendor: "Acme", total: 10, line_items: [] });

function fakeFetch(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

test("OpenAI request has image input and JSON mode", () => {
  const { url, init } = buildOpenAIRequest("sk-test", png);
  assert.equal(url, "https://api.openai.com/v1/chat/completions");
  const body = JSON.parse(init.body as string);
  assert.equal(body.model, "gpt-4o-mini");
  assert.deepEqual(body.response_format, { type: "json_object" });
  assert.equal(body.messages[0].content[1].image_url.url, "data:image/png;base64,AAAA");
  assert.equal((init.headers as Record<string, string>).authorization, "Bearer sk-test");
});

test("Anthropic request sets the browser header and picks image vs document", () => {
  const img = buildAnthropicRequest("k", png);
  assert.equal((img.init.headers as Record<string, string>)["anthropic-dangerous-direct-browser-access"], "true");
  assert.equal(JSON.parse(img.init.body as string).messages[0].content[0].type, "image");
  const doc = buildAnthropicRequest("k", pdf);
  assert.equal(JSON.parse(doc.init.body as string).messages[0].content[0].type, "document");
});

test("extractInvoice parses both providers' replies", async () => {
  const openai = await extractInvoice({
    provider: "openai",
    apiKey: "k",
    file: png,
    fetchImpl: fakeFetch(200, { choices: [{ message: { content: reply } }] }),
  });
  assert.equal(openai.vendor, "Acme");
  const anthropic = await extractInvoice({
    provider: "anthropic",
    apiKey: "k",
    file: pdf,
    fetchImpl: fakeFetch(200, { content: [{ type: "text", text: "```json\n" + reply + "\n```" }] }),
  });
  assert.equal(anthropic.total, 10);
});

test("HTTP errors become friendly messages", async () => {
  await assert.rejects(
    extractInvoice({ provider: "openai", apiKey: "bad", file: png, fetchImpl: fakeFetch(401, { error: { message: "x" } }) }),
    /didn't accept that API key/,
  );
  assert.match(friendlyHttpError("anthropic", 429), /limit/);
  assert.match(friendlyHttpError("openai", 503), /trouble/);
});

test("network failure and bad replies are friendly", async () => {
  const down = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  await assert.rejects(extractInvoice({ provider: "openai", apiKey: "k", file: png, fetchImpl: down }), /Couldn't reach/);
  await assert.rejects(
    extractInvoice({
      provider: "openai",
      apiKey: "k",
      file: png,
      fetchImpl: fakeFetch(200, { choices: [{ message: { content: "no json here" } }] }),
    }),
    /valid JSON/,
  );
});

test("guards: empty key, PDF to OpenAI, empty Anthropic reply", async () => {
  await assert.rejects(extractInvoice({ provider: "openai", apiKey: " ", file: png }), ExtractionError);
  await assert.rejects(extractInvoice({ provider: "openai", apiKey: "k", file: pdf }), /needs an image/);
  assert.throws(() => readAnthropicText({ content: [] }), ExtractionError);
});
