import type { Analysis, Fact, Locale, Question } from "@/lib/client-types";

export const clientFieldIds = ["role_title", "purpose", "responsibilities", "seniority", "skills", "location", "work_model", "employment", "salary", "leadership", "languages", "process"];
export const clientLabels: Record<Locale, Record<string, string>> = {
  en: { role_title: "Role title", purpose: "Business purpose", responsibilities: "Core outcomes", seniority: "Seniority", skills: "Critical skills", location: "Location", work_model: "Work model", employment: "Employment & hours", salary: "Salary range", leadership: "Leadership scope", languages: "Languages", process: "Selection process" },
  de: { role_title: "Stellentitel", purpose: "Geschäftlicher Zweck", responsibilities: "Kernergebnisse", seniority: "Seniorität", skills: "Kritische Skills", location: "Standort", work_model: "Arbeitsmodell", employment: "Anstellung & Stunden", salary: "Gehaltsband", leadership: "Führungsumfang", languages: "Sprachen", process: "Auswahlprozess" }
};

function firstLine(text: string) {
  return text.split(/\r?\n/).map((line) => line.replace(/^#+\s*/, "").trim()).find((line) => line.length > 3)?.slice(0, 100) ?? "Untitled vacancy";
}

function matchingLine(text: string, pattern: RegExp) {
  return text.split(/\r?\n/).map((line) => line.trim()).find((line) => line && pattern.test(line))?.slice(0, 220);
}

export function deterministicFacts(text: string, locale: Locale): Fact[] {
  const values: Record<string, string | undefined> = {
    role_title: firstLine(text),
    purpose: matchingLine(text, /(?:purpose|mission|ziel der rolle|auftrag|impact)/i),
    responsibilities: matchingLine(text, /(?:responsibilities|what you.?ll do|aufgaben|ihre rolle|your impact)/i),
    seniority: matchingLine(text, /(?:senior|lead|head of|leitung|specialist|manager|principal|junior)/i),
    skills: matchingLine(text, /(?:skills|requirements|qualifications|kenntnisse|anforderungen|erfahrung|experience)/i),
    location: matchingLine(text, /(?:location|standort|based in|arbeitsort|berlin|hamburg|munich|münchen|london|amsterdam|köln|cologne)/i),
    work_model: matchingLine(text, /(?:hybrid|remote|home.?office|office days|büro|vor ort|onsite|mobil)/i),
    employment: matchingLine(text, /(?:full.?time|part.?time|hours|stunden|vollzeit|teilzeit|permanent|unbefristet)/i),
    salary: matchingLine(text, /(?:€|EUR|GBP|£|salary|gehalt|vergütung).*(?:\d|competitive|markt|tarif)/i),
    leadership: matchingLine(text, /(?:leadership|manage|direct reports|führung|teamleitung|disziplinar|mentor)/i),
    languages: matchingLine(text, /(?:german|english|dutch|polish|deutsch|englisch|niederländisch|polnisch)/i),
    process: matchingLine(text, /(?:interview|selection process|auswahlprozess|gespräch|assessment)/i)
  };
  return clientFieldIds.map((id) => ({
    id,
    label: clientLabels[locale][id] ?? id,
    value: values[id] ?? "",
    status: values[id] ? "proposed" : "missing",
    confidence: values[id] ? (id === "role_title" ? 0.96 : 0.78) : undefined,
    evidence: values[id]
  }));
}

export const titleFromSource = firstLine;

export function questionsFor(facts: Fact[], locale: Locale): Question[] {
  const missing = new Set(facts.filter((fact) => fact.status === "missing").map((fact) => fact.id));
  const de = locale === "de";
  const templates: Record<string, Omit<Question, "id" | "factId">> = {
    purpose: {
      text: de ? "Welches konkrete Ergebnis soll diese Rolle in den ersten 12 Monaten erreichen?" : "What concrete outcome should this role achieve in its first 12 months?",
      rationale: de ? "Ein klares Ergebnis schärft Profil, Ansprache und spätere Erfolgsmessung." : "A clear outcome sharpens the profile, outreach, and later success measures."
    },
    salary: {
      text: de ? "Welcher Budgetkorridor ist für die Rolle freigegeben?" : "What budget corridor is approved for this role?",
      rationale: de ? "Das Budget beeinflusst Zielgruppe, Suchstrategie und Realisierbarkeit." : "Budget changes the target group, sourcing strategy, and feasibility."
    },
    work_model: {
      text: de ? "Wie viele Präsenztage sind tatsächlich erforderlich?" : "How many on-site days are genuinely required?",
      rationale: de ? "Präzise Präsenzanforderungen verändern die erreichbare Zielgruppe." : "Precise presence requirements materially change the reachable talent pool.",
      options: de ? ["Vor Ort", "1 Tag/Woche", "2–3 Tage/Woche", "Remote möglich"] : ["On-site", "1 day/week", "2–3 days/week", "Remote possible"]
    },
    leadership: {
      text: de ? "Umfasst die Rolle fachliche, disziplinarische oder keine Personalführung?" : "Does the role include functional, disciplinary, or no people leadership?",
      rationale: de ? "Führungsumfang beeinflusst Seniorität und Auswahlkriterien." : "Leadership scope affects seniority and selection evidence.",
      options: de ? ["Keine Führung", "Fachliche Führung", "Disziplinarische Führung", "Beides"] : ["No leadership", "Functional leadership", "Disciplinary leadership", "Both"]
    },
    process: {
      text: de ? "Welche Nachweise entscheiden im Auswahlprozess wirklich?" : "What evidence should genuinely decide the selection process?",
      rationale: de ? "Ein evidenzbasierter Prozess reduziert Bias und unnötige Runden." : "An evidence-led process reduces bias and unnecessary interview rounds."
    },
    responsibilities: {
      text: de ? "Welche drei Ergebnisse haben im Alltag höchste Priorität?" : "Which three outcomes matter most day to day?",
      rationale: de ? "Ergebnisse trennen unverzichtbare Verantwortung von optionalen Aufgaben." : "Outcomes separate essential responsibility from optional activity."
    }
  };
  return ["purpose", "salary", "work_model", "leadership", "process", "responsibilities"]
    .filter((id) => missing.has(id))
    .map((id) => ({ id: `q-${id}`, factId: id, ...templates[id]! }));
}

export function deterministicAnalysis(text: string, locale: Locale): Analysis {
  const facts = deterministicFacts(text, locale);
  return {
    title: firstLine(text),
    summary: locale === "de" ? "Quellenbasierter Entwurf. Offene Angaben werden gezielt geklärt." : "Source-backed draft. Open facts are queued for focused clarification.",
    facts,
    questions: questionsFor(facts, locale),
    esco: null,
    mode: "deterministic"
  };
}
