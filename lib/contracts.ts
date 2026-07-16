import { z } from "zod";

export const LocaleSchema = z.enum(["de", "en"]);
export type Locale = z.infer<typeof LocaleSchema>;

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

export const EvidenceSchema = z.strictObject({
  id: z.string().trim().min(1).max(160),
  sourceId: z.string().trim().min(1).max(160),
  sourceType: EvidenceSourceTypeSchema,
  quote: z.string().trim().min(1).max(4_000),
  locator: EvidenceLocatorSchema.default({}),
  language: LocaleSchema.optional(),
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
  sourceIds: z.array(z.string().trim().min(1).max(160)).default([]),
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
    evidence: z.array(EvidenceSchema).max(50).default([]),
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

export const EscoConceptSchema = z.strictObject({
  uri: z.string().url(),
  conceptType: z.enum(["occupation", "skill"]),
  preferredLabel: z.string().trim().min(1).max(500),
  alternativeLabels: z.array(z.string().trim().min(1).max(500)).default([]),
  description: z.string().trim().min(1).max(5_000).optional(),
  language: LocaleSchema,
  version: z.string().trim().min(1).max(40),
  source: z.literal("official_esco"),
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
  resultingMustHaveSkillCount: z.number().int().min(1).max(51),
  reachIndex: z.number().min(0).max(100),
  deltaPoints: z.number().max(0),
  explanation: LocalizedTextSchema,
});
export type MarketScenarioWhatIf = z.infer<
  typeof MarketScenarioWhatIfSchema
>;

export const MarketScenarioProvenanceSchema = z.strictObject({
  methodId: z.literal("synthetic_candidate_reach_v1"),
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

export const MarketScenarioResultSchema = z.strictObject({
  status: z.literal("synthetic_scenario_only"),
  metric: z.literal("synthetic_scenario_reach_index"),
  unit: z.literal("relative_points_0_to_100"),
  reachIndex: z.number().min(0).max(100),
  whatIfRows: z.array(MarketScenarioWhatIfSchema).max(50),
  provenance: MarketScenarioProvenanceSchema,
  assumptions: z.array(LocalizedTextSchema).min(1).max(50),
  disclaimer: LocalizedTextSchema,
});
export type MarketScenarioResult = z.infer<typeof MarketScenarioResultSchema>;
