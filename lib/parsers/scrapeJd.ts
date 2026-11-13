import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_HTML_BYTES = 3 * 1024 * 1024;

/** Blocks requests to localhost / private networks (SSRF protection). */
async function assertPublicUrl(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  for (const { address } of addresses) {
    const private4 =
      /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
    const private6 = /^(::1|::$|fc|fd|fe80|::ffff:(10\.|127\.|192\.168\.|169\.254\.))/i;
    if (private4.test(address) || private6.test(address)) {
      throw new Error("That URL points to a private network address.");
    }
  }
}

export async function scrapeJobDescription(rawUrl: string): Promise<string> {
  let url = new URL(rawUrl);
  await assertPublicUrl(url);

  // Follow redirects manually so each hop is checked.
  let res: Response | undefined;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      await assertPublicUrl(url);
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    throw new Error(`The site returned ${res?.status ?? "no response"}.`);
  }

  const html = (await res.text()).slice(0, MAX_HTML_BYTES);
  const { JSDOM } = await import("jsdom");
  const { Readability } = await import("@mozilla/readability");
  const dom = new JSDOM(html, { url: url.toString() });
  const article = new Readability(dom.window.document).parse();
  const text = (article?.textContent ?? dom.window.document.body?.textContent ?? "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();

  if (text.length < 200) {
    throw new Error("Couldn't find a job description on that page (it may require login or JavaScript).");
  }
  return text.slice(0, 30_000);
}
