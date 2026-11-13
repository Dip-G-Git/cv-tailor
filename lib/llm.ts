import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const client = new Anthropic();

export class LlmError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

type UserContent = string | Anthropic.ContentBlockParam[];

function toLlmError(err: unknown): unknown {
  if (err instanceof Anthropic.AuthenticationError) {
    return new LlmError("Invalid or missing ANTHROPIC_API_KEY. Check .env.local.", 500);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError("The AI service is rate-limited. Please wait a minute and retry.", 429);
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmError(`AI service error (${err.status ?? "network"}): ${err.message}`);
  }
  if (err instanceof Error && /authentication method/i.test(err.message)) {
    return new LlmError("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the server.", 500);
  }
  return err;
}

function checkStopReason(stopReason: Anthropic.Message["stop_reason"]) {
  if (stopReason === "refusal") {
    throw new LlmError("The AI declined this request. Try rephrasing your input.", 422);
  }
  if (stopReason === "max_tokens") {
    throw new LlmError("The AI response was cut off (too long). Try asking for less at once.", 502);
  }
}

function requestParams<T extends z.ZodType>(opts: { system: string; user: UserContent; schema: T; maxTokens?: number }) {
  return {
    model: MODEL,
    max_tokens: opts.maxTokens ?? 16000,
    // The system prompt is identical across requests, so cache it.
    system: [{ type: "text" as const, text: opts.system, cache_control: { type: "ephemeral" as const } }],
    messages: [{ role: "user" as const, content: opts.user }],
    output_config: { format: zodOutputFormat(opts.schema), effort: "medium" as const },
  };
}

/** One Claude call whose response is validated against `schema`. */
export async function callStructured<T extends z.ZodType>(opts: {
  system: string;
  user: UserContent;
  schema: T;
  maxTokens?: number;
}): Promise<z.infer<T>> {
  let response;
  try {
    response = await client.messages.parse(requestParams(opts));
  } catch (err) {
    throw toLlmError(err);
  }
  checkStopReason(response.stop_reason);
  if (!response.parsed_output) {
    throw new LlmError("The AI returned output that didn't match the expected format.", 502);
  }
  return response.parsed_output as z.infer<T>;
}

/**
 * Streaming version of callStructured: `onText` receives the raw JSON
 * generated so far (for showing a field while it's being written), and the
 * validated object is returned at the end.
 */
export async function streamStructured<T extends z.ZodType>(opts: {
  system: string;
  user: UserContent;
  schema: T;
  maxTokens?: number;
  signal?: AbortSignal;
  onText: (jsonSoFar: string) => void;
}): Promise<z.infer<T>> {
  let message;
  try {
    const stream = client.messages.stream(requestParams({ ...opts, maxTokens: opts.maxTokens ?? 32000 }), {
      signal: opts.signal,
    });
    let buffer = "";
    stream.on("text", (delta) => {
      buffer += delta;
      opts.onText(buffer);
    });
    message = await stream.finalMessage();
  } catch (err) {
    throw toLlmError(err);
  }
  checkStopReason(message.stop_reason);

  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LlmError("The AI returned output that wasn't valid JSON.", 502);
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    throw new LlmError("The AI returned output that didn't match the expected format.", 502);
  }
  return parsed.data as z.infer<T>;
}
