import { createHmac, timingSafeEqual } from "node:crypto";

import {
  EscoOccupationAttestationSchema,
  EscoSkillRelationAttestationSchema,
  type EscoConcept,
  type EscoOccupationAttestation,
  type EscoSkillRelationAttestation,
  type Locale,
  type VacancyBrief,
  type VacancyFieldId,
} from "@/lib/contracts";

const MINIMUM_SECRET_BYTES = 32;
const SIGNATURE_SCHEME = "hmac-sha256-v1" as const;

type Environment = Record<string, string | undefined>;
type SigningOptions = { environment?: Environment };

export type EscoSkillRelationClaim = {
  briefId: string;
  occupationUri: string;
  occupationVersion: string;
  skillUri: string;
  skillLabel: string;
  skillLanguage: Locale;
  skillVersion: string;
  skillAlternativeLabels: readonly string[];
  skillDescription?: string;
  relation: "essential" | "optional";
};

export type EscoProvenanceErrorCode =
  | "esco_signing_not_configured"
  | "invalid_esco_attestation";

export class EscoProvenanceError extends Error {
  readonly code: EscoProvenanceErrorCode;
  readonly status: number;
  readonly retryable = false;

  constructor(code: EscoProvenanceErrorCode, message: string, status: number) {
    super(message);
    this.name = "EscoProvenanceError";
    this.code = code;
    this.status = status;
  }
}

function signingSecret(options: SigningOptions = {}): string {
  const secret = (options.environment ?? process.env).ESCO_PROVENANCE_SIGNING_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < MINIMUM_SECRET_BYTES) {
    throw new EscoProvenanceError(
      "esco_signing_not_configured",
      "ESCO provenance signing is not configured.",
      503,
    );
  }
  return secret;
}

function occupationPayload(concept: Pick<
  EscoConcept,
  | "uri"
  | "conceptType"
  | "preferredLabel"
  | "alternativeLabels"
  | "description"
  | "language"
  | "version"
>): string {
  return JSON.stringify([
    "needly-esco-occupation-v1",
    concept.uri,
    concept.conceptType,
    concept.preferredLabel,
    concept.alternativeLabels,
    concept.description ?? null,
    concept.language,
    concept.version,
  ]);
}

function skillRelationPayload(claim: EscoSkillRelationClaim): string {
  return JSON.stringify([
    "needly-esco-skill-relation-v1",
    claim.briefId,
    claim.occupationUri,
    claim.occupationVersion,
    claim.skillUri,
    claim.skillLabel,
    claim.skillLanguage,
    claim.skillVersion,
    claim.skillAlternativeLabels,
    claim.skillDescription ?? null,
    claim.relation,
  ]);
}

function signature(payload: string, options: SigningOptions = {}): string {
  return createHmac("sha256", signingSecret(options))
    .update(payload, "utf8")
    .digest("base64url");
}

function signaturesMatch(expected: string, received: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  return expectedBytes.length === receivedBytes.length
    && timingSafeEqual(expectedBytes, receivedBytes);
}

function invalidAttestation(message: string): never {
  throw new EscoProvenanceError("invalid_esco_attestation", message, 400);
}

export function attestEscoOccupation(
  concept: Pick<
    EscoConcept,
    | "uri"
    | "conceptType"
    | "preferredLabel"
    | "alternativeLabels"
    | "description"
    | "language"
    | "version"
  >,
  options: SigningOptions = {},
): EscoOccupationAttestation {
  if (concept.conceptType !== "occupation") {
    return invalidAttestation("Only ESCO occupation concepts can receive occupation attestations.");
  }
  return EscoOccupationAttestationSchema.parse({
    scheme: SIGNATURE_SCHEME,
    scope: "occupation",
    signature: signature(occupationPayload(concept), options),
  });
}

export function assertValidEscoOccupation(
  concept: EscoConcept,
  options: SigningOptions = {},
): void {
  if (concept.conceptType !== "occupation" || concept.attestation.scope !== "occupation") {
    return invalidAttestation("The ESCO occupation attestation has the wrong scope.");
  }
  const expected = signature(occupationPayload(concept), options);
  if (!signaturesMatch(expected, concept.attestation.signature)) {
    return invalidAttestation("The ESCO occupation attestation is invalid.");
  }
}

export function attestEscoSkillRelation(
  claim: EscoSkillRelationClaim,
  options: SigningOptions = {},
): EscoSkillRelationAttestation {
  return EscoSkillRelationAttestationSchema.parse({
    scheme: SIGNATURE_SCHEME,
    scope: "skill_relation",
    relation: claim.relation,
    signature: signature(skillRelationPayload(claim), options),
  });
}

export function assertValidEscoSkillRelation(
  claim: EscoSkillRelationClaim,
  attestation: EscoSkillRelationAttestation,
  options: SigningOptions = {},
): void {
  if (attestation.relation !== claim.relation) {
    return invalidAttestation("The ESCO relation attestation has the wrong relation type.");
  }
  const expected = signature(skillRelationPayload(claim), options);
  if (!signaturesMatch(expected, attestation.signature)) {
    return invalidAttestation("The ESCO skill-relation attestation is invalid.");
  }
}

export function escoRelationSourceId(claim: EscoSkillRelationClaim): string {
  const occupationId = claim.occupationUri.split("/").at(-1)?.toLocaleLowerCase() ?? "occupation";
  const skillId = claim.skillUri.split("/").at(-1)?.toLocaleLowerCase() ?? "skill";
  return `esco-relation-${claim.skillVersion}-${claim.relation}-${occupationId}-${skillId}`;
}

export function escoRelationEvidenceQuote(claim: EscoSkillRelationClaim): string {
  return claim.skillLanguage === "de"
    ? `ESCO ${claim.skillVersion}: „${claim.skillLabel}“ ist für den bestätigten Beruf eine ${claim.relation === "essential" ? "wesentliche" : "optionale"} Skill-Relation.`
    : `ESCO ${claim.skillVersion}: “${claim.skillLabel}” is an ${claim.relation} skill relation for the confirmed occupation.`;
}

function relationForField(fieldId: VacancyFieldId): "essential" | "optional" | null {
  if (fieldId === "requirements.mustHaveSkills") return "essential";
  if (fieldId === "requirements.niceToHaveSkills") return "optional";
  return null;
}

function sameAttestation(
  left: EscoSkillRelationAttestation,
  right: EscoSkillRelationAttestation,
): boolean {
  return left.scheme === right.scheme
    && left.scope === right.scope
    && left.relation === right.relation
    && left.signature === right.signature;
}

/**
 * Verify every persisted official ESCO claim before a server mutation echoes
 * or changes the brief. An ESCO-free brief does not require the signing secret.
 */
export function assertValidBriefEscoProvenance(
  brief: VacancyBrief,
  options: SigningOptions = {},
): void {
  const escoEvidence = brief.facts.flatMap((fact) => (
    fact.evidence
      .filter((evidence) => evidence.sourceType === "esco")
      .map((evidence) => ({ fact, evidence }))
  ));
  const hasClaim = Boolean(brief.esco.primaryOccupation)
    || brief.esco.secondaryOccupations.length > 0
    || brief.esco.skills.length > 0
    || escoEvidence.length > 0
    || brief.facts.some((fact) => (
      fact.provenance.sourceIds.some((sourceId) => sourceId.startsWith("esco-relation-"))
    ));
  if (!hasClaim) return;

  // Fail closed before interpreting any client-supplied signature.
  signingSecret(options);

  if (brief.esco.primaryOccupation) {
    assertValidEscoOccupation(brief.esco.primaryOccupation, options);
    if (brief.esco.primaryOccupation.language !== brief.locale) {
      return invalidAttestation("The primary ESCO occupation language must match the brief locale.");
    }
  }
  for (const occupation of brief.esco.secondaryOccupations) {
    assertValidEscoOccupation(occupation, options);
    if (occupation.language !== brief.locale) {
      return invalidAttestation("Secondary ESCO occupation languages must match the brief locale.");
    }
  }

  const primaryOccupation = brief.esco.primaryOccupation;
  if ((brief.esco.skills.length > 0 || escoEvidence.length > 0) && !primaryOccupation) {
    return invalidAttestation("ESCO skill provenance requires a signed primary occupation.");
  }

  for (const skill of brief.esco.skills) {
    if (skill.conceptType !== "skill" || skill.attestation.scope !== "skill_relation") {
      return invalidAttestation("The persisted ESCO skill has the wrong attestation scope.");
    }
    const skillAttestation = skill.attestation;
    const relation = skillAttestation.relation;
    if (
      skill.language !== brief.locale
      || skill.version !== primaryOccupation!.version
      || skill.alternativeLabels.length > 0
      || skill.description !== undefined
    ) {
      return invalidAttestation(
        "Persisted ESCO skills require the brief language, matching version, and canonical relation fields.",
      );
    }
    const claim: EscoSkillRelationClaim = {
      briefId: brief.id,
      occupationUri: primaryOccupation!.uri,
      occupationVersion: primaryOccupation!.version,
      skillUri: skill.uri,
      skillLabel: skill.preferredLabel,
      skillLanguage: skill.language,
      skillVersion: skill.version,
      skillAlternativeLabels: skill.alternativeLabels,
      ...(skill.description ? { skillDescription: skill.description } : {}),
      relation,
    };
    assertValidEscoSkillRelation(claim, skillAttestation, options);

    const targetFieldId = relation === "essential"
      ? "requirements.mustHaveSkills"
      : "requirements.niceToHaveSkills";
    const supportingFact = brief.facts.find((fact) => fact.fieldId === targetFieldId);
    const hasLabel = Array.isArray(supportingFact?.value)
      && supportingFact.value.some((value) => (
        typeof value === "string"
        && value.toLocaleLowerCase().trim() === skill.preferredLabel.toLocaleLowerCase().trim()
      ));
    const hasEvidence = supportingFact?.evidence.some((evidence) => (
      evidence.sourceType === "esco"
      && evidence.locator.url === skill.uri
      && evidence.language === skill.language
      && evidence.language === brief.locale
      && evidence.escoAttestation !== undefined
      && sameAttestation(evidence.escoAttestation, skillAttestation)
      && evidence.sourceId === escoRelationSourceId(claim)
      && evidence.quote === escoRelationEvidenceQuote(claim)
    ));
    if (!hasLabel || !hasEvidence) {
      return invalidAttestation("The persisted ESCO skill lacks matching fact evidence.");
    }
  }

  for (const { fact, evidence } of escoEvidence) {
    if (
      fact.status !== "user_confirmed"
      || fact.confidence !== 1
      || fact.provenance.origin !== "user"
      || fact.provenance.method !== "user_entry"
      || fact.hasConflict
      || fact.conflictDescription !== undefined
      || !fact.evidence.some((candidate) => candidate.sourceType === "user_answer")
    ) {
      return invalidAttestation(
        "ESCO-supported facts require canonical user-confirmed fact metadata.",
      );
    }
    const relation = relationForField(fact.fieldId);
    const attestation = evidence.escoAttestation;
    if (!relation || !attestation || attestation.relation !== relation || !evidence.locator.url) {
      return invalidAttestation("ESCO evidence is not compatible with its fact field.");
    }
    const skill = brief.esco.skills.find((candidate) => candidate.uri === evidence.locator.url);
    if (
      !skill
      || skill.attestation.scope !== "skill_relation"
      || !sameAttestation(attestation, skill.attestation)
    ) {
      return invalidAttestation("ESCO evidence does not match a persisted signed skill.");
    }
  }

  for (const fact of brief.facts) {
    const evidenceSourceIds = new Set(
      fact.evidence
        .filter((evidence) => evidence.sourceType === "esco")
        .map((evidence) => evidence.sourceId),
    );
    if (fact.provenance.sourceIds.some((sourceId) => (
      sourceId.startsWith("esco-relation-") && !evidenceSourceIds.has(sourceId)
    ))) {
      return invalidAttestation("ESCO provenance source IDs require matching signed evidence.");
    }
  }
}
