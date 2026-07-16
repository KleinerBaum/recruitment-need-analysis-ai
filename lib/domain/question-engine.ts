import {
  CompletenessAssessmentSchema,
  QuestionSchema,
  type CompletenessAssessment,
  type JsonValue,
  type Locale,
  type Question,
  type QuestionDependency,
  type VacancyBrief,
  type VacancyFact,
  type VacancyFieldId,
  type VacancySection,
} from "../contracts";

interface QuestionDefinition extends Omit<Question, "mode" | "status"> {
  section: VacancySection;
  weight: number;
  critical: boolean;
}

type CatalogQuestionDefinition = Omit<QuestionDefinition, "allowNotApplicable">;

const NOT_APPLICABLE_FIELD_IDS: ReadonlySet<VacancyFieldId> = new Set([
  "company.context",
  "role.travel",
  "requirements.niceToHaveSkills",
  "requirements.education",
  "requirements.languages",
  "requirements.certifications",
  "compensation.benefits",
]);

const option = (value: string, de: string, en: string) => ({
  value,
  label: { de, en },
});

const answered = (fieldId: VacancyFieldId): QuestionDependency => ({
  fieldId,
  operator: "is_answered",
});

const QUESTION_DEFINITIONS: readonly CatalogQuestionDefinition[] = [
  {
    id: "q_company_name",
    fieldId: "company.name",
    section: "company",
    wording: {
      de: "Wie heißt das einstellende Unternehmen?",
      en: "What is the name of the hiring company?",
    },
    rationale: {
      de: "Der Unternehmensbezug macht das Briefing eindeutig zuordenbar.",
      en: "The company reference makes the brief unambiguous.",
    },
    answerType: "short_text",
    options: [],
    dependencies: [],
    priority: 70,
    weight: 4,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_company_context",
    fieldId: "company.context",
    section: "company",
    wording: {
      de: "Welcher geschäftliche oder organisatorische Kontext ist für die Rolle relevant?",
      en: "Which business or organisational context is relevant to the role?",
    },
    rationale: {
      de: "Relevanter Kontext verbessert die spätere Ansprache und Priorisierung.",
      en: "Relevant context improves later outreach and prioritisation.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [],
    priority: 45,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_role_title",
    fieldId: "role.title",
    section: "role",
    wording: {
      de: "Wie lautet der verbindliche Arbeitstitel der Position?",
      en: "What is the agreed working title for the position?",
    },
    rationale: {
      de: "Der Titel ist der zentrale Anker für Rolle, ESCO-Zuordnung und Suche.",
      en: "The title anchors the role, ESCO mapping, and search strategy.",
    },
    answerType: "short_text",
    options: [],
    dependencies: [],
    priority: 100,
    weight: 10,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_role_purpose",
    fieldId: "role.purpose",
    section: "role",
    wording: {
      de: "Welchen konkreten Zweck erfüllt die Position im Unternehmen?",
      en: "What concrete purpose does the position serve in the organisation?",
    },
    rationale: {
      de: "Ein klarer Rollenzweck verhindert eine rein auf Aufgaben reduzierte Suche.",
      en: "A clear purpose prevents the search from being reduced to a task list.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("role.title")],
    priority: 95,
    weight: 9,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_role_seniority",
    fieldId: "role.seniority",
    section: "role",
    wording: {
      de: "Welches fachlich begründete Senioritätsniveau benötigt die Position?",
      en: "Which job-related seniority level does the position require?",
    },
    rationale: {
      de: "Das Niveau beeinflusst Verantwortung, Auswahlkriterien und Suchstrategie.",
      en: "The level affects responsibility, selection criteria, and search strategy.",
    },
    answerType: "single_select",
    options: [
      option("entry", "Einstieg", "Entry"),
      option("junior", "Junior", "Junior"),
      option("mid", "Professional / Mid-Level", "Professional / mid-level"),
      option("senior", "Senior", "Senior"),
      option("lead", "Lead / Leitung", "Lead"),
      option("executive", "Geschäftsleitung", "Executive"),
    ],
    dependencies: [answered("role.title")],
    priority: 85,
    weight: 7,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_employment_type",
    fieldId: "role.employmentType",
    section: "role",
    wording: {
      de: "Welche Beschäftigungsart ist für die Position vorgesehen?",
      en: "Which employment type is planned for the position?",
    },
    rationale: {
      de: "Die Beschäftigungsart grenzt den passenden Suchmarkt ein.",
      en: "The employment type defines the relevant search market.",
    },
    answerType: "single_select",
    options: [
      option("permanent", "Unbefristet", "Permanent"),
      option("fixed_term", "Befristet", "Fixed-term"),
      option("contract", "Freie Mitarbeit / Contract", "Contract"),
      option("internship", "Praktikum", "Internship"),
    ],
    dependencies: [],
    priority: 60,
    weight: 4,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_start_date",
    fieldId: "role.startDate",
    section: "role",
    wording: {
      de: "Zu welchem Termin soll die Position idealerweise starten?",
      en: "When should the position ideally start?",
    },
    rationale: {
      de: "Der Zieltermin macht die Recruiting-Planung realistisch.",
      en: "The target date makes recruitment planning realistic.",
    },
    answerType: "date",
    options: [],
    dependencies: [],
    priority: 50,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_headcount",
    fieldId: "role.headcount",
    section: "role",
    wording: {
      de: "Wie viele Positionen sollen mit diesem Profil besetzt werden?",
      en: "How many positions should be filled with this profile?",
    },
    rationale: {
      de: "Die Anzahl beeinflusst Kanalwahl, Zeitplan und Interviewkapazität.",
      en: "The number affects channels, timing, and interview capacity.",
    },
    answerType: "number",
    options: [],
    dependencies: [],
    priority: 55,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_location",
    fieldId: "role.location",
    section: "role",
    wording: {
      de: "An welchem Arbeitsort oder in welcher Region ist die Position verankert?",
      en: "At which workplace or in which region is the position based?",
    },
    rationale: {
      de: "Der Arbeitsort ist für Erreichbarkeit und Suchradius erforderlich.",
      en: "The workplace is required for accessibility and search radius.",
    },
    answerType: "short_text",
    options: [],
    dependencies: [],
    priority: 90,
    weight: 8,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_work_model",
    fieldId: "role.workModel",
    section: "role",
    wording: {
      de: "Welches Arbeitsmodell ist verbindlich vorgesehen?",
      en: "Which working model is firmly planned?",
    },
    rationale: {
      de: "Vor Ort, hybrid und remote dürfen nicht gleichgesetzt werden.",
      en: "On-site, hybrid, and remote arrangements must remain distinct.",
    },
    answerType: "single_select",
    options: [
      option("on_site", "Vor Ort", "On-site"),
      option("hybrid", "Hybrid", "Hybrid"),
      option("remote", "Remote", "Remote"),
    ],
    dependencies: [answered("role.location")],
    priority: 88,
    weight: 8,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_remote_share",
    fieldId: "role.remoteShare",
    section: "role",
    wording: {
      de: "Welcher Remote-Anteil ist verbindlich möglich?",
      en: "What proportion of remote work is firmly available?",
    },
    rationale: {
      de: "Ein konkreter Anteil verhindert missverständliche Hybrid-Angaben.",
      en: "A concrete share prevents ambiguous hybrid statements.",
    },
    answerType: "percentage",
    options: [],
    dependencies: [
      { fieldId: "role.workModel", operator: "not_equals", value: "on_site" },
    ],
    priority: 72,
    weight: 4,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_working_hours",
    fieldId: "role.workingHours",
    section: "role",
    wording: {
      de: "Welcher Arbeitszeitumfang und welche zeitlichen Rahmenbedingungen gelten?",
      en: "What working hours and scheduling conditions apply?",
    },
    rationale: {
      de: "Der Arbeitszeitrahmen verhindert spätere Erwartungskonflikte.",
      en: "Working-hour clarity prevents expectation conflicts later.",
    },
    answerType: "short_text",
    options: [],
    dependencies: [],
    priority: 48,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_travel",
    fieldId: "role.travel",
    section: "role",
    wording: {
      de: "Welcher dienstlich erforderliche Reiseanteil gehört zur Position?",
      en: "What job-related travel requirement belongs to the position?",
    },
    rationale: {
      de: "Reiseanforderungen sollten früh und konkret transparent sein.",
      en: "Travel requirements should be specific and transparent early on.",
    },
    answerType: "percentage",
    options: [],
    dependencies: [],
    priority: 38,
    weight: 2,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_leadership_scope",
    fieldId: "role.leadershipScope",
    section: "role",
    wording: {
      de: "Welche fachliche oder disziplinarische Führungsverantwortung gehört zur Rolle?",
      en: "Which functional or disciplinary leadership responsibilities belong to the role?",
    },
    rationale: {
      de: "Mentoring, fachliche Führung und disziplinarische Führung sind getrennte Anforderungen.",
      en: "Mentoring, functional leadership, and disciplinary leadership are distinct requirements.",
    },
    answerType: "multi_select",
    options: [
      option("none", "Keine Führungsverantwortung", "No leadership responsibility"),
      option("mentoring", "Mentoring", "Mentoring"),
      option("functional", "Fachliche Führung", "Functional leadership"),
      option("disciplinary", "Disziplinarische Führung", "Disciplinary leadership"),
    ],
    dependencies: [answered("role.seniority")],
    priority: 58,
    weight: 4,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_outcomes",
    fieldId: "tasks.outcomes",
    section: "tasks",
    wording: {
      de: "Welche drei bis fünf Ergebnisse soll die Person in der Rolle erreichen?",
      en: "Which three to five outcomes should the person achieve in the role?",
    },
    rationale: {
      de: "Ergebnisse schaffen beobachtbare Auswahl- und Erfolgskriterien.",
      en: "Outcomes create observable selection and success criteria.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("role.purpose")],
    priority: 94,
    weight: 10,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_responsibilities",
    fieldId: "tasks.responsibilities",
    section: "tasks",
    wording: {
      de: "Welche wesentlichen Verantwortlichkeiten führen zu diesen Ergebnissen?",
      en: "Which core responsibilities lead to those outcomes?",
    },
    rationale: {
      de: "Verantwortlichkeiten übersetzen Zielergebnisse in den Arbeitsalltag.",
      en: "Responsibilities translate target outcomes into day-to-day work.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("tasks.outcomes")],
    priority: 82,
    weight: 7,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_must_have_skills",
    fieldId: "requirements.mustHaveSkills",
    section: "requirements",
    wording: {
      de: "Welche fachlich zwingenden Skills werden ab dem Start benötigt?",
      en: "Which job-essential skills are required from the start?",
    },
    rationale: {
      de: "Eine kurze Muss-Liste reduziert unnötige Ausschlüsse und fokussiert die Auswahl.",
      en: "A short must-have list reduces unnecessary exclusion and focuses selection.",
    },
    answerType: "multi_select",
    options: [],
    dependencies: [answered("tasks.outcomes")],
    priority: 96,
    weight: 10,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_nice_to_have_skills",
    fieldId: "requirements.niceToHaveSkills",
    section: "requirements",
    wording: {
      de: "Welche zusätzlichen Skills sind hilfreich, aber erlernbar oder verzichtbar?",
      en: "Which additional skills are useful but learnable or optional?",
    },
    rationale: {
      de: "Die Trennung schützt Nice-to-haves davor, ungewollt zu Ausschlusskriterien zu werden.",
      en: "The distinction prevents nice-to-haves from becoming unintended exclusion criteria.",
    },
    answerType: "multi_select",
    options: [],
    dependencies: [answered("requirements.mustHaveSkills")],
    priority: 64,
    weight: 4,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_experience",
    fieldId: "requirements.experience",
    section: "requirements",
    wording: {
      de: "Welche konkret nachweisbare Erfahrung ist für die Aufgaben erforderlich?",
      en: "Which demonstrable experience is required for the work?",
    },
    rationale: {
      de: "Konkrete Erfahrung ist aussagekräftiger als pauschale Jahresgrenzen.",
      en: "Concrete experience is more meaningful than blanket year thresholds.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("tasks.responsibilities")],
    priority: 74,
    weight: 6,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_education",
    fieldId: "requirements.education",
    section: "requirements",
    wording: {
      de: "Ist eine bestimmte tätigkeitsbezogene Qualifikation zwingend oder sind gleichwertige Wege möglich?",
      en: "Is a specific job-related qualification essential, or are equivalent routes acceptable?",
    },
    rationale: {
      de: "Gleichwertige Qualifikationswege erweitern den Zugang ohne Qualitätsverlust.",
      en: "Equivalent qualification routes broaden access without reducing quality.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("tasks.responsibilities")],
    priority: 46,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_languages",
    fieldId: "requirements.languages",
    section: "requirements",
    wording: {
      de: "Welche Sprachen werden in welchem beruflichen Kontext und auf welchem Niveau benötigt?",
      en: "Which languages are required, at what level, and in which work context?",
    },
    rationale: {
      de: "Sprachen und Niveaus müssen getrennt und tätigkeitsbezogen dokumentiert werden.",
      en: "Languages and proficiency levels must be documented separately and job-related.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("tasks.responsibilities")],
    priority: 68,
    weight: 5,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_certifications",
    fieldId: "requirements.certifications",
    section: "requirements",
    wording: {
      de: "Welche tätigkeitsbezogenen Zertifikate oder Zulassungen sind rechtlich oder fachlich erforderlich?",
      en: "Which job-related certifications or licences are legally or professionally required?",
    },
    rationale: {
      de: "Nur tatsächlich erforderliche Nachweise sollten den Kandidatenkreis begrenzen.",
      en: "Only genuinely required credentials should restrict the candidate pool.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("tasks.responsibilities")],
    priority: 44,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_salary_range",
    fieldId: "compensation.salaryRange",
    section: "compensation",
    wording: {
      de: "Welcher bestätigte Vergütungsrahmen gilt für die Position?",
      en: "What confirmed compensation range applies to the position?",
    },
    rationale: {
      de: "Ein bestätigter Rahmen verhindert erfundene oder missverständliche Gehaltsangaben.",
      en: "A confirmed range prevents invented or misleading compensation claims.",
    },
    answerType: "short_text",
    options: [],
    dependencies: [answered("role.seniority")],
    priority: 78,
    weight: 6,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_benefits",
    fieldId: "compensation.benefits",
    section: "compensation",
    wording: {
      de: "Welche bestätigten Benefits gehören zum Angebot?",
      en: "Which confirmed benefits belong to the offer?",
    },
    rationale: {
      de: "Benefits werden separat von Muss-Anforderungen dokumentiert.",
      en: "Benefits are documented separately from must-have requirements.",
    },
    answerType: "multi_select",
    options: [],
    dependencies: [],
    priority: 36,
    weight: 2,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_interview_stages",
    fieldId: "process.interviewStages",
    section: "process",
    wording: {
      de: "Welche Interview- und Entscheidungsschritte sind geplant?",
      en: "Which interview and decision stages are planned?",
    },
    rationale: {
      de: "Ein klarer Prozess verbessert Geschwindigkeit und Candidate Experience.",
      en: "A clear process improves speed and candidate experience.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [],
    priority: 66,
    weight: 5,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_decision_owners",
    fieldId: "process.decisionOwners",
    section: "process",
    wording: {
      de: "Welche Rollen entscheiden in den einzelnen Prozessschritten?",
      en: "Which roles make decisions at each process stage?",
    },
    rationale: {
      de: "Klare Verantwortlichkeiten vermeiden Wartezeiten und Doppelarbeit.",
      en: "Clear ownership avoids delays and duplicated work.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("process.interviewStages")],
    priority: 52,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_process_timeline",
    fieldId: "process.timeline",
    section: "process",
    wording: {
      de: "Welcher realistische Zeitplan gilt vom Erstkontakt bis zur Entscheidung?",
      en: "What realistic timeline applies from first contact to decision?",
    },
    rationale: {
      de: "Ein abgestimmter Zeitplan reduziert Abbrüche und interne Verzögerungen.",
      en: "An aligned timeline reduces drop-off and internal delays.",
    },
    answerType: "short_text",
    options: [],
    dependencies: [answered("process.interviewStages")],
    priority: 50,
    weight: 3,
    critical: false,
    aggSafe: true,
    sensitive: false,
  },
  {
    id: "q_success_metrics",
    fieldId: "success.metrics",
    section: "success",
    wording: {
      de: "An welchen beobachtbaren Ergebnissen wird Erfolg nach 3, 6 und 12 Monaten bewertet?",
      en: "Which observable outcomes define success after 3, 6, and 12 months?",
    },
    rationale: {
      de: "Beobachtbare Kriterien schaffen ein faires Interview und klares Onboarding.",
      en: "Observable criteria support fair interviews and clear onboarding.",
    },
    answerType: "long_text",
    options: [],
    dependencies: [answered("tasks.outcomes")],
    priority: 80,
    weight: 7,
    critical: true,
    aggSafe: true,
    sensitive: false,
  },
] as const;

/**
 * Resolved field policy used by contracts, completeness, and mutations.
 * Only genuinely optional fields can be completed by marking them not
 * applicable. All critical fields and operational core fields default to false.
 */
export const QUESTION_CATALOG: readonly QuestionDefinition[] = QUESTION_DEFINITIONS.map(
  (definition) => ({
    ...definition,
    allowNotApplicable: NOT_APPLICABLE_FIELD_IDS.has(definition.fieldId),
  }),
);

const QUESTION_DEFINITION_BY_FIELD = new Map(
  QUESTION_CATALOG.map((definition) => [definition.fieldId, definition]),
);

const FACT_STATUS_FACTOR: Readonly<Record<VacancyFact["status"], number>> = {
  missing: 0,
  explicit: 1,
  inferred: 0.5,
  user_confirmed: 1,
  conflict: 0,
  not_applicable: 1,
  declined: 0.25,
};

function factMap(brief: VacancyBrief): Map<VacancyFieldId, VacancyFact> {
  return new Map(brief.facts.map((fact) => [fact.fieldId, fact]));
}

function isFactAnswered(fact: VacancyFact | undefined): boolean {
  if (
    fact?.status === "not_applicable" &&
    !QUESTION_DEFINITION_BY_FIELD.get(fact.fieldId)?.allowNotApplicable
  ) {
    return false;
  }
  return (
    fact !== undefined &&
    !fact.hasConflict &&
    ["explicit", "inferred", "user_confirmed", "not_applicable"].includes(
      fact.status,
    )
  );
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function dependencyIsSatisfied(
  dependency: QuestionDependency,
  facts: ReadonlyMap<VacancyFieldId, VacancyFact>,
): boolean {
  const fact = facts.get(dependency.fieldId);
  if (!isFactAnswered(fact)) {
    return false;
  }
  if (dependency.operator === "is_answered") {
    return true;
  }
  if (dependency.operator === "equals") {
    return jsonEquals(fact?.value, dependency.value);
  }
  if (dependency.operator === "not_equals") {
    return !jsonEquals(fact?.value, dependency.value);
  }
  if (Array.isArray(fact?.value)) {
    return fact.value.some((item) => jsonEquals(item, dependency.value));
  }
  if (
    typeof fact?.value === "string" &&
    typeof dependency.value === "string"
  ) {
    return fact.value.includes(dependency.value);
  }
  return false;
}

function dependencyIsImpossible(
  dependency: QuestionDependency,
  facts: ReadonlyMap<VacancyFieldId, VacancyFact>,
): boolean {
  const fact = facts.get(dependency.fieldId);
  return isFactAnswered(fact) && !dependencyIsSatisfied(dependency, facts);
}

function definitionIsApplicable(
  definition: QuestionDefinition,
  facts: ReadonlyMap<VacancyFieldId, VacancyFact>,
): boolean {
  return !definition.dependencies.some((dependency) =>
    dependencyIsImpossible(dependency, facts),
  );
}

function factCompleteness(
  fact: VacancyFact | undefined,
  definition: QuestionDefinition,
): number {
  if (!fact || fact.hasConflict) {
    return 0;
  }
  if (fact.status === "not_applicable" && !definition.allowNotApplicable) {
    return 0;
  }
  // Model-authored confidence is not a calibrated probability. Completeness
  // therefore depends on the evidence state only: an inferred proposal earns
  // partial credit until a person confirms it, regardless of a model's
  // self-reported confidence number.
  return FACT_STATUS_FACTOR[fact.status];
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

export function assessCompleteness(
  brief: VacancyBrief,
): CompletenessAssessment {
  const facts = factMap(brief);
  const applicableDefinitions = QUESTION_CATALOG.filter((definition) =>
    definitionIsApplicable(definition, facts),
  );
  const totalWeight = applicableDefinitions.reduce(
    (sum, definition) => sum + definition.weight,
    0,
  );
  const achievedWeight = applicableDefinitions.reduce((sum, definition) => {
    return sum + definition.weight * factCompleteness(
      facts.get(definition.fieldId),
      definition,
    );
  }, 0);

  const missingFieldIds = applicableDefinitions
    .filter((definition) => {
      const fact = facts.get(definition.fieldId);
      return fact === undefined ||
        fact.status === "missing" ||
        (fact.status === "not_applicable" && !definition.allowNotApplicable);
    })
    .map((definition) => definition.fieldId);
  const missingCriticalFieldIds = applicableDefinitions
    .filter((definition) => {
      const fact = facts.get(definition.fieldId);
      return definition.critical && (
        factCompleteness(fact, definition) === 0 || fact?.status === "declined"
      );
    })
    .map((definition) => definition.fieldId);
  const unconfirmedFieldIds = applicableDefinitions
    .filter((definition) => facts.get(definition.fieldId)?.status === "inferred")
    .map((definition) => definition.fieldId);
  const conflictFieldIds = applicableDefinitions
    .filter((definition) => {
      const fact = facts.get(definition.fieldId);
      return fact?.status === "conflict" || fact?.hasConflict === true;
    })
    .map((definition) => definition.fieldId);

  const sections = [...new Set(applicableDefinitions.map(({ section }) => section))];
  const sectionScores = sections.map((section) => {
    const definitions = applicableDefinitions.filter(
      (definition) => definition.section === section,
    );
    const sectionTotal = definitions.reduce(
      (sum, definition) => sum + definition.weight,
      0,
    );
    const sectionAchieved = definitions.reduce(
      (sum, definition) =>
        sum + definition.weight * factCompleteness(
          facts.get(definition.fieldId),
          definition,
        ),
      0,
    );
    return {
      section,
      score: roundScore((sectionAchieved / sectionTotal) * 100),
      achievedWeight: roundScore(sectionAchieved),
      totalWeight: sectionTotal,
    };
  });

  const score = roundScore((achievedWeight / totalWeight) * 100);
  const criticalUnconfirmed = unconfirmedFieldIds.some((fieldId) =>
    applicableDefinitions.some(
      (definition) => definition.fieldId === fieldId && definition.critical,
    ),
  );

  return CompletenessAssessmentSchema.parse({
    score,
    achievedWeight: roundScore(achievedWeight),
    totalWeight,
    readyForSummary:
      score >= 85 &&
      missingCriticalFieldIds.length === 0 &&
      conflictFieldIds.length === 0 &&
      !criticalUnconfirmed,
    sectionScores,
    missingFieldIds,
    missingCriticalFieldIds,
    unconfirmedFieldIds,
    conflictFieldIds,
  });
}

function buildQuestion(
  definition: QuestionDefinition,
  fact: VacancyFact | undefined,
): Question {
  const mode: Question["mode"] =
    fact?.status === "conflict" || fact?.hasConflict
      ? "resolve_conflict"
      : fact?.status === "inferred"
        ? "confirm"
        : "collect";

  const wording =
    mode === "resolve_conflict"
      ? {
          de: `Es liegen widersprüchliche Angaben vor. ${definition.wording.de}`,
          en: `The available information conflicts. ${definition.wording.en}`,
        }
      : mode === "confirm"
        ? {
            de: `Bitte bestätigen oder korrigieren: ${definition.wording.de}`,
            en: `Please confirm or correct: ${definition.wording.en}`,
          }
        : definition.wording;

  const priority = Math.min(
    100,
    definition.priority +
      (mode === "resolve_conflict" ? 20 : mode === "confirm" ? 5 : 0),
  );

  return QuestionSchema.parse({
    id: definition.id,
    fieldId: definition.fieldId,
    wording,
    rationale: definition.rationale,
    answerType: definition.answerType,
    options: definition.options,
    dependencies: definition.dependencies,
    priority,
    allowNotApplicable: definition.allowNotApplicable,
    mode,
    status: "open",
    aggSafe: true,
    sensitive: false,
  });
}

export interface NextQuestionOptions {
  locale?: Locale;
  limit?: number;
}

export function selectNextQuestions(
  brief: VacancyBrief,
  options: NextQuestionOptions = {},
): Question[] {
  const facts = factMap(brief);
  const requestedLimit = Number.isFinite(options.limit) ? options.limit! : 3;
  const limit = Math.max(0, Math.min(3, Math.trunc(requestedLimit)));
  if (limit === 0) {
    return [];
  }

  return QUESTION_CATALOG.map((definition, catalogIndex) => {
    const fact = facts.get(definition.fieldId);
    const needsQuestion =
      !fact ||
      fact.status === "missing" ||
      fact.status === "inferred" ||
      fact.status === "conflict" ||
      (fact.status === "not_applicable" && !definition.allowNotApplicable) ||
      fact.hasConflict;
    const dependenciesSatisfied = definition.dependencies.every((dependency) =>
      dependencyIsSatisfied(dependency, facts),
    );
    if (!needsQuestion || !dependenciesSatisfied) {
      return null;
    }

    const conflictBoost = fact?.status === "conflict" || fact?.hasConflict ? 1_000 : 0;
    const inferredBoost = fact?.status === "inferred" ? 200 : 0;
    const criticalBoost = definition.critical ? 100 : 0;
    return {
      definition,
      fact,
      catalogIndex,
      rank:
        conflictBoost +
        inferredBoost +
        criticalBoost +
        definition.weight * 10 +
        definition.priority,
    };
  })
    .filter(
      (
        candidate,
      ): candidate is NonNullable<typeof candidate> => candidate !== null,
    )
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return right.rank - left.rank;
      }
      return left.catalogIndex - right.catalogIndex;
    })
    .slice(0, limit)
    .map(({ definition, fact }) => buildQuestion(definition, fact));
}

export function getLocalizedQuestionText(
  question: Question,
  locale: Locale,
): { text: string; rationale: string } {
  return {
    text: question.wording[locale],
    rationale: question.rationale[locale],
  };
}
