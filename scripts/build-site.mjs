// Assemble a static site that smoke-tests the built zcap-zod in a browser.
//
//   _site/index.html        demo page (from demo/index.html)
//   _site/zcap-zod/         the tsc output (dist/)
//   _site/vendor/zod/       zod's ESM files, resolved via the page's import map
//   _site/build-info.json   commit + timestamp shown on the page
//
// Run `npm run build` first (or use `npm run build:site`).
import { execSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const out = join(root, "_site")
const dist = join(root, "dist")
const zod = join(root, "node_modules", "zod")

if (!existsSync(join(dist, "index.js"))) {
  throw new Error("dist/index.js not found; run `npm run build` first")
}
if (!existsSync(join(zod, "v4", "index.js"))) {
  throw new Error("node_modules/zod not found; run `npm install` first")
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

cpSync(join(root, "demo", "index.html"), join(out, "index.html"))
cpSync(dist, join(out, "zcap-zod"), { recursive: true })
cpSync(zod, join(out, "vendor", "zod"), {
  recursive: true,
  // Browsers only need the ESM build; skip TS sources and CJS/typings.
  filter: (src) =>
    !src.startsWith(join(zod, "src")) && !/\.(cjs|d\.c?ts|d\.mts)$/.test(src),
})
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
