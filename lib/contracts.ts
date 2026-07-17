import { z } from "zod";

export const LocaleSchema = z.enum(["de", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

const HmacSha256SignatureSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);

export const EscoOccupationAttestationSchema = z.strictObject({
  scheme: z.literal("hmac-sha256-v1"),
  scope: z.literal("occupation"),
  signature: HmacSha256SignatureSchema,
});
export type EscoOccupationAttestation = z.infer<
  typeof EscoOccupationAttestationSchema
>;

export const EscoSkillRelationAttestationSchema = z.strictObject({
  scheme: z.literal("hmac-sha256-v1"),
  scope: z.literal("skill_relation"),
  relation: z.enum(["essential", "optional"]),
  signature: HmacSha256SignatureSchema,
});
export type EscoSkillRelationAttestation = z.infer<
  typeof EscoSkillRelationAttestationSchema
>;

export const EscoAttestationSchema = z.discriminatedUnion("scope", [
  EscoOccupationAttestationSchema,
  EscoSkillRelationAttestationSchema,
]);
export type EscoAttestation = z.infer<typeof EscoAttestationSchema>;

export const LocalizedTextSchema = z.strictObject({
  de: z.string().trim().min(1).max(1_000),
  en: z.string().trim().min(1).max(1_000),
});
export type LocalizedText = z.infer<typeof LocalizedTextSchema>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const VACANCY_FIELD_IDS = [
  "company.name",
  "company.context",
  "role.title",
  "role.purpose",
  "role.seniority",
  "role.employmentType",
  "role.startDate",
  "role.headcount",
  "role.location",
  "role.workModel",
  "role.remoteShare",
  "role.workingHours",
  "role.travel",
  "role.leadershipScope",
  "tasks.outcomes",
  "tasks.responsibilities",
  "requirements.mustHaveSkills",
  "requirements.niceToHaveSkills",
  "requirements.experience",
  "requirements.education",
  "requirements.languages",
  "requirements.certifications",
  "compensation.salaryRange",
  "compensation.benefits",
  "process.interviewStages",
  "process.decisionOwners",
  "process.timeline",
  "success.metrics",
] as const;

export const VacancyFieldIdSchema = z.enum(VACANCY_FIELD_IDS);
export type VacancyFieldId = z.infer<typeof VacancyFieldIdSchema>;

export const VacancySectionSchema = z.enum([
  "company",
  "role",
  "tasks",
  "requirements",
  "compensation",
  "process",
  "success",
]);
export type VacancySection = z.infer<typeof VacancySectionSchema>;

export const EvidenceSourceTypeSchema = z.enum([
  "pasted_text",
  "uploaded_file",
  "source_url",
  "user_answer",
  "esco",
]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;

export const EvidenceLocatorSchema = z
  .strictObject({
    page: z.number().int().positive().optional(),
    start: z.number().int().nonnegative().optional(),
    end: z.number().int().positive().optional(),
    url: z.string().url().optional(),
  })
  .superRefine((locator, context) => {
    const hasStart = locator.start !== undefined;
    const hasEnd = locator.end !== undefined;
    if (hasStart !== hasEnd) {
      context.addIssue({
        code: "custom",
        message: "start and end must be provided together",
      });
    }
    if (hasStart && hasEnd && locator.end! <= locator.start!) {
      context.addIssue({
        code: "custom",
        message: "end must be greater than start",
      });
    }
  });
export type EvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;

export const EvidenceSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(160),
    sourceId: z.string().trim().min(1).max(160),
    sourceType: EvidenceSourceTypeSchema,
    quote: z.string().trim().min(1).max(4_000),
    locator: EvidenceLocatorSchema.default({}),
    language: LocaleSchema.optional(),
    escoAttestation: EscoSkillRelationAttestationSchema.optional(),
  })
  .superRefine((evidence, context) => {
    if (evidence.sourceType === "esco" && !evidence.escoAttestation) {
      context.addIssue({
        code: "custom",
        path: ["escoAttestation"],
        message: "ESCO evidence requires a signed skill-relation attestation",
      });
    }
    if (evidence.sourceType !== "esco" && evidence.escoAttestation) {
      context.addIssue({
        code: "custom",
        path: ["escoAttestation"],
        message: "Only ESCO evidence may carry an ESCO attestation",
      });
    }
  });
export type Evidence = z.infer<typeof EvidenceSchema>;

export const FactStatusSchema = z.enum([
  "missing",
  "explicit",
  "inferred",
  "user_confirmed",
  "conflict",
  "not_applicable",
  "declined",
]);
export type FactStatus = z.infer<typeof FactStatusSchema>;

export const FactProvenanceSchema = z.strictObject({
  origin: z.enum(["job_ad", "user", "esco", "derived", "system"]),
  method: z.enum([
    "direct",
    "structured_extraction",
    "user_entry",
    "deterministic_rule",
    "esco_lookup",
  ]),
  sourceIds: z.array(z.string().trim().min(1).max(160)).max(75).default([]),
  model: z.string().trim().min(1).max(160).optional(),
  promptVersion: z.string().trim().min(1).max(80).optional(),
  recordedAt: z.string().datetime({ offset: true }),
});
export type FactProvenance = z.infer<typeof FactProvenanceSchema>;

export const VacancyFactSchema = z
  .strictObject({
    fieldId: VacancyFieldIdSchema,
    value: JsonValueSchema,
    status: FactStatusSchema,
    evidence: z.array(EvidenceSchema).max(75).default([]),
    confidence: z.number().min(0).max(1),
    provenance: FactProvenanceSchema,
    hasConflict: z.boolean().default(false),
    conflictDescription: LocalizedTextSchema.optional(),
  })
  .superRefine((fact, context) => {
    if (
      ["missing", "not_applicable", "declined"].includes(fact.status) &&
      fact.value !== null
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${fact.status} facts must have a null value`,
      });
    }
    if (
      ["explicit", "inferred", "user_confirmed", "conflict"].includes(
        fact.status,
      ) &&
      fact.value === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${fact.status} facts require a non-null value`,
      });
    }
    if (
      ["explicit", "inferred", "conflict"].includes(fact.status) &&
      fact.evidence.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence"],
        message: `${fact.status} facts require supporting evidence`,
      });
    }
    if (fact.status === "conflict" && !fact.hasConflict) {
      context.addIssue({
        code: "custom",
        path: ["hasConflict"],
        message: "conflict facts must set hasConflict to true",
      });
    }
    if (fact.hasConflict && fact.status !== "conflict") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "hasConflict facts must use conflict status",
      });
    }
  });
export type VacancyFact = z.infer<typeof VacancyFactSchema>;

export const EscoConceptSchema = z
  .strictObject({
    uri: z.string().url(),
    conceptType: z.enum(["occupation", "skill"]),
    preferredLabel: z.string().trim().min(1).max(500),
    alternativeLabels: z.array(z.string().trim().min(1).max(500)).default([]),
    description: z.string().trim().min(1).max(5_000).optional(),
    language: LocaleSchema,
    version: z.string().trim().min(1).max(40),
    source: z.literal("official_esco"),
    attestation: EscoAttestationSchema,
  })
  .superRefine((concept, context) => {
    const expectedScope = concept.conceptType === "occupation"
      ? "occupation"
      : "skill_relation";
    if (concept.attestation.scope !== expectedScope) {
      context.addIssue({
        code: "custom",
        path: ["attestation", "scope"],
        message: `${concept.conceptType} concepts require a ${expectedScope} attestation`,
      });
    }
  });
export type EscoConcept = z.infer<typeof EscoConceptSchema>;

export const QuestionDependencySchema = z
  .strictObject({
    fieldId: VacancyFieldIdSchema,
    operator: z.enum(["is_answered", "equals", "not_equals", "includes"]),
    value: JsonValueSchema.optional(),
  })
  .superRefine((dependency, context) => {
    if (
      dependency.operator !== "is_answered" &&
      dependency.value === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: `${dependency.operator} dependencies require a value`,
      });
    }
    if (
      dependency.operator === "is_answered" &&
      dependency.value !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "is_answered dependencies must not define a value",
      });
    }
  });
export type QuestionDependency = z.infer<typeof QuestionDependencySchema>;

export const QuestionOptionSchema = z.strictObject({
  value: z.string().trim().min(1).max(160),
  label: LocalizedTextSchema,
});
export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

export const QuestionSchema = z.strictObject({
  id: z.string().trim().min(1).max(160),
  fieldId: VacancyFieldIdSchema,
  wording: LocalizedTextSchema,
  rationale: LocalizedTextSchema,
  answerType: z.enum([
    "short_text",
    "long_text",
    "number",
    "date",
    "single_select",
    "multi_select",
    "percentage",
  ]),
  options: z.array(QuestionOptionSchema).max(20).default([]),
  dependencies: z.array(QuestionDependencySchema).max(10).default([]),
  priority: z.number().int().min(0).max(100),
  allowNotApplicable: z.boolean(),
  mode: z.enum(["collect", "confirm", "resolve_conflict"]),
  status: z.enum(["open", "answered", "skipped", "blocked"]),
  aggSafe: z.literal(true),
  sensitive: z.boolean().default(false),
});
export type Question = z.infer<typeof QuestionSchema>;

export const SectionCompletenessSchema = z.strictObject({
  section: VacancySectionSchema,
  score: z.number().min(0).max(100),
  achievedWeight: z.number().nonnegative(),
  totalWeight: z.number().positive(),
});
export type SectionCompleteness = z.infer<typeof SectionCompletenessSchema>;

export const CompletenessAssessmentSchema = z.strictObject({
  score: z.number().min(0).max(100),
  achievedWeight: z.number().nonnegative(),
  totalWeight: z.number().positive(),
  readyForSummary: z.boolean(),
  sectionScores: z.array(SectionCompletenessSchema),
  missingFieldIds: z.array(VacancyFieldIdSchema),
  missingCriticalFieldIds: z.array(VacancyFieldIdSchema),
  unconfirmedFieldIds: z.array(VacancyFieldIdSchema),
  conflictFieldIds: z.array(VacancyFieldIdSchema),
});
export type CompletenessAssessment = z.infer<
  typeof CompletenessAssessmentSchema
>;

export const BriefEscoContextSchema = z.strictObject({
  primaryOccupation: EscoConceptSchema.optional(),
  secondaryOccupations: z.array(EscoConceptSchema).max(2).default([]),
  skills: z.array(EscoConceptSchema).max(200).default([]),
});
export type BriefEscoContext = z.infer<typeof BriefEscoContextSchema>;

export const VacancyBriefSchema = z
  .strictObject({
    id: z.string().trim().min(1).max(160),
    schemaVersion: z.literal("1.0"),
    locale: LocaleSchema,
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(300).optional(),
    facts: z.array(VacancyFactSchema).max(VACANCY_FIELD_IDS.length).default([]),
    esco: BriefEscoContextSchema.default({
      secondaryOccupations: [],
      skills: [],
    }),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((brief, context) => {
    const fieldIds = brief.facts.map((fact) => fact.fieldId);
    if (new Set(fieldIds).size !== fieldIds.length) {
      context.addIssue({
        code: "custom",
        path: ["facts"],
        message: "facts must contain at most one entry per fieldId",
      });
    }

    const concepts = [
      ...(brief.esco.primaryOccupation ? [brief.esco.primaryOccupation] : []),
      ...brief.esco.secondaryOccupations,
      ...brief.esco.skills,
    ];
    const conceptUris = concepts.map((concept) => concept.uri);
    if (new Set(conceptUris).size !== conceptUris.length) {
      context.addIssue({
        code: "custom",
        path: ["esco"],
        message: "ESCO concepts must use unique URIs",
      });
    }
  });
export type VacancyBrief = z.infer<typeof VacancyBriefSchema>;

export const AnalysisRequestSchema = z.strictObject({
  locale: LocaleSchema.default("de"),
  jobAdText: z.string().trim().min(20).max(100_000),
  sourceId: z.string().trim().min(1).max(160).default("job-ad"),
  sourceName: z.string().trim().min(1).max(300).optional(),
  sourceType: z.enum(["pasted_text", "uploaded_file", "source_url"]).default("pasted_text"),
  sourceUrl: z.string().url().max(2_000).optional(),
  existingBrief: VacancyBriefSchema.optional(),
  redactPersonalData: z.boolean().default(true),
});
export type AnalysisRequest = z.infer<typeof AnalysisRequestSchema>;

export const AnalysisResponseSchema = z.strictObject({
  analysisId: z.string().trim().min(1).max(160),
  status: z.enum(["completed", "needs_input", "conflict"]),
  brief: VacancyBriefSchema,
  completeness: CompletenessAssessmentSchema,
  nextQuestions: z.array(QuestionSchema).max(3),
  warnings: z.array(LocalizedTextSchema).max(50).default([]),
});
export type AnalysisResponse = z.infer<typeof AnalysisResponseSchema>;

export const VacancyAnswerValueSchema = z.union([
  z.string().trim().min(1).max(4_000),
  z.number().finite(),
  z.array(z.string().trim().min(1).max(300)).min(1).max(50),
]);
export type VacancyAnswerValue = z.infer<typeof VacancyAnswerValueSchema>;

export const VacancyAnswerActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("answer"),
    value: VacancyAnswerValueSchema,
  }),
  z.strictObject({ kind: z.literal("declined") }),
  z.strictObject({ kind: z.literal("not_applicable") }),
]);
export type VacancyAnswerAction = z.infer<typeof VacancyAnswerActionSchema>;

/**
 * Submit one answer against the exact question batch produced for this brief
 * revision. `fieldId` is deliberately repeated so stale or mismatched clients
 * cannot write a value to a different canonical field.
 */
export const AnswerVacancyQuestionRequestSchema = z.strictObject({
  brief: VacancyBriefSchema,
  questionId: z.string().trim().min(1).max(160),
  fieldId: VacancyFieldIdSchema,
  action: VacancyAnswerActionSchema,
});
export type AnswerVacancyQuestionRequest = z.infer<
  typeof AnswerVacancyQuestionRequestSchema
>;

const OFFICIAL_ESCO_OCCUPATION_URI_PATTERN =
  /^https?:\/\/data\.europa\.eu\/esco\/occupation\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const OFFICIAL_ESCO_SKILL_URI_PATTERN =
  /^https?:\/\/data\.europa\.eu\/esco\/skill\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * A tightly bounded, but still untrusted, ESCO edge presented by the client.
 * URI shape and the authority literal are input hygiene only; the dedicated
 * server route must re-fetch the exact edge before creating ESCO provenance.
 */
export const EscoSkillCandidateSchema = z.strictObject({
  authority: z.literal("official_esco_api"),
  occupationUri: z.string().url().max(2_000).regex(OFFICIAL_ESCO_OCCUPATION_URI_PATTERN),
  skillUri: z.string().url().max(2_000).regex(OFFICIAL_ESCO_SKILL_URI_PATTERN),
  relation: z.enum(["essential", "optional"]),
  version: z.string().trim().regex(/^v\d+\.\d+(?:\.\d+)?$/u).max(40),
  language: LocaleSchema,
  label: z.string().trim().min(1).max(300),
});
export type EscoSkillCandidate = z.infer<typeof EscoSkillCandidateSchema>;

/** Edit one canonical fact from the final review without bypassing its field contract. */
export const EditVacancyFactRequestSchema = z.strictObject({
  brief: VacancyBriefSchema,
  fieldId: VacancyFieldIdSchema,
  action: VacancyAnswerActionSchema,
});
export type EditVacancyFactRequest = z.infer<typeof EditVacancyFactRequestSchema>;

/**
 * Ask the server to verify a presented ESCO edge against the live official API
 * before applying the user-confirmed fact edit. `escoCandidate` is untrusted
 * input and never becomes provenance unless that verification succeeds.
 */
export const AcceptEscoSkillRequestSchema = z.strictObject({
  brief: VacancyBriefSchema,
  fieldId: z.enum([
    "requirements.mustHaveSkills",
    "requirements.niceToHaveSkills",
  ]),
  action: VacancyAnswerActionSchema,
  escoCandidate: EscoSkillCandidateSchema,
}).superRefine((request, context) => {
  const candidate = request.escoCandidate;

  const primaryOccupation = request.brief.esco.primaryOccupation;
  if (!primaryOccupation || primaryOccupation.uri !== candidate.occupationUri) {
    context.addIssue({
      code: "custom",
      path: ["escoCandidate", "occupationUri"],
      message: "The ESCO occupation URI must match the brief's confirmed primary occupation",
    });
  }
  if (primaryOccupation && primaryOccupation.version !== candidate.version) {
    context.addIssue({
      code: "custom",
      path: ["escoCandidate", "version"],
      message: "The ESCO version must match the brief's confirmed primary occupation",
    });
  }
  if (request.brief.locale !== candidate.language) {
    context.addIssue({
      code: "custom",
      path: ["escoCandidate", "language"],
      message: "The ESCO acceptance language must match the brief locale",
    });
  }

  const expectedFieldId = candidate.relation === "essential"
    ? "requirements.mustHaveSkills"
    : "requirements.niceToHaveSkills";
  if (request.fieldId !== expectedFieldId) {
    context.addIssue({
      code: "custom",
      path: ["fieldId"],
      message: `${candidate.relation} ESCO skills must target ${expectedFieldId}`,
    });
  }

  if (
    request.action.kind !== "answer"
    || !Array.isArray(request.action.value)
    || !request.action.value.includes(candidate.label)
  ) {
    context.addIssue({
      code: "custom",
      path: ["action", "value"],
      message: "The accepted ESCO skill label must be present in the answer array",
    });
  }
});
export type AcceptEscoSkillRequest = z.infer<typeof AcceptEscoSkillRequestSchema>;

export const SenioritySchema = z.enum([
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
]);
export type Seniority = z.infer<typeof SenioritySchema>;

export const MarketScenarioRequestSchema = z.strictObject({
  briefId: z.string().trim().min(1).max(160),
  searchRadiusKm: z.number().int().min(0).max(500),
  remoteSharePercent: z.number().int().min(0).max(100),
  seniority: SenioritySchema,
  mustHaveSkills: z.array(z.string().trim().min(1).max(300)).max(50),
  addedMustHaveSkills: z
    .array(z.string().trim().min(1).max(300))
    .max(50)
    .default([]),
});
export type MarketScenarioRequest = z.infer<typeof MarketScenarioRequestSchema>;

export const MarketScenarioWhatIfSchema = z.strictObject({
  addedSkill: z.string().trim().min(1).max(300),
  resultingMustHaveSkillCount: z.number().int().min(1).max(100),
  reachIndex: z.number().min(0).max(100),
  deltaPoints: z.number().max(0),
  explanation: LocalizedTextSchema,
});
export type MarketScenarioWhatIf = z.infer<
  typeof MarketScenarioWhatIfSchema
>;

export const MarketScenarioProvenanceSchema = z.strictObject({
  methodId: z.literal("synthetic_candidate_reach_v2"),
  dataBasis: z.literal("scenario_inputs_only"),
  formula: z.string().trim().min(1).max(1_000),
  usesLiveCandidateData: z.literal(false),
  usesMarketCounts: z.literal(false),
  usesSalaryData: z.literal(false),
  usesLlm: z.literal(false),
  modelsSkillSpecificScarcity: z.literal(false),
});
export type MarketScenarioProvenance = z.infer<
  typeof MarketScenarioProvenanceSchema
>;

export const MarketReferenceSchema = z.strictObject({
  id: z.enum(["ba_entgeltatlas", "ba_labour_market_statistics"]),
  label: LocalizedTextSchema,
  url: z.string().url(),
  dataImported: z.literal(false),
  note: LocalizedTextSchema,
});
export type MarketReference = z.infer<typeof MarketReferenceSchema>;

export const MarketScenarioResultSchema = z.strictObject({
  status: z.literal("synthetic_scenario_only"),
  metric: z.literal("synthetic_scenario_reach_index"),
  unit: z.literal("relative_points_0_to_100"),
  baselineReachIndex: z.number().min(0).max(100),
  reachIndex: z.number().min(0).max(100),
  deltaPoints: z.number().max(0),
  whatIfRows: z.array(MarketScenarioWhatIfSchema).max(50),
  provenance: MarketScenarioProvenanceSchema,
  references: z.array(MarketReferenceSchema).min(1).max(5),
  assumptions: z.array(LocalizedTextSchema).min(1).max(50),
  disclaimer: LocalizedTextSchema,
});
export type MarketScenarioResult = z.infer<typeof MarketScenarioResultSchema>;

export const KnowledgeCorpusSchema = z.enum([
  "esco",
  "job_postings",
  "market_reference",
]);
export type KnowledgeCorpus = z.infer<typeof KnowledgeCorpusSchema>;

export const KnowledgeSourceProvenanceSchema = z.strictObject({
  dataset: z.string().trim().min(1).max(160).optional(),
  source: z.string().trim().min(1).max(160).optional(),
  license: z.string().trim().min(1).max(80).optional(),
  snapshotPeriod: z.string().trim().min(1).max(80).optional(),
  language: z.string().trim().min(2).max(35).optional(),
  usagePolicy: z.string().trim().min(1).max(80).optional(),
  documentType: z.string().trim().min(1).max(80).optional(),
  rightsStatus: z.string().trim().min(1).max(80).optional(),
  privacyStatus: z.string().trim().min(1).max(80).optional(),
});
export type KnowledgeSourceProvenance = z.infer<
  typeof KnowledgeSourceProvenanceSchema
>;

/**
 * A bounded, display-safe citation returned from semantic retrieval. Provider
 * resource identifiers are deliberately excluded from the public contract.
 */
export const KnowledgeCitationSchema = z.strictObject({
  id: z.string().trim().min(1).max(160),
  corpus: KnowledgeCorpusSchema,
  sourceName: z.string().trim().min(1).max(300),
  excerpt: z.string().trim().min(1).max(1_500),
  score: z.number().min(0).max(1),
  authority: z.enum(["retrieved_reference", "official_esco_api"]).default(
    "retrieved_reference",
  ),
  conceptUri: z.string().url().optional(),
  relation: z.enum(["essential", "optional"]).optional(),
  provenance: KnowledgeSourceProvenanceSchema.optional(),
});
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>;

export const KnowledgeSuggestionSchema = z.strictObject({
  id: z.string().trim().min(1).max(160),
  kind: z.enum(["esco_skill", "job_posting_pattern", "market_context"]),
  status: z.literal("suggestion_only"),
  label: z.string().trim().min(1).max(500),
  targetFieldId: VacancyFieldIdSchema.optional(),
  conceptUri: z.string().url().optional(),
  relation: z.enum(["essential", "optional"]).optional(),
  sourceAuthority: z
    .enum(["retrieved_reference", "official_esco_api"])
    .default("retrieved_reference"),
  rationale: LocalizedTextSchema,
  citations: z.array(KnowledgeCitationSchema).min(1).max(5),
});
export type KnowledgeSuggestion = z.infer<typeof KnowledgeSuggestionSchema>;

export const CorpusRetrievalStatusSchema = z.strictObject({
  corpus: KnowledgeCorpusSchema,
  status: z.enum([
    "available",
    "no_results",
    "not_configured",
    "unavailable",
    "filtered",
  ]),
  resultCount: z.number().int().nonnegative().max(8),
});
export type CorpusRetrievalStatus = z.infer<
  typeof CorpusRetrievalStatusSchema
>;

/**
 * Ask the server for optional recruitment context. Retrieved text is never
 * accepted as a canonical vacancy fact through this endpoint.
 */
export const RecruitmentKnowledgeRequestSchema = z.strictObject({
  locale: LocaleSchema.default("de"),
  query: z.string().trim().min(3).max(4_000),
  roleTitle: z.string().trim().min(1).max(300).optional(),
  occupationUri: z
    .string()
    .url()
    .max(2_000)
    .regex(
      /^https?:\/\/data\.europa\.eu\/esco\/occupation\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
    )
    .optional(),
  currentSkills: z
    .array(z.string().trim().min(1).max(300))
    .max(50)
    .default([]),
  seniority: SenioritySchema.optional(),
  companyLocationCode: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}$/u)
    .optional(),
  corpora: z
    .array(KnowledgeCorpusSchema)
    .min(1)
    .max(3)
    .default(["esco", "job_postings", "market_reference"])
    .refine((items) => new Set(items).size === items.length, {
      message: "corpora must be unique",
    }),
  maxResultsPerCorpus: z.number().int().min(1).max(8).default(4),
}).superRefine((request, context) => {
  if (!request.roleTitle && !request.occupationUri && request.currentSkills.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["roleTitle"],
      message: "A role title, confirmed ESCO occupation, or current skill is required",
    });
  }
});
export type RecruitmentKnowledgeRequest = z.infer<
  typeof RecruitmentKnowledgeRequestSchema
>;

export const HistoricalSalaryBenchmarkSchema = z.strictObject({
  status: z.literal("historical_reference_only"),
  currency: z.literal("USD"),
  datasetPeriod: z.strictObject({
    from: z.number().int().min(2000).max(2100),
    to: z.number().int().min(2000).max(2100),
  }),
  sampleSize: z.number().int().positive().max(100_000),
  p25: z.number().nonnegative(),
  median: z.number().nonnegative(),
  p75: z.number().nonnegative(),
  filters: z.strictObject({
    roleTitleQuery: z.string().trim().min(1).max(300),
    matchedJobTitles: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
    appliedFilters: z.strictObject({
      experienceLevel: z.string().trim().min(1).max(40).optional(),
      companyLocation: z.string().regex(/^[A-Z]{2}$/u).optional(),
    }),
    relaxedFilters: z.array(z.enum(["experience_level", "company_location"])).max(2),
  }),
  source: z.strictObject({
    sourceName: z.literal("salaries.json"),
    datasetLabel: z.literal("salaries_8805"),
    licenseStatus: z.enum(["unverified", "approved", "verified"]),
  }),
  provenance: z.strictObject({
    methodId: z.literal("deterministic_salary_dataset_aggregation_v1"),
    aggregateOnly: z.literal(true),
    usesLlm: z.literal(false),
    isForecast: z.literal(false),
    modelsSkillPremium: z.literal(false),
  }),
  disclaimer: LocalizedTextSchema,
});
export type HistoricalSalaryBenchmark = z.infer<
  typeof HistoricalSalaryBenchmarkSchema
>;

export const RecruitmentKnowledgeResponseSchema = z.strictObject({
  status: z.enum([
    "suggestions_available",
    "no_suggestions",
    "partial",
    "not_configured",
  ]),
  mode: z.literal("suggestion_only"),
  suggestions: z.array(KnowledgeSuggestionSchema).max(12),
  references: z.array(KnowledgeCitationSchema).max(24),
  salaryBenchmark: HistoricalSalaryBenchmarkSchema.optional(),
  corpora: z.array(CorpusRetrievalStatusSchema).min(1).max(3),
  warnings: z.array(LocalizedTextSchema).max(20).default([]),
});
export type RecruitmentKnowledgeResponse = z.infer<
  typeof RecruitmentKnowledgeResponseSchema
>;
