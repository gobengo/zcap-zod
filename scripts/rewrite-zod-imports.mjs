// The tsc output imports zod by its bare specifier ("zod/v4"). Browsers can't
// resolve that without an import map, and a page that copy-pastes an
// `import ... from "https://…/zcap-zod/index.js"` snippet won't have one. So
// when serving dist/ on the web, point those imports at the vendored zod copy
// with a relative URL, which resolves against wherever the module is hosted.
//
// Why this exists, alternatives considered, and when to revisit it:
// docs/adr/0001-browser-importable-build-on-github-pages.md

const ZOD_ENTRY = { zod: "index.js", "zod/v4": "v4/index.js" }

/**
 * @param {string} source  contents of a JS module from dist/
 * @param {number} depth   how many directories below dist/ the module lives
 */
export function rewriteZodImports(source, depth) {
  const up = "../".repeat(depth + 1)
  const rewritten = source.replace(
    /(\bfrom\s*|\bimport\s*\(\s*)(["'])(zod(?:\/[^"']*)?)\2/g,
    (match, prefix, quote, specifier) => {
      const entry = ZOD_ENTRY[specifier]
      if (!entry) throw new Error(`Don't know how to serve "${specifier}" to browsers`)
      return `${prefix}${quote}${up}vendor/zod/${entry}${quote}`
    },
  )
  const bare = rewritten.match(/\bfrom\s*["'](?![./]|https?:)([^"']+)["']/)
  if (bare) throw new Error(`Unresolvable bare import "${bare[1]}" would break in browsers`)
  return rewritten
}
