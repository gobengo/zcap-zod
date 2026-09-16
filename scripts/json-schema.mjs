// Print a JSON Schema (draft 2020-12) generated from the zcap-zod schemas.
//
// The output is one bundled document: every exported schema lives under
// `$defs`, cross-references use `#/$defs/<Name>`, and the root validates any
// `Zcap`. JSON-Schema-aware tooling can refer to a single schema by URL, e.g.
//
//   https://gobengo.github.io/zcap-zod/zcap-zod.schema.json#/$defs/DelegatedZcap
//
// JSON Schema cannot express zod refinements, so the generated schema is
// looser than the zod schemas: it does not check that URIs parse, that a
// document carries a conforming delegation/invocation proof, or the ordering
// rules of a capabilityChain. Use zcap-zod itself for full validation.
//
// Usage: npm run json-schema [-- --id=<url>]
// Run `npm run build` first; this reads dist/.
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")

export const DEFAULT_SCHEMA_ID = "https://gobengo.github.io/zcap-zod/zcap-zod.schema.json"

/** Exported zod schemas to include, in output order. */
const SCHEMA_NAMES = [
  "Zcap",
  "RootZcap",
  "DelegatedZcap",
  "ZcapInvocation",
  "CapabilityDelegationProof",
  "CapabilityInvocationProof",
  "CapabilityChain",
]

/** Build the bundled JSON Schema document. */
export async function generateJsonSchema({ id = DEFAULT_SCHEMA_ID } = {}) {
  if (!existsSync(join(root, "dist", "index.js"))) {
    throw new Error("dist/index.js not found; run `npm run build` first")
  }
  const z = await import("zod/v4")
  const lib = await import(pathToFileURL(join(root, "dist", "index.js")).href)

  const registry = z.registry()
  for (const name of SCHEMA_NAMES) {
    if (!lib[name]) throw new Error(`zcap-zod does not export ${name}`)
    registry.add(lib[name], { id: name, title: name })
  }
  const { schemas } = z.toJSONSchema(registry, {
    target: "draft-2020-12",
    uri: (name) => `#/$defs/${name}`,
    override({ zodSchema }) {
      // JSON Schema `pattern` has no flags, so a flagged regex (e.g. /i) would
      // silently become stricter or looser. Fail the build instead.
      for (const pattern of zodSchema._zod.bag?.patterns ?? []) {
        if (pattern.flags) {
          throw new Error(`Cannot express regex flags in JSON Schema: ${pattern}`)
        }
      }
    },
  })

  const $defs = {}
  for (const name of SCHEMA_NAMES) {
    // Each def is embedded in this document, so drop its own $schema/$id.
    const { $schema, $id, ...def } = schemas[name]
    $defs[name] = def
  }
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: id,
    title: "zcap-zod",
    description:
      "JSON Schema generated from zcap-zod's zod schemas for W3C CCG Authorization Capabilities (zcaps). Looser than the zod schemas: refinements (URI parsing, conforming proofs, capabilityChain ordering) are not representable.",
    $ref: "#/$defs/Zcap",
    $defs,
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idArg = process.argv.slice(2).find((arg) => arg.startsWith("--id="))
  const schema = await generateJsonSchema(idArg ? { id: idArg.slice("--id=".length) } : {})
  process.stdout.write(JSON.stringify(schema, null, 2) + "\n")
}
