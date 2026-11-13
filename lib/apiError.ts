import "server-only";
import { ZodError } from "zod";
import { LlmError } from "./llm";

export function errorResponse(err: unknown): Response {
  if (err instanceof LlmError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return Response.json({ error: "Invalid request data.", details: err.issues }, { status: 400 });
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error.";
  return Response.json({ error: message }, { status: 500 });
}
