import { z } from "zod";

const DEFAULT_ESCO_API_BASE_URL = "https://ec.europa.eu/esco/api";
/** Current public ESCO release (10 December 2025). */
export const ESCO_VERSION = "v1.2.1";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RELATION_TIMEOUT_MS = 20_000;
const ESCO_URI_PATTERN = /^https?:\/\/data\.europa\.eu\/esco\/(occupation|skill)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type EscoConceptType = "occupation" | "skill";

export type EscoConcept = {
  uri: string;
  preferredLabel: string;
  type: EscoConceptType;
  code?: string;
  source: "official_esco_api" | "verified_fallback_catalog";
  version: typeof ESCO_VERSION;
};

export type EscoSearchResult = {
  mode: "live" | "fallback";
  concepts: EscoConcept[];
  version: typeof ESCO_VERSION;
  warning?: string;
};

export type EscoOccupationSkillRelation = {
  uri: string;
  preferredLabel: string;
  relation: "essential" | "optional";
  source: "official_esco_api";
  version: typeof ESCO_VERSION;
};

export type EscoOccupationSkillRelationsResult = {
  status: "available" | "partial" | "unavailable";
  skills: EscoOccupationSkillRelation[];
  warning?: { de: string; en: string };
};

export class EscoIntegrationError extends Error {
  readonly code: "invalid_input" | "provider_rejected" | "provider_unavailable" | "invalid_response";
  readonly status: number;
  readonly retryable: boolean;

  constructor(
    code: EscoIntegrationError["code"],
    message: string,
    options: { status: number; retryable: boolean },
  ) {
    super(message);
    this.name = "EscoIntegrationError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

const EscoApiResultSchema = z
  .object({
    uri: z.string(),
    title: z.string().optional(),
    preferredLabel: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    className: z.string().optional(),
    type: z.string().optional(),
    code: z.string().optional(),
  })
  .passthrough();

const EscoSearchResponseSchema = z
  .object({
    _embedded: z
      .object({
        results: z.array(EscoApiResultSchema).default([]),
      })
      .optional(),
  })
  .passthrough();

const EscoRelatedResponseSchema = z
  .object({
    total: z.number().int().nonnegative().optional(),
    _embedded: z.record(z.string(), z.array(EscoApiResultSchema)).optional(),
  })
  .passthrough();

/**
 * These UUIDs and labels are checked against ESCO v1.2.1. They are shown only
 * when the live API cannot be reached and are never generated from user text.
 */
const VERIFIED_FALLBACK_OCCUPATIONS = [
  {
    uri: "http://data.europa.eu/esco/occupation/f2b15a0e-e65a-438a-affb-29b9d50b77d1",
    en: "software developer",
    de: "Softwareentwickler/Softwareentwicklerin",
    code: "2512.4",
  },
  {
    uri: "http://data.europa.eu/esco/occupation/d3edb8f8-3a06-47a0-8fb9-9b212c006aa2",
    en: "data analyst",
    de: "Datenanalytiker/Datenanalytikerin",
    code: "2511.3",
  },
  {
    uri: "http://data.europa.eu/esco/occupation/d3e32e5e-7f24-48e3-b939-e4f800eb62fb",
    en: "human resources officer",
    de: "Personalberater/Personalberaterin",
    code: "2423.3",
  },
] as const;

function normalizedPhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function phraseContains(haystack: string, needle: string): boolean {
  return needle.length >= 3 && ` ${haystack} `.includes(` ${needle} `);
}

function fallbackConcepts(query: string, locale: "de" | "en", type: EscoConceptType): EscoConcept[] {
  if (type !== "occupation") return [];
  const normalizedQuery = normalizedPhrase(query);
  if (!normalizedQuery) return [];
  return VERIFIED_FALLBACK_OCCUPATIONS.filter((entry) => {
    return [entry.en, entry.de]
      .map(normalizedPhrase)
      .some(
        (label) => phraseContains(normalizedQuery, label) || phraseContains(label, normalizedQuery),
      );
  }).map((entry) => ({
    uri: entry.uri,
    preferredLabel: entry[locale],
    type: "occupation",
    code: entry.code,
    source: "verified_fallback_catalog",
    version: ESCO_VERSION,
  }));
}

function labelFor(
  payload: z.infer<typeof EscoApiResultSchema>,
  locale: "de" | "en",
): string | null {
  if (typeof payload.preferredLabel === "string" && payload.preferredLabel.trim()) {
    return payload.preferredLabel.trim();
  }
  if (payload.preferredLabel && typeof payload.preferredLabel === "object") {
    const localized = payload.preferredLabel[locale] ?? payload.preferredLabel.en ?? payload.preferredLabel.de;
    if (localized?.trim()) return localized.trim();
  }
  return payload.title?.trim() || null;
}

function normalizeLiveConcept(
  payload: z.infer<typeof EscoApiResultSchema>,
  locale: "de" | "en",
  requestedType: EscoConceptType,
): EscoConcept | null {
  const uriMatch = payload.uri.match(ESCO_URI_PATTERN);
  if (!uriMatch || uriMatch[1]?.toLocaleLowerCase() !== requestedType) return null;
  const preferredLabel = labelFor(payload, locale);
  if (!preferredLabel) return null;
  return {
    uri: payload.uri,
    preferredLabel,
    type: requestedType,
    ...(payload.code?.trim() ? { code: payload.code.trim() } : {}),
    source: "official_esco_api",
    version: ESCO_VERSION,
  };
}

function withTimeout(externalSignal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  dispose: () => void;
} {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abortFromExternal();
  externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

class EscoUnavailableError extends Error {}

export async function searchEscoConcepts(
  input: {
    query: string;
    locale: "de" | "en";
    type?: EscoConceptType;
    limit?: number;
  },
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<EscoSearchResult> {
  if (typeof window !== "undefined") {
    throw new EscoIntegrationError("invalid_input", "ESCO search is server-only.", {
      status: 500,
      retryable: false,
    });
  }
  const query = input.query.trim();
  if (query.length < 2 || query.length > 160) {
    throw new EscoIntegrationError("invalid_input", "Enter a valid ESCO search term.", {
      status: 400,
      retryable: false,
    });
  }
  const type = input.type ?? "occupation";
  const limit = Math.min(Math.max(input.limit ?? 8, 1), 20);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const configuredBase = process.env.ESCO_API_BASE_URL?.trim() || DEFAULT_ESCO_API_BASE_URL;
    const url = new URL(`${configuredBase.replace(/\/$/u, "")}/search`);
    url.searchParams.set("text", query);
    url.searchParams.set("type", type);
    url.searchParams.set("language", input.locale);
    url.searchParams.set("selectedVersion", ESCO_VERSION);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("full", "false");
    url.searchParams.set("viewObsolete", "false");

    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: timeout.signal,
      });
    } catch (error) {
      if (error instanceof EscoIntegrationError) throw error;
      throw new EscoUnavailableError();
    }

    if (!response.ok) {
      if (response.status >= 500 || response.status === 429) throw new EscoUnavailableError();
      throw new EscoIntegrationError("provider_rejected", "ESCO rejected the search request.", {
        status: 502,
        retryable: false,
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new EscoIntegrationError("invalid_response", "ESCO returned an invalid response.", {
        status: 502,
        retryable: true,
      });
    }
    const parsed = EscoSearchResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new EscoIntegrationError("invalid_response", "ESCO returned an invalid response.", {
        status: 502,
        retryable: true,
      });
    }

    const concepts: EscoConcept[] = [];
    const seenUris = new Set<string>();
    for (const item of parsed.data._embedded?.results ?? []) {
      const concept = normalizeLiveConcept(item, input.locale, type);
      if (!concept || seenUris.has(concept.uri)) continue;
      seenUris.add(concept.uri);
      concepts.push(concept);
    }
    return { mode: "live", concepts: concepts.slice(0, limit), version: ESCO_VERSION };
  } catch (error) {
    if (error instanceof EscoUnavailableError) {
      return {
        mode: "fallback",
        concepts: fallbackConcepts(query, input.locale, type).slice(0, limit),
        version: ESCO_VERSION,
        warning: input.locale === "de"
          ? "ESCO ist vorübergehend nicht erreichbar. Gezeigt wird ein kleiner, verifizierter Offline-Katalog."
          : "ESCO is temporarily unavailable. A small verified offline catalog is shown.",
      };
    }
    if (error instanceof EscoIntegrationError) throw error;
    throw new EscoIntegrationError("provider_unavailable", "ESCO is temporarily unavailable.", {
      status: 502,
      retryable: true,
    });
  } finally {
    timeout.dispose();
  }
}

/** Retrieve authoritative occupation-to-skill edges from the ESCO API. */
export async function getEscoOccupationSkillRelations(
  input: {
    occupationUri: string;
    locale: "de" | "en";
    limitPerRelation?: number;
  },
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<EscoOccupationSkillRelationsResult> {
  if (typeof window !== "undefined") {
    throw new EscoIntegrationError("invalid_input", "ESCO relations are server-only.", {
      status: 500,
      retryable: false,
    });
  }
  const occupationMatch = input.occupationUri.match(ESCO_URI_PATTERN);
  if (occupationMatch?.[1]?.toLocaleLowerCase() !== "occupation") {
    throw new EscoIntegrationError("invalid_input", "Enter a valid ESCO occupation URI.", {
      status: 400,
      retryable: false,
    });
  }
  const limit = Math.min(Math.max(input.limitPerRelation ?? 50, 1), 50);
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = withTimeout(
    options.signal,
    options.timeoutMs ?? DEFAULT_RELATION_TIMEOUT_MS,
  );
  const relations = [
    { api: "hasEssentialSkill", value: "essential" as const },
    { api: "hasOptionalSkill", value: "optional" as const },
  ];

  try {
    const configuredBase = process.env.ESCO_API_BASE_URL?.trim() || DEFAULT_ESCO_API_BASE_URL;
    const settled = await Promise.allSettled(relations.map(async (relation) => {
      const skills = new Map<string, EscoOccupationSkillRelation>();
      let truncated = false;
      const maxPages = 4;
      for (let page = 0; page < maxPages; page += 1) {
        const offset = page * limit;
        const url = new URL(`${configuredBase.replace(/\/$/u, "")}/resource/related`);
        url.searchParams.set("uri", input.occupationUri);
        url.searchParams.set("relation", relation.api);
        url.searchParams.set("language", input.locale);
        url.searchParams.set("selectedVersion", ESCO_VERSION);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: timeout.signal,
        });
        if (!response.ok) throw new EscoUnavailableError();
        const parsed = EscoRelatedResponseSchema.safeParse(await response.json());
        if (!parsed.success) throw new EscoUnavailableError();
        const embedded = parsed.data._embedded?.[relation.api] ?? [];
        for (const skill of embedded
          .map((item) => normalizeLiveConcept(item, input.locale, "skill"))
          .filter((skill): skill is EscoConcept => skill !== null)
          .map((skill): EscoOccupationSkillRelation => ({
            uri: skill.uri,
            preferredLabel: skill.preferredLabel,
            relation: relation.value,
            source: "official_esco_api",
            version: ESCO_VERSION,
          }))) {
          skills.set(skill.uri, skill);
        }
        const total = parsed.data.total;
        if ((total !== undefined && skills.size >= total) || embedded.length < limit) break;
        if (page === maxPages - 1) truncated = true;
      }
      return { skills: [...skills.values()], truncated };
    }));

    const skills = new Map<string, EscoOccupationSkillRelation>();
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      for (const skill of result.value.skills) {
        const prior = skills.get(skill.uri);
        if (!prior || skill.relation === "essential") skills.set(skill.uri, skill);
      }
    }
    const failedCount = settled.filter((result) => result.status === "rejected").length;
    const truncated = settled.some(
      (result) => result.status === "fulfilled" && result.value.truncated,
    );
    return {
      status: failedCount === relations.length
        ? "unavailable"
        : failedCount > 0 || truncated
          ? "partial"
          : "available",
      // Each relation is already bounded by `maxPages * limit`. Return the
      // complete bounded set so optional relations are not silently dropped.
      skills: [...skills.values()],
      ...(failedCount > 0 || truncated
        ? {
          warning: failedCount > 0
            ? {
              de: "Ein Teil der offiziellen ESCO-Skill-Beziehungen ist vorübergehend nicht verfügbar.",
              en: "Some official ESCO skill relations are temporarily unavailable.",
            }
            : {
              de: "Die offizielle ESCO-Relation ist sehr umfangreich; es wird eine begrenzte Teilmenge gezeigt.",
              en: "The official ESCO relation is extensive; a bounded subset is shown.",
            },
        }
        : {}),
    };
  } catch (error) {
    if (error instanceof EscoIntegrationError) throw error;
    return {
      status: "unavailable",
      skills: [],
      warning: {
        de: "Offizielle ESCO-Skill-Beziehungen sind vorübergehend nicht verfügbar.",
        en: "Official ESCO skill relations are temporarily unavailable.",
      },
    };
  } finally {
    timeout.dispose();
  }
}

export function safeEscoErrorPayload(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof EscoIntegrationError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "provider_unavailable",
    message: "ESCO is temporarily unavailable.",
    retryable: true,
  };
}
