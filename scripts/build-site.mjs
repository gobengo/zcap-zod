// Assemble a static site that smoke-tests the built zcap-zod in a browser.
//
//   _site/index.html        checks zcaps from ?url=, plus smoke tests
//                           (from demo/index.html)
//   _site/spec-examples.html
//                           redirects old links to index.html
//                           (from demo/spec-examples.html)
//   _site/zcap-zod/         the tsc output (dist/), with "zod/v4" imports
//                           rewritten to the vendored copy so any page can
//                           import it by absolute URL without an import map
//   _site/vendor/zod/       zod's ESM files
//   _site/vendor/zcap-spec-examples/
//                           the browser-safe extractor module (examples.js)
//   _site/zcap-zod.schema.json
//                           JSON Schema generated from the zod schemas
//                           (scripts/json-schema.mjs), for tooling to $ref
//   _site/build-info.json   commit + timestamp shown on the page
//
// Run `npm run build` first (or use `npm run build:site`).
import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { generateJsonSchema } from "./json-schema.mjs"
import { rewriteZodImports } from "./rewrite-zod-imports.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "_site")
const dist = join(root, "dist")
const zod = join(root, "node_modules", "zod")
const specExamples = join(root, "node_modules", "zcap-spec-examples")

if (!existsSync(join(dist, "index.js"))) {
  throw new Error("dist/index.js not found; run `npm run build` first")
}
if (!existsSync(join(zod, "v4", "index.js"))) {
  throw new Error("node_modules/zod not found; run `npm install` first")
}
if (!existsSync(join(specExamples, "dist", "examples.js"))) {
  throw new Error("node_modules/zcap-spec-examples not found; run `npm install` first")
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

cpSync(join(root, "demo", "index.html"), join(out, "index.html"))
cpSync(join(root, "demo", "spec-examples.html"), join(out, "spec-examples.html"))
const lib = join(out, "zcap-zod")
cpSync(dist, lib, { recursive: true })
for (const file of readdirSync(lib, { recursive: true })) {
  if (!file.endsWith(".js")) continue
  const path = join(lib, file)
  const depth = relative(lib, dirname(path)).split(sep).filter(Boolean).length
  writeFileSync(path, rewriteZodImports(readFileSync(path, "utf8"), depth))
}
cpSync(zod, join(out, "vendor", "zod"), {
  recursive: true,
  // Browsers only need the ESM build; skip TS sources and CJS/typings.
  filter: (src) =>
    !src.startsWith(join(zod, "src")) && !/\.(cjs|d\.c?ts|d\.mts)$/.test(src),
})
writeFileSync(
  join(out, "zcap-zod.schema.json"),
  JSON.stringify(await generateJsonSchema(), null, 2) + "\n",
)
// Only examples.js: it has no imports and no node:* APIs, unlike the package's
// CLI entry point, so browsers can load it as-is.
const specExamplesOut = join(out, "vendor", "zcap-spec-examples")
mkdirSync(specExamplesOut, { recursive: true })
for (const file of ["examples.js", "examples.js.map", "LICENSE"]) {
  const from = file === "LICENSE" ? join(specExamples, file) : join(specExamples, "dist", file)
  if (existsSync(from)) cpSync(from, join(specExamplesOut, file))
}
// Serve files as-is (no Jekyll processing).
writeFileSync(join(out, ".nojekyll"), "")

let commit = process.env.GITHUB_SHA
if (!commit) {
  try {
    commit = execSync("git rev-parse HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] }).toString().trim()
  } catch {
    commit = "unknown"
  }
}
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY } = process.env
const commitUrl =
  GITHUB_SERVER_URL && GITHUB_REPOSITORY && commit !== "unknown"
    ? `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/commit/${commit}`
    : undefined
writeFileSync(
  join(out, "build-info.json"),
  JSON.stringify({ commit, commitUrl, builtAt: new Date().toISOString() }, null, 2) + "\n",
)

console.log(`Wrote ${out}`)
