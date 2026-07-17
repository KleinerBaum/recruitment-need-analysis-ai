import { createHash, randomBytes } from "node:crypto";
import { isIP } from "node:net";

import {
  RecruitmentKnowledgeResponseSchema,
  type RecruitmentKnowledgeRequest,
  type RecruitmentKnowledgeResponse,
} from "@/lib/contracts";

const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 20;
const MIN_RATE_LIMIT = 1;
const MAX_RATE_LIMIT = 120;
const DEFAULT_CACHE_TTL_MS = 5 * 60_000;
const MIN_CACHE_TTL_MS = 1_000;
const MAX_CACHE_TTL_MS = 15 * 60_000;
const DEFAULT_CACHE_MAX_ENTRIES = 100;
const MAX_CACHE_ENTRIES = 100;
const MAX_RATE_LIMIT_BUCKETS = 5_000;
const CLIENT_KEY_SALT = randomBytes(16);

type Environment = Record<string, string | undefined>;

export type KnowledgeGuardConfig = {
  rateLimit: number;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  trustProxyHeaders: boolean;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type CacheEntry = {
  expiresAt: number;
  response: RecruitmentKnowledgeResponse;
};

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined || !/^\d+$/u.test(raw.trim())) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function getKnowledgeGuardConfig(
  environment: Environment = process.env,
): KnowledgeGuardConfig {
  return {
    rateLimit: boundedInteger(
      environment.KNOWLEDGE_RATE_LIMIT_PER_MINUTE,
      DEFAULT_RATE_LIMIT,
      MIN_RATE_LIMIT,
      MAX_RATE_LIMIT,
    ),
    cacheTtlMs: boundedInteger(
      environment.KNOWLEDGE_CACHE_TTL_MS,
      DEFAULT_CACHE_TTL_MS,
      MIN_CACHE_TTL_MS,
      MAX_CACHE_TTL_MS,
    ),
    cacheMaxEntries: boundedInteger(
      environment.KNOWLEDGE_CACHE_MAX_ENTRIES,
      DEFAULT_CACHE_MAX_ENTRIES,
      1,
      MAX_CACHE_ENTRIES,
    ),
    trustProxyHeaders: environment.KNOWLEDGE_TRUST_PROXY_HEADERS?.trim().toLowerCase() === "true",
  };
}

/**
 * Hash only a syntactically valid IP from proxy headers when the deployment
 * explicitly confirms that its edge overwrites those headers. Otherwise every
 * request shares one anonymous bucket instead of accepting a spoofable ID. The
 * in-memory limiter never retains a raw address or another request header.
 */
export function knowledgeRateLimitKey(
  request: Request,
  trustProxyHeaders = false,
): string {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim(),
  ];
  const address = trustProxyHeaders
    ? candidates.find((candidate) =>
      candidate !== null && candidate !== undefined && isIP(candidate.trim()) !== 0
    )?.trim() ?? "anonymous"
    : "anonymous";

  return createHash("sha256")
    .update(CLIENT_KEY_SALT)
    .update(address)
    .digest("hex");
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly maximumBuckets = MAX_RATE_LIMIT_BUCKETS) {}

  consume(
    key: string,
    limit: number,
    now = Date.now(),
  ): RateLimitDecision {
    this.cleanup(now);
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      if (!bucket && this.buckets.size >= this.maximumBuckets) {
        const oldestKey = this.buckets.keys().next().value as string | undefined;
        if (oldestKey !== undefined) this.buckets.delete(oldestKey);
      }
      bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    } else {
      // Refresh insertion order so capacity eviction removes the least recently
      // used active bucket rather than a frequently used one.
      this.buckets.delete(key);
    }

    if (bucket.count >= limit) {
      this.buckets.set(key, bucket);
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt: bucket.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
      };
    }

    bucket.count += 1;
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: 0,
    };
  }

  clear(): void {
    this.buckets.clear();
  }

  private cleanup(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

/**
 * Build a stable opaque key from schema-validated, typed recruitment fields.
 * The free-form `query` is intentionally excluded so it is never retained and
 * cannot fragment the cache with content that the provider does not receive.
 */
export function recruitmentKnowledgeCacheKey(
  request: RecruitmentKnowledgeRequest,
): string {
  const canonicalRequest = {
    version: 1,
    locale: request.locale,
    roleTitle: request.roleTitle ?? null,
    occupationUri: request.occupationUri ?? null,
    currentSkills: request.currentSkills,
    seniority: request.seniority ?? null,
    companyLocationCode: request.companyLocationCode ?? null,
    corpora: request.corpora,
    maxResultsPerCorpus: request.maxResultsPerCorpus,
  };

  return createHash("sha256")
    .update(JSON.stringify(canonicalRequest))
    .digest("hex");
}

export class BoundedKnowledgeResponseCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(
    request: RecruitmentKnowledgeRequest,
    now = Date.now(),
  ): RecruitmentKnowledgeResponse | undefined {
    this.cleanup(now);
    const key = recruitmentKnowledgeCacheKey(request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Refresh insertion order for deterministic least-recently-used eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return RecruitmentKnowledgeResponseSchema.parse(entry.response);
  }

  set(
    request: RecruitmentKnowledgeRequest,
    response: RecruitmentKnowledgeResponse,
    options: { ttlMs: number; maxEntries: number },
    now = Date.now(),
  ): void {
    this.cleanup(now);
    const key = recruitmentKnowledgeCacheKey(request);
    const safeResponse = RecruitmentKnowledgeResponseSchema.parse(response);
    this.entries.delete(key);

    const maximumEntries = Math.min(
      MAX_CACHE_ENTRIES,
      Math.max(1, options.maxEntries),
    );
    while (this.entries.size >= maximumEntries) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }

    this.entries.set(key, {
      expiresAt: now + Math.min(MAX_CACHE_TTL_MS, Math.max(MIN_CACHE_TTL_MS, options.ttlMs)),
      // Only the validated public response contract is retained. Provider IDs,
      // credentials, request headers, and raw provider responses cannot enter.
      response: safeResponse,
    });
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }

  private cleanup(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

/** Cache only stable retrieval outcomes; transient or configuration-degraded
 * responses must remain refreshable immediately. */
export function isKnowledgeResponseCacheable(
  response: RecruitmentKnowledgeResponse,
): boolean {
  return ["suggestions_available", "no_suggestions"].includes(response.status) &&
    response.corpora.every((corpus) =>
      corpus.status === "available" || corpus.status === "no_results"
    );
}

export const knowledgeRateLimiter = new FixedWindowRateLimiter();
export const knowledgeResponseCache = new BoundedKnowledgeResponseCache();
