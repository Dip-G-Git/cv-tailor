/**
 * Reads the (possibly unfinished) value of a top-level string property from a
 * JSON document that is still being streamed, e.g. `{"reply":"Hello, wor` →
 * "Hello, wor". Returns null until the property has started.
 */
export function extractPartialString(json: string, key: string): string | null {
  const start = json.match(new RegExp(`"${key}"\\s*:\\s*"`));
  if (start?.index === undefined) return null;
  const escapes: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" };
  let out = "";
  let i = start.index + start[0].length;
  while (i < json.length) {
    const c = json[i];
    if (c === '"') break; // value complete
    if (c === "\\") {
      if (i + 1 >= json.length) break; // escape not finished yet
      const next = json[i + 1];
      if (next === "u") {
        if (i + 6 > json.length) break;
        out += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      out += escapes[next] ?? next;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}
