import * as z from "zod/v4"
import { URN } from "./zod-urn.ts"

/**
 * Zod schemas for the W3C CCG Authorization Capabilities (zcap) data model.
 *
 * Every constraint below is annotated with the normative statement it encodes.
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/
 */

export const ZCAP_V1_JSONLD_CONTEXT = "https://w3id.org/zcap/v1" as const
const ZcapJsonldContextUrl = z.literal(ZCAP_V1_JSONLD_CONTEXT)

/**
 * Recommended prefix for a root zcap `id`.
 *
 * > The ID of a root zcap SHOULD have the following format:
 * > `urn:zcap:root:` + encodeURIComponent(invocationTarget)
 *
 * This is a SHOULD, so it is exported for callers to apply rather than
 * enforced by {@link RootZcap}.
 */
export const ROOT_ZCAP_URN_PREFIX = "urn:zcap:root:" as const

/**
 * > A verifier SHOULD limit the length of the capability chain to 10.
 *
 * A verifier concern rather than a data model constraint, so it is exported
 * rather than enforced by {@link CapabilityChain}.
 */
export const RECOMMENDED_MAX_CAPABILITY_CHAIN_LENGTH = 10

/** Build the recommended root zcap id for an invocation target. */
export function rootZcapIdFor(invocationTarget: string): string {
  return `${ROOT_ZCAP_URN_PREFIX}${encodeURIComponent(invocationTarget)}`
}

/** "a string that expresses a URI" */
const URI = z.string().refine((value) => URL.canParse(value), {
  message: "Invalid URI",
})

/**
 * > a string or an array of strings that each express a URI that identifies a
 * > controller
 */
const Controller = z.union([URI, z.array(URI).min(1)])

/** > an `expires` field that expresses an XSD date-time */
const XsdDateTime = z.iso.datetime({ offset: true })

/** A JSON-LD `@context` entry: a URL, or an inline context definition. */
const JsonLdContextEntry = z.union([z.string(), z.record(z.string(), z.unknown())])

/**
 * > A delegated zcap MAY have an `allowedAction` field that is a string or an
 * > array of strings
 */
const AllowedAction = z.union([z.string(), z.array(z.string())])

// ---------------------------------------------------------------------------
// Root zcap
// ---------------------------------------------------------------------------

/**
 * The initial expression of a capability, before it has been delegated.
 *
 * Declared with {@link z.strictObject} because:
 * > Note: A root zcap MUST NOT have any other fields.
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#root-capability
 */
export const RootZcap = z.strictObject({
  /**
   * > A root zcap MUST have an `@context` field that is a string with the value
   * > `https://w3id.org/zcap/v1`.
   */
  "@context": z.literal(ZCAP_V1_JSONLD_CONTEXT, {
    error: `A root zcap MUST have an @context field that is a string with the value "${ZCAP_V1_JSONLD_CONTEXT}".`,
  }),
  /**
   * > A root zcap MUST have an `id` that is a string that expresses a URN.
   *
   * The `urn:zcap:root:` format is a SHOULD; see {@link ROOT_ZCAP_URN_PREFIX}.
   */
  id: URN,
  /**
   * > A root zcap MUST have an `invocationTarget` that is a string that
   * > expresses a URI.
   */
  invocationTarget: URI,
  /**
   * > A root zcap MUST have a `controller` that is a string or an array of
   * > strings that each express a URI that identifies a controller for the root
   * > zcap.
   */
  controller: Controller,
})

// ---------------------------------------------------------------------------
// Proofs
// ---------------------------------------------------------------------------

/**
 * The minimum a proof must look like to be sorted by purpose.
 *
 * The shape and verification of the proof itself are out of scope for
 * `zcap-zod`; that is Data Integrity's job.
 */
const AnyProof = z.looseObject({
  proofPurpose: z.string(),
})

/** Describe a JSON value's type for an error message: "a string", "null", ... */
function describeJsonType(value: unknown): string {
  if (value === null) return "null"
  if (Array.isArray(value)) return "an array"
  return typeof value === "object" ? "an object" : `a ${typeof value}`
}

/**
 * > a `proof` field that is an object or an array of objects
 *
 * Without a custom error, zod reports any mismatch of this union as just
 * "Invalid input", so the message says which of the ways it went wrong.
 *
 * @param missing the message for a document with no `proof` at all
 */
function proofOrProofSet(missing: string) {
  return z.union([AnyProof, z.array(AnyProof).min(1)], {
    error: ({ input }) => {
      if (input === undefined) return missing
      if (typeof input !== "object" || input === null) {
        return `proof MUST be an object or an array of objects, not ${describeJsonType(input)}.`
      }
      const proofs: unknown[] = Array.isArray(input) ? input : [input]
      const index = proofs.findIndex(
        (proof) =>
          typeof proof !== "object" ||
          proof === null ||
          Array.isArray(proof) ||
          typeof (proof as { proofPurpose?: unknown }).proofPurpose !== "string",
      )
      const where = Array.isArray(input) ? `proof[${index}]` : "proof"
      const bad = proofs[index]
      return typeof bad === "object" && bad !== null && !Array.isArray(bad)
        ? `Each proof MUST have a string proofPurpose saying what it is for; ${where} has none.`
        : `Each proof MUST be an object; ${where} is ${describeJsonType(bad)}.`
    },
  })
}

/**
 * The ordered ancestry of a delegated zcap.
 *
 * > A capability delegation chain MUST be an array that includes the root zcap
 * > using its ID (i.e., by reference only, not embedded) and every other
 * > delegated zcap in its ancestry must be referenced by ID except for the
 * > parent delegated zcap, which MUST be fully embedded.
 *
 * > The capability delegation chain is ordered; the first entry MUST be the
 * > root zcap's ID and any other entries must be in the order of delegation
 * > from least recent to most recent.
 */
export const CapabilityChain: z.ZodType<Array<unknown>> = z
  .array(z.union([z.string(), z.lazy(() => DelegatedZcap)]))
  .min(1)
  .superRefine((chain, ctx) => {
    if (typeof chain[0] !== "string") {
      ctx.addIssue({
        code: "custom",
        path: [0],
        message:
          "The first entry of a capabilityChain MUST be the root zcap's ID, by reference only (not embedded).",
      })
    }
    // Only the last entry -- the parent delegated zcap -- may be embedded.
    for (let i = 1; i < chain.length - 1; i++) {
      if (typeof chain[i] !== "string") {
        ctx.addIssue({
          code: "custom",
          path: [i],
          message:
            "Only the parent delegated zcap (the last capabilityChain entry) may be embedded; ancestors MUST be referenced by ID.",
        })
      }
    }
  })

/**
 * > A delegated zcap MUST have a capability delegation proof which MUST contain
 * > the delegation chain.
 *
 * Only the two properties the zcap-spec names normatively are constrained here.
 * The rest of the proof -- `type`, `cryptosuite`, `verificationMethod`,
 * `created`, `proofValue` -- is Data Integrity's shape, not zcap's, and is out
 * of scope for this library: pass the proof to a DI implementation to check it.
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#delegated-capability
 */
export const CapabilityDelegationProof = z.looseObject({
  proofPurpose: z.literal("capabilityDelegation"),
  get capabilityChain() {
    return CapabilityChain
  },
})

/**
 * > an invocation consists of a linked data object which MUST have a proof
 * > property with a value containing: a proofPurpose of capabilityInvocation,
 * > a capability property which links to the capability document that grants
 * > authority to invoke this capability
 *
 * > The capability invocation proof MUST include the intended
 * > `invocationTarget`, the root zcap ID in the `capability` property, and the
 * > action to be taken in the `capabilityAction` property.
 *
 * `capability` may also be a fully embedded delegated zcap, because
 * > A delegated zcap can only be invoked by submitting the entire zcap.
 *
 * As with {@link CapabilityDelegationProof}, the Data Integrity properties of
 * the proof are out of scope and left unconstrained.
 */
export const CapabilityInvocationProof = z.looseObject({
  proofPurpose: z.literal("capabilityInvocation"),
  capability: z.union([URI, z.lazy(() => DelegatedZcap)]),
  invocationTarget: URI,
  capabilityAction: z.string(),
})

/**
 * Build a refinement asserting a document carries at least one proof of
 * `purpose` that conforms to `proofSchema`.
 */
function requireConformingProof(proofSchema: z.ZodType, purpose: string) {
  return (document: { proof?: unknown }, ctx: z.RefinementCtx) => {
    const proofs = Array.isArray(document.proof) ? document.proof : [document.proof]
    const candidates = proofs.filter(
      (proof) =>
        typeof proof === "object" &&
        proof !== null &&
        (proof as { proofPurpose?: unknown }).proofPurpose === purpose,
    )
    if (candidates.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["proof"],
        message: `At least one proof MUST have a proofPurpose of "${purpose}".`,
      })
      return
    }
    if (candidates.some((candidate) => proofSchema.safeParse(candidate).success)) return
    const result = proofSchema.safeParse(candidates[0])
    const why = result.success
      ? ""
      : result.error.issues
          .map((issue) => `${issue.path.join(".") || "(proof)"}: ${issue.message}`)
          .join("; ")
    ctx.addIssue({
      code: "custom",
      path: ["proof"],
      message: `No conforming "${purpose}" proof. ${why}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Delegated zcap
// ---------------------------------------------------------------------------

/**
 * A zcap delegated from a root zcap or from another delegated zcap.
 *
 * Unknown properties are preserved rather than rejected: a delegated zcap is a
 * JSON-LD document whose `@context` may define additional vocabulary.
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#delegated-capability
 */
export const DelegatedZcap = z
  .looseObject({
    /**
     * > A delegated zcap MUST have an `@context` field with an array where the
     * > first value is the zcapld context `https://w3id.org/zcap/v1`, and any
     * > subsequent values identify context(s) used to define vocabulary terms
     * > used in the capability delegation proof.
     */
    "@context": z.tuple([ZcapJsonldContextUrl], JsonLdContextEntry, {
      error: `A delegated zcap MUST have an @context field with an array where the first value is "${ZCAP_V1_JSONLD_CONTEXT}".`,
    }),
    /**
     * > A delegated zcap MUST have an `id` that is a string that expresses a
     * > URI.
     *
     * The spec adds that the id SHOULD be a `urn:uuid:`, which is not enforced.
     */
    id: URI,
    /**
     * > A delegated zcap MUST have a `parentCapability` that is a string that
     * > expresses the ID of the parent zcap.
     */
    parentCapability: URI,
    /**
     * > A delegated zcap MUST have a `controller` that is a string or an array
     * > of strings that each express a URI that identifies a controller for the
     * > delegated zcap.
     */
    controller: Controller,
    /**
     * > A [delegated] zcap MUST have an `invocationTarget` that is a string that
     * > expresses a URI.
     *
     * Note: the spec text in the Delegated Capability section reads "A root zcap
     * MUST have an `invocationTarget`", which appears to be an editorial slip --
     * the surrounding prose (invocation target attenuation against the parent's
     * target) and Example 7 both treat this as a delegated zcap property.
     *
     * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#delegated-capability
     */
    invocationTarget: URI,
    /**
     * > A delegated zcap MUST have an `expires` field that expresses an XSD
     * > date-time
     */
    expires: XsdDateTime,
    /**
     * > A delegated zcap MAY have an `allowedAction` field that is a string or
     * > an array of strings that each express an action that the controller of
     * > the zcap may take when invoking the capability.
     */
    allowedAction: AllowedAction.optional(),
    /**
     * > A delegated zcap MUST have a `proof` field that is an object or an array
     * > of objects that each express a DI proof. At least one of these proofs
     * > MUST be a zcap capability delegation proof.
     */
    proof: proofOrProofSet(
      "A delegated zcap MUST have a proof field that is an object or an array of objects, at least one of which is a capabilityDelegation proof.",
    ),
  })
  .superRefine(requireConformingProof(CapabilityDelegationProof, "capabilityDelegation"))

// ---------------------------------------------------------------------------
// Invocation
// ---------------------------------------------------------------------------

/**
 * A document that invokes a capability.
 *
 * The spec describes this only as "a linked data object" carrying a
 * capabilityInvocation proof, so `@context` is optional here and no shape is
 * imposed on the rest of the document.
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#invocation
 */
export const ZcapInvocation = z
  .looseObject({
    "@context": z
      .union([JsonLdContextEntry, z.array(JsonLdContextEntry).min(1)])
      .optional(),
    /** > An invocation SHOULD have an id (which may also serve as a nonce). */
    id: URI.optional(),
    /**
     * > an invocation consists of a linked data object which MUST have a proof
     * > property with a value containing: a proofPurpose of
     * > capabilityInvocation
     */
    proof: proofOrProofSet(
      "An invocation MUST have a proof property with a capabilityInvocation proof (an object, or an array of objects).",
    ),
  })
  .superRefine(requireConformingProof(CapabilityInvocationProof, "capabilityInvocation"))

// ---------------------------------------------------------------------------

/** Any conforming zcap document: a root zcap, a delegated zcap, or an invocation. */
export const Zcap = z.union([RootZcap, DelegatedZcap, ZcapInvocation])

export type RootZcap = z.infer<typeof RootZcap>
export type DelegatedZcap = z.infer<typeof DelegatedZcap>
export type ZcapInvocation = z.infer<typeof ZcapInvocation>
export type Zcap = z.infer<typeof Zcap>
