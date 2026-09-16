import { test } from "node:test";
import assert from "node:assert";
import {
  DelegatedZcap,
  RootZcap,
  ROOT_ZCAP_URN_PREFIX,
  Zcap,
  ZcapInvocation,
  rootZcapIdFor,
} from "../src/zcap-zod.ts";

/**
 * Data model tests, one per normative statement in the zcap-spec.
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/
 */

const INVOCATION_TARGET = "https://example.com/foo";
const ROOT_ID = rootZcapIdFor(INVOCATION_TARGET);

const validRoot = {
  "@context": "https://w3id.org/zcap/v1",
  id: ROOT_ID,
  controller: "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
  invocationTarget: INVOCATION_TARGET,
};

const validDelegated = {
  "@context": [
    "https://w3id.org/zcap/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
  ],
  id: "urn:uuid:cdc77118-6bfa-11ec-aceb-10bf48838a41",
  parentCapability: ROOT_ID,
  controller: "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
  invocationTarget: INVOCATION_TARGET,
  expires: "2021-11-03T18:33:51Z",
  allowedAction: ["write", "read"],
  proof: {
    type: "Ed25519Signature2020",
    created: "2021-10-27T18:33:51Z",
    verificationMethod:
      "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9#z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
    proofPurpose: "capabilityDelegation",
    capabilityChain: [ROOT_ID],
    proofValue: "z3t9BCQyF21MDVYmLKc9zbLreqx4wBtQnUsd5aqyoWS5FfhapRz7QjPNLcgKAornUVmJR4ZjbGpuxRFnffxX1ZjtF",
  },
};

const validInvocation = {
  "@context": "https://w3id.org/zcap/v1",
  id: "urn:uuid:ad86cb2c-e9db-434a-beae-71b82120a8a4",
  proof: {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    created: "2021-10-27T18:33:51Z",
    verificationMethod:
      "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9#z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
    proofPurpose: "capabilityInvocation",
    capability: ROOT_ID,
    invocationTarget: INVOCATION_TARGET,
    capabilityAction: "read",
    proofValue: "z3t9BCQyF21MDVYmLKc9zbLreqx4wBtQnUsd5aqyoWS5FfhapRz7QjPNLcgKAornUVmJR4ZjbGpuxRFnffxX1ZjtF",
  },
};

/** Structured-clone `base` and apply `changes`; `undefined` deletes a key. */
function withChanges(base: object, changes: Record<string, unknown>): unknown {
  const next = structuredClone(base) as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

function assertAccepts(schema: { safeParse(v: unknown): { success: boolean } }, value: unknown, why: string) {
  const result = schema.safeParse(value) as { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } };
  assert.ok(
    result.success,
    `expected to accept (${why}) but got: ${result.error?.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join(" | ")}`,
  );
}

function assertRejects(schema: { safeParse(v: unknown): { success: boolean } }, value: unknown, why: string) {
  assert.ok(!schema.safeParse(value).success, `expected to reject (${why})`);
}

/** The [path, message] of every issue, for asserting on error messages. */
function issuesOf(schema: { safeParse(v: unknown): { success: boolean } }, value: unknown): [string, string][] {
  const result = schema.safeParse(value) as { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } };
  assert.ok(!result.success, "expected to reject");
  return result.error!.issues.map((i) => [i.path.join("."), i.message]);
}

await test("root zcap", async (t) => {
  await t.test("accepts a conformant root zcap", () => {
    assertAccepts(RootZcap, validRoot, "all four required fields");
    assertAccepts(Zcap, validRoot, "via the Zcap union");
  });

  await t.test("rootZcapIdFor builds the RECOMMENDED urn:zcap:root: id", () => {
    assert.strictEqual(ROOT_ID, `${ROOT_ZCAP_URN_PREFIX}https%3A%2F%2Fexample.com%2Ffoo`);
  });

  // "A root zcap MUST have a `controller` ..."
  await t.test("requires controller", () => {
    assertRejects(RootZcap, withChanges(validRoot, { controller: undefined }), "controller is REQUIRED");
  });

  // "A root zcap MUST have an `id` that is a string that expresses a URN."
  await t.test("requires the id to be a URN", () => {
    assertRejects(RootZcap, withChanges(validRoot, { id: "https://example.com/root" }), "id MUST be a URN");
  });

  // "A root zcap MUST have an `@context` field that is a string ..."
  await t.test("requires @context to be a string, not an array", () => {
    assertRejects(RootZcap, withChanges(validRoot, { "@context": ["https://w3id.org/zcap/v1"] }), "root @context MUST be a string");
  });

  await t.test("explains a missing @context by quoting the spec", () => {
    const result = RootZcap.safeParse(withChanges(validRoot, { "@context": undefined }));
    assert.ok(!result.success);
    assert.deepStrictEqual(
      result.error.issues.map((i) => [i.path.join("."), i.message]),
      [["@context", 'A root zcap MUST have an @context field that is a string with the value "https://w3id.org/zcap/v1".']],
    );
  });

  // "Note: A root zcap MUST NOT have any other fields."
  await t.test("rejects any other field", () => {
    assertRejects(RootZcap, withChanges(validRoot, { allowedAction: ["read"] }), "root MUST NOT have other fields");
    assertRejects(RootZcap, withChanges(validRoot, { expires: "2021-11-03T18:33:51Z" }), "root MUST NOT have other fields");
    assertRejects(Zcap, withChanges(validRoot, { unrecognized: true }), "root MUST NOT have other fields");
  });

  await t.test("accepts an array of controllers", () => {
    assertAccepts(RootZcap, withChanges(validRoot, { controller: ["did:key:zA", "did:key:zB"] }), "controller may be an array");
  });
});

await test("delegated zcap", async (t) => {
  await t.test("accepts a conformant delegated zcap", () => {
    assertAccepts(DelegatedZcap, validDelegated, "spec example 7");
    assertAccepts(Zcap, validDelegated, "via the Zcap union");
  });

  // The spec's Delegated Capability section says "A root zcap MUST have an
  // `invocationTarget`" -- likely a slip for "delegated", but not normative
  // as written, so it is not required.
  await t.test("does not require invocationTarget, but checks it when present", () => {
    assertAccepts(DelegatedZcap, withChanges(validDelegated, { invocationTarget: undefined }), "no normative MUST for delegated zcaps");
    assertRejects(DelegatedZcap, withChanges(validDelegated, { invocationTarget: "not a uri" }), "invocationTarget MUST express a URI");
  });

  for (const required of ["id", "parentCapability", "controller", "expires", "proof"]) {
    await t.test(`requires ${required}`, () => {
      assertRejects(DelegatedZcap, withChanges(validDelegated, { [required]: undefined }), `${required} is REQUIRED`);
    });
  }

  // "MUST have an `@context` field with an array where the first value is ..."
  await t.test("requires @context to be an array starting with the zcap context", () => {
    assertRejects(DelegatedZcap, withChanges(validDelegated, { "@context": "https://w3id.org/zcap/v1" }), "delegated @context MUST be an array");
    assertRejects(
      DelegatedZcap,
      withChanges(validDelegated, { "@context": ["https://autopower.example/", "https://w3id.org/zcap/v1"] }),
      "the zcap context MUST be first",
    );
  });

  await t.test("explains a missing @context by quoting the spec", () => {
    const result = DelegatedZcap.safeParse(withChanges(validDelegated, { "@context": undefined }));
    assert.ok(!result.success);
    assert.deepStrictEqual(
      result.error.issues.map((i) => [i.path.join("."), i.message]),
      [["@context", 'A delegated zcap MUST have an @context field with an array where the first value is "https://w3id.org/zcap/v1".']],
    );
  });

  await t.test("explains what is wrong with proof", () => {
    assert.deepStrictEqual(issuesOf(DelegatedZcap, withChanges(validDelegated, { proof: undefined })), [
      ["proof", "A delegated zcap MUST have a proof field that is an object or an array of objects, at least one of which is a capabilityDelegation proof."],
    ]);
    assert.deepStrictEqual(issuesOf(DelegatedZcap, withChanges(validDelegated, { proof: "z3t9" })), [
      ["proof", "proof MUST be an object or an array of objects, not a string."],
    ]);
    assert.deepStrictEqual(issuesOf(DelegatedZcap, withChanges(validDelegated, { proof: { type: "DataIntegrityProof" } })), [
      ["proof", "Each proof MUST have a string proofPurpose saying what it is for; proof has none."],
    ]);
    assert.deepStrictEqual(issuesOf(DelegatedZcap, withChanges(validDelegated, { proof: [validDelegated.proof, 42] })), [
      ["proof", "Each proof MUST be an object; proof[1] is a number."],
    ]);
  });

  // "an `expires` field that expresses an XSD date-time"
  await t.test("requires expires to be an XSD date-time", () => {
    assertRejects(DelegatedZcap, withChanges(validDelegated, { expires: "soon" }), "expires MUST be a date-time");
    assertRejects(DelegatedZcap, withChanges(validDelegated, { expires: "2021-11-03" }), "expires MUST be a date-time, not a date");
    assertAccepts(DelegatedZcap, withChanges(validDelegated, { expires: "2021-11-03T18:33:51+01:00" }), "an offset is a valid XSD date-time");
  });

  // "an `allowedAction` field that is a string or an array of strings"
  await t.test("accepts allowedAction as a string or an array of strings", () => {
    assertAccepts(DelegatedZcap, withChanges(validDelegated, { allowedAction: "read" }), "allowedAction may be a string");
    assertAccepts(DelegatedZcap, withChanges(validDelegated, { allowedAction: undefined }), "allowedAction is OPTIONAL");
    assertRejects(DelegatedZcap, withChanges(validDelegated, { allowedAction: [1, 2] }), "allowedAction entries MUST be strings");
  });

  // "a `proof` field that is an object or an array of objects ...
  //  At least one of these proofs MUST be a zcap capability delegation proof."
  await t.test("accepts a proof set and requires a delegation proof in it", () => {
    assertAccepts(DelegatedZcap, withChanges(validDelegated, { proof: [validDelegated.proof] }), "proof may be an array");
    assertAccepts(
      DelegatedZcap,
      withChanges(validDelegated, {
        proof: [{ type: "DataIntegrityProof", proofPurpose: "assertionMethod" }, validDelegated.proof],
      }),
      "at least one delegation proof is present",
    );
    assertRejects(
      DelegatedZcap,
      withChanges(validDelegated, { proof: [{ type: "DataIntegrityProof", proofPurpose: "assertionMethod" }] }),
      "no capabilityDelegation proof",
    );
  });

  // The shape of a Data Integrity proof is out of scope for zcap-zod.
  await t.test("does not constrain the Data Integrity properties of the proof", () => {
    assertAccepts(
      DelegatedZcap,
      withChanges(validDelegated, {
        proof: withChanges(validDelegated.proof, {
          type: undefined,
          created: undefined,
          verificationMethod: undefined,
          proofValue: undefined,
        }),
      }),
      "DI proof properties are checked by a DI implementation, not by this schema",
    );
  });

  // "A delegated zcap MUST have a capability delegation proof which MUST
  //  contain the delegation chain."
  await t.test("requires capabilityChain on the delegation proof", () => {
    assertRejects(
      DelegatedZcap,
      withChanges(validDelegated, { proof: withChanges(validDelegated.proof, { capabilityChain: undefined }) }),
      "capabilityChain is REQUIRED",
    );
    assertRejects(
      DelegatedZcap,
      withChanges(validDelegated, { proof: withChanges(validDelegated.proof, { capabilityChain: [] }) }),
      "capabilityChain MUST include the root zcap",
    );
  });

  // "the first entry MUST be the root zcap's ID ... every other delegated zcap
  //  in its ancestry must be referenced by ID except for the parent delegated
  //  zcap, which MUST be fully embedded."
  await t.test("constrains the shape of the capability chain", () => {
    const embeddedParent = structuredClone(validDelegated);
    assertAccepts(
      DelegatedZcap,
      withChanges(validDelegated, {
        id: "urn:uuid:6b1c9bd0-1d0e-4d23-9f2f-3f5f9d1b0a11",
        parentCapability: embeddedParent.id,
        proof: withChanges(validDelegated.proof, { capabilityChain: [ROOT_ID, embeddedParent] }),
      }),
      "the parent delegated zcap is fully embedded, ancestors by reference",
    );
    assertRejects(
      DelegatedZcap,
      withChanges(validDelegated, {
        proof: withChanges(validDelegated.proof, { capabilityChain: [embeddedParent, ROOT_ID] }),
      }),
      "the root zcap MUST be first, and by reference only",
    );
    assertRejects(
      DelegatedZcap,
      withChanges(validDelegated, {
        proof: withChanges(validDelegated.proof, {
          capabilityChain: [ROOT_ID, embeddedParent, "urn:uuid:aaaaaaaa-0000-0000-0000-000000000000"],
        }),
      }),
      "only the last (parent) entry may be embedded",
    );
  });

  // Delegated zcaps are JSON-LD; extra vocabulary is carried, not rejected.
  await t.test("preserves unrecognized JSON-LD properties", () => {
    const parsed = DelegatedZcap.parse(withChanges(validDelegated, { caveat: [{ type: "ValidWhileTrue" }] }));
    assert.deepStrictEqual((parsed as Record<string, unknown>).caveat, [{ type: "ValidWhileTrue" }]);
  });
});

await test("invocation", async (t) => {
  await t.test("explains what is wrong with proof", () => {
    assert.deepStrictEqual(issuesOf(ZcapInvocation, withChanges(validInvocation, { proof: undefined })), [
      ["proof", "An invocation MUST have a proof property with a capabilityInvocation proof (an object, or an array of objects)."],
    ]);
    assert.deepStrictEqual(issuesOf(ZcapInvocation, withChanges(validInvocation, { proof: "z3t9" })), [
      ["proof", "proof MUST be an object or an array of objects, not a string."],
    ]);
    assert.deepStrictEqual(issuesOf(ZcapInvocation, withChanges(validInvocation, { proof: { type: "DataIntegrityProof" } })), [
      ["proof", "Each proof MUST have a string proofPurpose saying what it is for; proof has none."],
    ]);
    assert.deepStrictEqual(issuesOf(ZcapInvocation, withChanges(validInvocation, { proof: [validInvocation.proof, 42] })), [
      ["proof", "Each proof MUST be an object; proof[1] is a number."],
    ]);
  });

  await t.test("accepts a conformant invocation", () => {
    assertAccepts(ZcapInvocation, validInvocation, "all required proof properties");
    assertAccepts(Zcap, validInvocation, "via the Zcap union");
  });

  // "An invocation SHOULD have an id (which may also serve as a nonce)."
  await t.test("does not require an id", () => {
    assertAccepts(ZcapInvocation, withChanges(validInvocation, { id: undefined }), "id is only a SHOULD");
  });

  // "The capability invocation proof MUST include the intended
  //  `invocationTarget`, the root zcap ID in the `capability` property, and the
  //  action to be taken in the `capabilityAction` property."
  for (const required of ["capability", "invocationTarget", "capabilityAction"]) {
    await t.test(`requires proof.${required}`, () => {
      assertRejects(
        ZcapInvocation,
        withChanges(validInvocation, { proof: withChanges(validInvocation.proof, { [required]: undefined }) }),
        `proof.${required} is REQUIRED`,
      );
    });
  }

  // "A delegated zcap can only be invoked by submitting the entire zcap."
  await t.test("accepts a fully embedded delegated zcap as the invoked capability", () => {
    assertAccepts(
      ZcapInvocation,
      withChanges(validInvocation, { proof: withChanges(validInvocation.proof, { capability: validDelegated }) }),
      "capability may be an embedded delegated zcap",
    );
  });

  // The shape of a Data Integrity proof is out of scope for zcap-zod.
  await t.test("does not constrain the Data Integrity properties of the proof", () => {
    assertAccepts(
      ZcapInvocation,
      withChanges(validInvocation, {
        proof: withChanges(validInvocation.proof, {
          type: undefined,
          cryptosuite: undefined,
          created: undefined,
          verificationMethod: undefined,
          proofValue: undefined,
        }),
      }),
      "DI proof properties are checked by a DI implementation, not by this schema",
    );
  });

  await t.test("requires a capabilityInvocation proof", () => {
    assertRejects(
      ZcapInvocation,
      withChanges(validInvocation, { proof: withChanges(validInvocation.proof, { proofPurpose: "assertionMethod" }) }),
      "proofPurpose MUST be capabilityInvocation",
    );
  });
});
