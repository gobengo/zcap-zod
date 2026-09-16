# zcap-zod

[Zod](https://zod.dev) schemas for the [W3C CCG Authorization Capabilities (zcap)](https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/) data model.

Parse and validate root zcaps, delegated zcaps, and capability invocations. Every constraint in the schemas is annotated with the normative statement from the spec that it encodes.

In TypeScript, a successful parse also hands you a **typed** value, so the rest of your code can rely on a zcap's shape without checking it again. See [Why parse? (for TypeScript developers)](#why-parse-for-typescript-developers).

Paste this into any `.html` file. It needs no install and no build:

```html
<script type="module">
  import { RootZcap } from "https://gobengo.github.io/zcap-zod/zcap-zod/index.js"

  const root = RootZcap.parse({
    "@context": "https://w3id.org/zcap/v1",
    id: "urn:zcap:root:https%3A%2F%2Fexample.com%2Ffoo",
    controller: "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
    invocationTarget: "https://example.com/foo",
  })
  console.log(root)
</script>
```

That URL serves the build of the latest commit on `main`, with `zod` included. The [site](https://gobengo.github.io/zcap-zod/) checks zcaps from any URL and runs smoke tests against the same build.

**With Node.js, a bundler, or an import map**, import from `"zcap-zod"` instead:

```js
import { RootZcap } from "zcap-zod"
```

In Node.js or a bundler, [install the package](#install) first. In a browser, map the name with an import map:

```html
<script type="importmap">
  { "imports": { "zcap-zod": "https://gobengo.github.io/zcap-zod/zcap-zod/index.js" } }
</script>
<script type="module">
  import { RootZcap } from "zcap-zod"
</script>
```

## Why parse? (for TypeScript developers)

`JSON.parse` and `await request.json()` return `any`. TypeScript knows nothing about the value, so it lets everything through: a misspelled field, a field that isn't there, or passing the value to a function that expects something else entirely.

```ts
const body = await request.json() // any
body.expiers                      // compiles; undefined at runtime
isExpired(body)                   // compiles, whatever body really is
```

Typing it as `unknown` is honest, but then every function that touches it has to check the shape first.

The alternative is to parse **once**, where the data enters your program. What comes out has a type that describes a conforming zcap, and functions written against that type don't need to re-check anything:

```ts
import { DelegatedZcap } from "zcap-zod"

// These take a DelegatedZcap, not raw JSON. No checking that `expires`
// exists, or whether `controller` is a string or an array: the type says so.
function isExpired(zcap: DelegatedZcap, now = new Date()): boolean {
  return new Date(zcap.expires) <= now
}

function controllers(zcap: DelegatedZcap): string[] {
  return typeof zcap.controller === "string" ? [zcap.controller] : zcap.controller
}

export async function handle(request: Request) {
  const body: unknown = await request.json()
  isExpired(body)   // ✗ type error: 'unknown' is not assignable to 'DelegatedZcap'

  const zcap = DelegatedZcap.parse(body) // throws if body doesn't conform
  isExpired(zcap)   // ✓
  controllers(zcap) // ✓ and your editor autocompletes zcap.expires, zcap.controller, …
}
```

The compiler now stops unvalidated data from reaching `isExpired`. And `.parse()` checks what a type can't express: that `id` is a URI, that `expires` is a date-time, that there is a `capabilityDelegation` proof.

One nuance: delegated zcaps and invocations keep properties they don't recognize (they are JSON-LD, and `@context` can add vocabulary), so their types allow extra keys with type `unknown`. A typo like `zcap.expiers` compiles there, but you can't use it as a string without checking it first. `RootZcap` is strict, so a typo on a root zcap is a compile error.

### What "TypeScript-first" means

[Zod](https://zod.dev), which these schemas are built with, calls itself "TypeScript-first". It means you write the schema once, and the TypeScript type is *derived* from it (`z.infer<typeof DelegatedZcap>`) rather than written by hand next to a separate validator. The type and the runtime check come from the same definition, so they can't drift apart.

`zcap-zod` exports those derived types under the same names as the schemas, so `DelegatedZcap` is both the schema you call `.parse()` on and the type you annotate parameters with.

From plain JavaScript you still get all the runtime checks; the types are a bonus.

## What it does and does not check

`zcap-zod` checks the **zcap data model**: which fields must be present, their types, and the structural rules the spec states normatively (a root zcap has exactly four fields; a capability chain starts with the root zcap's id by reference; a delegated zcap carries a `capabilityDelegation` proof; and so on).

It does **not** verify signatures, and it does not constrain the [Data Integrity](https://www.w3.org/TR/vc-data-integrity/) shape of a proof — `type`, `cryptosuite`, `verificationMethod`, `created`, `proofValue` are all left unconstrained. That is a DI implementation's job. Pass the proof to one.

It also does not enforce the spec's `SHOULD`s. Those are exported as values you can apply yourself: `rootZcapIdFor`, `ROOT_ZCAP_URN_PREFIX`, `RECOMMENDED_MAX_CAPABILITY_CHAIN_LENGTH`.

## Install

Not yet published to npm. Install from the repository:

```sh
npm install github:gobengo/zcap-zod
```

[zod](https://zod.dev) v4 is the only runtime dependency.

The published package contains compiled JavaScript and type declarations in `dist/`, plus the original TypeScript in `src/`. `import { RootZcap } from "zcap-zod"` resolves to `dist/index.js` and `dist/index.d.ts`; `import { RootZcap } from "zcap-zod/src/index.ts"` reaches the source, which is what the CDN below uses and what Node 22.6+ and Deno can run directly.

## API

### Schemas

| Export | Parses |
| --- | --- |
| `RootZcap` | A [root zcap](https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#root-capability): `@context`, `id` (a URN), `invocationTarget`, `controller`, and nothing else. |
| `DelegatedZcap` | A [delegated zcap](https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#delegated-capability), including at least one conforming `capabilityDelegation` proof. `invocationTarget` is optional: the spec's only statement requiring it says "A root zcap MUST" in the delegated section, likely a typo that has been reported upstream. |
| `ZcapInvocation` | An [invocation](https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/#invocation): any linked data object carrying a conforming `capabilityInvocation` proof. |
| `Zcap` | A union of the three above — any conforming zcap document. |
| `CapabilityChain` | The `capabilityChain` array of a delegation proof. |
| `CapabilityDelegationProof` | A single `capabilityDelegation` proof. |
| `CapabilityInvocationProof` | A single `capabilityInvocation` proof. |

Each schema is a Zod schema, so the whole Zod API is available: `.parse()`, `.safeParse()`, `.refine()`, `.and()`, and so on.

TypeScript types are exported under the same names: `RootZcap`, `DelegatedZcap`, `ZcapInvocation`, `Zcap`.

### Helpers

| Export | |
| --- | --- |
| `rootZcapIdFor(invocationTarget)` | Builds the RECOMMENDED root zcap id: `urn:zcap:root:` + `encodeURIComponent(invocationTarget)`. |
| `ROOT_ZCAP_URN_PREFIX` | `"urn:zcap:root:"` |
| `ZCAP_V1_JSONLD_CONTEXT` | `"https://w3id.org/zcap/v1"` |
| `RECOMMENDED_MAX_CAPABILITY_CHAIN_LENGTH` | `10`. A verifier concern, so it is not enforced by `CapabilityChain`. |

## Usage

### Validate a root zcap

```js
import { RootZcap, rootZcapIdFor } from "zcap-zod"

const invocationTarget = "https://example.com/foo"

const root = RootZcap.parse({
  "@context": "https://w3id.org/zcap/v1",
  id: rootZcapIdFor(invocationTarget),
  controller: "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
  invocationTarget,
})
```

A root zcap `MUST NOT` have any other fields, so this throws:

```js
RootZcap.parse({ ...root, allowedAction: ["read"] }) // ZodError: Unrecognized key
```

### Validate a delegated zcap

```js
import { DelegatedZcap } from "zcap-zod"

const result = DelegatedZcap.safeParse({
  "@context": [
    "https://w3id.org/zcap/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1",
  ],
  id: "urn:uuid:cdc77118-6bfa-11ec-aceb-10bf48838a41",
  parentCapability: "urn:zcap:root:https%3A%2F%2Fexample.com%2Ffoo",
  controller: "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
  invocationTarget: "https://example.com/foo",
  expires: "2021-11-03T18:33:51Z",
  allowedAction: ["write", "read"],
  proof: {
    type: "Ed25519Signature2020",
    created: "2021-10-27T18:33:51Z",
    verificationMethod: "did:key:z6Mkf...#z6Mkf...",
    proofPurpose: "capabilityDelegation",
    capabilityChain: ["urn:zcap:root:https%3A%2F%2Fexample.com%2Ffoo"],
    proofValue: "z3t9BCQyF21MDVYmLKc9zbLreqx4wBtQ...",
  },
})

if (!result.success) {
  console.error(result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`))
}
```

Unrecognized properties on a delegated zcap are **preserved**, not rejected — it is a JSON-LD document whose `@context` may define additional vocabulary.

### Validate an invocation

```js
import { ZcapInvocation } from "zcap-zod"

ZcapInvocation.parse({
  "@context": "https://w3id.org/zcap/v1",
  id: "urn:uuid:ad86cb2c-e9db-434a-beae-71b82120a8a4",
  proof: {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    proofPurpose: "capabilityInvocation",
    capability: "urn:zcap:root:https%3A%2F%2Fexample.com%2Ffoo",
    invocationTarget: "https://example.com/foo",
    capabilityAction: "read",
    verificationMethod: "did:key:z6Mkf...#z6Mkf...",
    proofValue: "z3t9BCQyF21MDVYmLKc9zbLreqx4wBtQ...",
  },
})
```

Because a delegated zcap can only be invoked by submitting the entire zcap, `proof.capability` may also be a fully embedded `DelegatedZcap` rather than a URI.

### Accept any zcap document

```js
import { Zcap } from "zcap-zod"

const parsed = Zcap.parse(await request.json())
```

`Zcap` is a union, so a document is accepted if it conforms as a root zcap, a delegated zcap, or an invocation.

### Parse an incoming request and report why it failed

Zod's errors carry the normative statement that was violated, so a `400` can say something more useful than "invalid".

Which schema to use matters here. `Zcap` is a union, and a union failure collapses to a single `"Invalid input"` at the root — it cannot tell you *which* branch you nearly matched. For an endpoint that returns error messages to a caller, pick the schema the document is trying to be, and the issues come back naming real fields:

```js
import * as z from "zod/v4"
import { RootZcap, DelegatedZcap, ZcapInvocation } from "zcap-zod"

/** Which kind of zcap document is this trying to be? */
function classify(doc) {
  if (doc && typeof doc === "object") {
    if ("parentCapability" in doc) return { kind: "delegated zcap", schema: DelegatedZcap }
    if ("proof" in doc) return { kind: "invocation", schema: ZcapInvocation }
  }
  return { kind: "root zcap", schema: RootZcap }
}

export async function handleRequest(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "request body is not valid JSON" }, { status: 400 })
  }

  const { kind, schema } = classify(body)
  const result = schema.safeParse(body)

  if (!result.success) {
    return Response.json(
      {
        error: `request body is not a conforming ${kind}`,
        // One entry per violated constraint, machine-readable.
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join(".") || "(document)",
          message: issue.message,
        })),
        // The same thing, formatted for a human reading logs or a terminal.
        detail: z.prettifyError(result.error),
      },
      { status: 400 },
    )
  }

  const zcap = result.data
  // ... verify the proof with a Data Integrity implementation, then act on it
  return Response.json({ ok: true, id: zcap.id })
}
```

A root zcap missing its `invocationTarget` and using an `https:` id comes back as:

```json
{
  "error": "request body is not a conforming root zcap",
  "issues": [
    { "path": "id", "message": "Invalid Uniform Resource Name (URN)" },
    { "path": "invocationTarget", "message": "Invalid input: expected string, received undefined" }
  ],
  "detail": "\u2716 Invalid Uniform Resource Name (URN)\n  \u2192 at id\n\u2716 Invalid input: expected string, received undefined\n  \u2192 at invocationTarget"
}
```

and that `detail`, printed, reads:

```
✖ Invalid Uniform Resource Name (URN)
  → at id
✖ Invalid input: expected string, received undefined
  → at invocationTarget
```

A delegated zcap whose `expires` is not a date-time and whose proof has the wrong purpose gets the spec's own wording back:

```
✖ Invalid ISO datetime
  → at expires
✖ At least one proof MUST have a proofPurpose of "capabilityDelegation".
  → at proof
```

Zod v4 also offers [`z.treeifyError`](https://zod.dev/error-formatting) (issues nested to mirror the document) and `z.flattenError` (one flat level) if either shape suits your API better. `z.treeifyError` is also the one way to get detail out of a `Zcap` union failure — it merges what every branch complained about, which is thorough but noisy.

### Enforcing the SHOULDs

```js
import { RECOMMENDED_MAX_CAPABILITY_CHAIN_LENGTH, CapabilityChain } from "zcap-zod"

const VerifierChain = CapabilityChain.refine(
  (chain) => chain.length <= RECOMMENDED_MAX_CAPABILITY_CHAIN_LENGTH,
  { message: "capability chain is longer than a verifier SHOULD accept" },
)
```

## Use it in a browser, with no bundler

### From GitHub Pages

Every push to `main` deploys a browser-ready build to GitHub Pages:

```js
import { Zcap } from "https://gobengo.github.io/zcap-zod/zcap-zod/index.js"
```

This build is the `tsc` output from `dist/`, plus a copy of `zod` next to it, so the one import is all a page needs. It always tracks `main`. For a pinned version, use esm.sh (below). Why it's built this way is recorded in [ADR-0001](docs/adr/0001-browser-importable-build-on-github-pages.md).

### From esm.sh

[esm.sh](https://esm.sh) transpiles the TypeScript source straight from GitHub, so a plain HTML page can import the schemas over a CDN — no install and no build of your own:

```js
import { Zcap } from "https://esm.sh/gh/gobengo/zcap-zod/src/index.ts"
```

Pin a tag or a commit for anything you care about, rather than tracking the default branch:

```js
import { Zcap } from "https://esm.sh/gh/gobengo/zcap-zod@v0.1.0/src/index.ts"
```

esm.sh resolves `zod` from this package's `package.json` automatically — you don't need to load it yourself. The `./src/*` entry in this package's `"exports"` is what makes the deep path above resolvable; keep it if you change the package layout.

The repository has to be public on GitHub for this to work, and esm.sh caches aggressively per ref — pinning a tag is also how you get a predictable cache key.

### Copy-paste snippet

Paste this into [jsbin](https://jsbin.com), [CodePen](https://codepen.io), or any `.html` file and open it. To pin a version, swap the import URL for an esm.sh one:

```html
<!doctype html>
<meta charset="utf-8">
<title>zcap-zod in the browser</title>
<pre id="out">running…</pre>
<script type="module">
  import { RootZcap, Zcap, rootZcapIdFor } from "https://gobengo.github.io/zcap-zod/zcap-zod/index.js"

  const out = document.getElementById("out")
  const log = (...args) => { out.textContent += args.join(" ") + "\n" }
  out.textContent = ""

  const invocationTarget = "https://example.com/foo"

  // A conforming root zcap.
  const root = {
    "@context": "https://w3id.org/zcap/v1",
    id: rootZcapIdFor(invocationTarget),
    controller: "did:key:z6MkfWKcvBiKCfNgz5UUGseNt37t4dguEvFgJ9XvX2UV6zB9",
    invocationTarget,
  }

  log("root id:", root.id)
  log("valid root zcap:", RootZcap.safeParse(root).success)
  log("valid via the Zcap union:", Zcap.safeParse(root).success)

  // A root zcap MUST NOT have any other fields.
  const bad = RootZcap.safeParse({ ...root, allowedAction: ["read"] })
  log("root with an extra field:", bad.success)
  log(bad.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"))

  // A root zcap id MUST be a URN.
  const notAUrn = RootZcap.safeParse({ ...root, id: "https://example.com/root" })
  log("root with an https: id:", notAUrn.success)
  log(notAUrn.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n"))
</script>
```

### Sharing `zod` with the rest of your page

By default esm.sh bundles its own copy of `zod`. If your page already imports `zod` and you want one shared instance, mark it external and resolve it with an import map:

```html
<script type="importmap">
  {
    "imports": {
      "zod/": "https://esm.sh/zod@4/"
    }
  }
</script>
<script type="module">
  import { Zcap } from "https://esm.sh/gh/gobengo/zcap-zod/src/index.ts?external=zod"
  import * as z from "zod/v4"
</script>
```

## Checking zcaps from a URL

The site's homepage fetches a URL and checks the zcaps in it, showing which schema each one matches or why it doesn't:

```
https://gobengo.github.io/zcap-zod/?url=https://w3c-ccg.github.io/zcap-spec/
```

- **HTML**, such as a zcap-spec: its examples are extracted with [zcap-spec-examples](https://github.com/gobengo/zcap-spec-examples) and each JSON example is checked against `Zcap`.
- **JSON**, a zcap or an array of zcaps: it is checked against `Zcap`, with the issues from each schema.
- **A file you drop on the page**: it becomes `?url=data:application/json;name=<file name>;base64,…`, so the result is a shareable link too. A `data:` URL has to contain JSON. The page links to an `example-zcap.json` (a valid delegated zcap) to try it with.

Without `?url`, the page uses the zcap-spec's landing page, `https://w3c-ccg.github.io/zcap-spec/`. That page only lists versions and redirects to the latest with a script, so the checker reads where it points (a meta refresh, its "redirects to" link, or its `latest` version) and replaces `?url=` with that version's address, e.g. `?url=https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.5/`. The URL has to allow cross-origin fetches (GitHub Pages does); otherwise paste its content into the page. For the targeted spec version, examples 1–5 are expected to fail: they are the informative "Zcap by Example" narrative, which lags the v0.4 data model (see `test/zcap-spec-examples-schema.test.ts`). The old `spec-examples.html` address redirects to the homepage.

## JSON Schema

For JSON-Schema-aware tooling, every push to `main` also publishes a JSON Schema (draft 2020-12) generated from these zod schemas:

```
https://gobengo.github.io/zcap-zod/zcap-zod.schema.json
```

The root validates any `Zcap`; each exported schema is under `$defs`, so you can refer to one directly, e.g. `https://gobengo.github.io/zcap-zod/zcap-zod.schema.json#/$defs/DelegatedZcap`.

JSON Schema cannot express zod refinements, so this schema is looser than zcap-zod itself: it does not check that URIs parse, that a document carries a conforming `capabilityDelegation`/`capabilityInvocation` proof, or the ordering rules of a `capabilityChain`. Use it for editor hints and coarse checks, and zcap-zod for validation.

Print it locally with `npm run build && npm run json-schema`.

## Development

```sh
npm install
npm test     # node --test, against the TypeScript source
npm run build  # tsc -> dist/*.js + dist/*.d.ts
npm run dev    # tsc --watch + the site at http://localhost:8080/
npm run build:site  # build + assemble _site/, what GitHub Pages deploys
npm run json-schema # print the JSON Schema generated from dist/
```

Tests run on `node --test` against the TypeScript source directly (Node 22.6+), so most work needs no build.

`npm run build` compiles `src/` to `dist/` with `tsc`. Two `tsconfig.json` settings are load-bearing:

- **`rewriteRelativeImportExtensions`** — the source imports siblings as `./zcap-zod.ts` so Node can run it directly. This rewrites those to `./zcap-zod.js` on the way out, so the emitted JavaScript is valid ESM.
- **`"lib": ["es2023", "dom"]` with `"types": []`** — the only platform global the library uses is `URL`. Building without `@types/node` means a node-only API cannot slip in unnoticed, which matters because this ships to browsers too.

`prepack` runs the build, so `npm pack` and `npm publish` always ship a freshly compiled `dist/`. `dist/` is gitignored.

- `test/zcap-zod.test.ts` — one test per normative statement in the spec.
- `test/zcap-spec-examples-schema.test.ts` — every example in the zcap-spec, and whether it conforms to the v0.4 data model. Examples 1–4 come from the informative "Zcap by Example" narrative, predate the v0.4 normative data model, and are expected *not* to parse; if the spec is updated to bring them in line, this is the test that tells you.

The `zcap-spec/` directory is a vendored subtree of the [spec repository](https://github.com/w3c-ccg/zcap-spec).

## References

- [Authorization Capabilities for Linked Data v0.4.0-rc.2](https://w3c-ccg.github.io/zcap-spec/v0.4.0-rc.2/)
- [Verifiable Credential Data Integrity](https://www.w3.org/TR/vc-data-integrity/)
- [Zod](https://zod.dev)

## License

MIT
