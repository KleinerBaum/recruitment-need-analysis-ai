import { VACANCY_FIELD_IDS, type JsonValue, type VacancyFieldId } from "@/lib/contracts";
import type { Locale, Question } from "@/lib/client-types";

export const clientFieldIds = VACANCY_FIELD_IDS;

export const clientLabels: Record<Locale, Record<VacancyFieldId, string>> = {
  en: {
    "company.name": "Company name",
    "company.context": "Company context",
    "role.title": "Role title",
    "role.purpose": "Business purpose",
    "role.seniority": "Seniority",
    "role.employmentType": "Employment type",
    "role.startDate": "Target start",
    "role.headcount": "Headcount",
    "role.location": "Location",
    "role.workModel": "Work model",
    "role.remoteShare": "Remote share",
    "role.workingHours": "Working hours",
    "role.travel": "Travel",
    "role.leadershipScope": "Leadership scope",
    "tasks.outcomes": "Target outcomes",
    "tasks.responsibilities": "Responsibilities",
    "requirements.mustHaveSkills": "Must-have skills",
    "requirements.niceToHaveSkills": "Nice-to-have skills",
    "requirements.experience": "Required experience",
    "requirements.education": "Education / equivalent routes",
    "requirements.languages": "Languages",
    "requirements.certifications": "Certifications",
    "compensation.salaryRange": "Salary range",
    "compensation.benefits": "Benefits",
    "process.interviewStages": "Interview stages",
    "process.decisionOwners": "Decision owners",
    "process.timeline": "Selection timeline",
    "success.metrics": "Success measures",
  },
  de: {
    "company.name": "Unternehmen",
    "company.context": "Unternehmenskontext",
    "role.title": "Stellentitel",
    "role.purpose": "Geschäftlicher Zweck",
    "role.seniority": "Seniorität",
    "role.employmentType": "Beschäftigungsart",
    "role.startDate": "Zielstart",
    "role.headcount": "Anzahl Stellen",
    "role.location": "Standort",
    "role.workModel": "Arbeitsmodell",
    "role.remoteShare": "Remote-Anteil",
    "role.workingHours": "Arbeitszeit",
    "role.travel": "Reiseanteil",
    "role.leadershipScope": "Führungsumfang",
    "tasks.outcomes": "Zielergebnisse",
    "tasks.responsibilities": "Verantwortlichkeiten",
    "requirements.mustHaveSkills": "Muss-Skills",
    "requirements.niceToHaveSkills": "Kann-Skills",
    "requirements.experience": "Erforderliche Erfahrung",
    "requirements.education": "Qualifikation / gleichwertige Wege",
    "requirements.languages": "Sprachen",
    "requirements.certifications": "Zertifikate",
    "compensation.salaryRange": "Gehaltsband",
    "compensation.benefits": "Benefits",
    "process.interviewStages": "Interviewstufen",
    "process.decisionOwners": "Entscheidungsverantwortliche",
    "process.timeline": "Auswahlzeitplan",
    "success.metrics": "Erfolgskriterien",
  },
};

export function fieldLabel(fieldId: VacancyFieldId, locale: Locale): string {
  return clientLabels[locale][fieldId];
}

export function valueAsText(value: JsonValue): string {
  if (value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(valueAsText).filter(Boolean).join(", ");
  return JSON.stringify(value);
}

export function answerFromText(question: Question, input: string): JsonValue {
  const value = input.trim();
  if (question.answerType === "number" || question.answerType === "percentage") {
    return Number(value.replace(",", "."));
  }
  if (question.answerType === "multi_select") {
    return value.split(/[\n,;]+/u).map((item) => item.trim()).filter(Boolean);
  }
  return value;
}

export function valuesForField(facts: ReadonlyArray<{ id: VacancyFieldId; rawValue: JsonValue }>, fieldId: VacancyFieldId): string[] {
  const value = facts.find((fact) => fact.id === fieldId)?.rawValue;
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (typeof value === "string" && value.trim()) {
    return value.split(/[\n,;]+/u).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}
