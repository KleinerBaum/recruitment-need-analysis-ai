import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_SOURCE_CHARS = 100_000;
const REQUEST_TIMEOUT_MS = 8_000;

export class JobSourceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "JobSourceError";
  }
}

function isPrivateIp(address: string): boolean {
  if (isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    const [first, second] = parts;
    return first === 0 || first === 10 || first === 127 || first! >= 224
      || (first === 169 && second === 254)
      || (first === 172 && second! >= 16 && second! <= 31)
      || (first === 192 && second === 168);
  }
  const value = address.toLocaleLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd")
    || value.startsWith("fe80:") || value.startsWith("::ffff:127.")
    || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new JobSourceError("Local and private network URLs are not allowed.");
  }
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new JobSourceError("Local and private network URLs are not allowed.");
    return;
  }
  let addresses: string[];
  try {
    addresses = [...await resolve4(hostname), ...await resolve6(hostname)];
  } catch {
    throw new JobSourceError("The URL host could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(isPrivateIp)) {
    throw new JobSourceError("The URL must resolve to a public internet host.");
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'");
}

export function extractJobAdText(content: string, contentType: string): string {
  const isHtml = /(?:text\/html|application\/xhtml\+xml)/iu.test(contentType)
    || /<\/?[a-z][\s\S]*>/iu.test(content);
  const text = isHtml
    ? decodeEntities(content
      .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/giu, " ")
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<\/(p|div|li|h[1-6]|section|article|tr)>/giu, "\n")
      .replace(/<[^>]+>/gu, " "))
    : content;
  return text.replace(/\r\n?/gu, "\n").replace(/[\t \f\v]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n").trim().slice(0, MAX_SOURCE_CHARS);
}

async function responseTextWithinLimit(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_SOURCE_BYTES) {
    throw new JobSourceError("The source page is too large. Please paste the relevant job ad text instead.", 413);
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new JobSourceError("The source page is too large. Please paste the relevant job ad text instead.", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export async function importJobAdUrl(rawUrl: string): Promise<{ text: string; sourceName: string; url: string }> {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    throw new JobSourceError("Please enter a valid URL.");
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    throw new JobSourceError("Only HTTP and HTTPS job-ad URLs are supported.");
  }

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicHost(target.hostname);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(target, {
        redirect: "manual",
        signal: controller.signal,
        headers: { accept: "text/html,text/plain;q=0.9" },
      });
    } catch {
      throw new JobSourceError("The job-ad URL could not be retrieved.", 502);
    } finally {
      clearTimeout(timeout);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new JobSourceError("The job-ad URL returned an invalid redirect.", 502);
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) throw new JobSourceError("The job-ad URL could not be retrieved.", 502);
    const text = extractJobAdText(await responseTextWithinLimit(response), response.headers.get("content-type") ?? "");
    if (text.length < 20) throw new JobSourceError("No readable job-ad text was found at this URL.");
    return { text, sourceName: target.hostname, url: target.toString() };
  }
  throw new JobSourceError("The job-ad URL redirects too many times.", 502);
}
