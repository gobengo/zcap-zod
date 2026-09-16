import { test } from "node:test";
import assert from "node:assert";
import { loadSpecExamples, parseExampleContent } from "./zcap-spec-examples.ts";
import { DelegatedZcap, RootZcap, Zcap, ZcapInvocation } from "../src/zcap-zod.ts";

/**
 * The version of the zcap-spec that `zcap-zod` implements.
 *
 * `etc/zcap-spec-examples.ndjson` is pinned to this below, so that a fixture
 * regenerated from a different version of the spec fails here loudly rather
 * than silently changing what these tests mean.
 */
const ZCAP_SPEC_URL = "https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/";

type Expectation =
  /** Conforms to the v0.4 data model, and to this schema in particular. */
  | { kind: "zcap"; schema: "root" | "delegated" | "invocation"; why: string }
  /** A zcap-shaped JSON document that does not satisfy the v0.4 MUSTs. */
  | { kind: "non-conformant"; why: string }
  /** Not a JSON document at all, so there is nothing for a schema to check. */
  | { kind: "not-a-document"; why: string };

/**
 * Every example in the zcap-spec, and what `zcap-zod` makes of it.
 *
 * Examples 1-5 are the informative "Zcap by Example" narrative. Their proofs
 * were modernised for v0.4 (they are Data Integrity proofs now), but the
 * capabilities themselves still lag the normative data model: none of them
 * carry the `expires` that the Delegated Capability section says a delegated
 * zcap MUST have. They are expected NOT to parse. (They also lack
 * `invocationTarget`, which zcap-zod does not require of delegated zcaps; see
 * `DelegatedZcap` in src/zcap-zod.ts.)
 *
 * @see https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/
 */
const expectations: Record<string, Expectation> = {
  "example-1": {
    kind: "non-conformant",
    why: "the narrative's root target document: it has `capabilityDelegation` rather than being a root zcap",
  },
  "example-2": {
    kind: "non-conformant",
    why: "narrative delegation: no expires",
  },
  "example-3": {
    kind: "non-conformant",
    why: "narrative invocation: the proof has no invocationTarget or capabilityAction, and carries the action as a top-level `action`",
  },
  "example-4": {
    kind: "non-conformant",
    why: "narrative delegation with a caveat: no expires",
  },
  "example-5": {
    kind: "non-conformant",
    why: "narrative delegation with a caveat and an embedded capabilityChain: no expires",
  },
  "example-6": { kind: "zcap", schema: "root", why: "normative root zcap" },
  "example-7": {
    kind: "zcap",
    schema: "root",
    why: "normative root zcap, dereferenced on a verifier",
  },
  "example-8": { kind: "zcap", schema: "delegated", why: "normative delegated zcap" },
  "example-9": {
    kind: "not-a-document",
    why: "an HTTP request invoking a zcap via the Capability-Invocation header",
  },
  "example-10": {
    kind: "not-a-document",
    why: "an HTTP request invoking a zcap via trailers",
  },
  "example-11": {
    kind: "not-a-document",
    why:
      "the Invocation JSON Proof example. It is JSON, but the spec marks it text/plain, so the extractor offers no object representation. " +
      "If that is fixed upstream it still would not conform: the capability embedded in its proof has no `expires`.",
  },
};

const schemas = {
  root: RootZcap,
  delegated: DelegatedZcap,
  invocation: ZcapInvocation,
} as const;

/** Render a ZodError as one readable line. */
function explain(error: { issues: readonly { path: PropertyKey[]; message: string }[] }) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join(" | ");
}

await test("the vendored examples came from the version zcap-zod targets", () => {
  for (const example of loadSpecExamples()) {
    assert.ok(
      example.url.startsWith(ZCAP_SPEC_URL),
      `${example.name} came from ${example.url}, not ${ZCAP_SPEC_URL}. ` +
        `Regenerate the fixture with: npm run fixture:update`,
    );
  }
});

await test("every vendored example has a recorded expectation", () => {
  assert.deepStrictEqual(
    loadSpecExamples().map((example) => example.name).sort(),
    Object.keys(expectations).sort(),
    "etc/zcap-spec-examples.ndjson no longer matches the expectations table",
  );
});

await test("zcap-zod parses every conformant example from the zcap-spec", async (t) => {
  for (const example of loadSpecExamples()) {
    const expectation = expectations[example.name];
    if (expectation?.kind !== "zcap") continue;
    const { schema: schemaName, why } = expectation;
    await t.test(`${example.name} parses as a ${schemaName} zcap`, () => {
      const exampleZcap = parseExampleContent(example);

      const asZcap = Zcap.safeParse(exampleZcap);
      assert.ok(
        asZcap.success,
        `${example.url} (${why}) should parse as a Zcap but got: ${
          asZcap.success ? "" : explain(asZcap.error)
        }`,
      );

      const specific = schemas[schemaName].safeParse(exampleZcap);
      assert.ok(
        specific.success,
        `${example.url} should parse as ${schemaName} but got: ${
          specific.success ? "" : explain(specific.error)
        }`,
      );
    });
  }
});

await test("zcap-zod rejects the informative examples that lag the v0.4 data model", async (t) => {
  for (const example of loadSpecExamples()) {
    const expectation = expectations[example.name];
    if (expectation?.kind !== "non-conformant") continue;
    await t.test(`${example.name} is not a conformant zcap`, () => {
      const exampleZcap = parseExampleContent(example);
      assert.ok(
        !Zcap.safeParse(exampleZcap).success,
        `${example.url} unexpectedly parsed as a conformant zcap; expected it to fail because ${expectation.why}`,
      );
    });
  }
});

await test("examples that are not JSON documents are out of scope", async (t) => {
  for (const example of loadSpecExamples()) {
    const expectation = expectations[example.name];
    if (expectation?.kind !== "not-a-document") continue;
    await t.test(`${example.name} (${example.mediaType}) has no object representation`, () => {
      assert.throws(
        () => parseExampleContent(example),
        `${example.url} now parses to an object (${expectation.why}), so it needs a schema expectation`,
      );
    });
  }
});
