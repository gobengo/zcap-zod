# ADR-0001: Publish a browser-importable build of each commit to GitHub Pages

**Status:** Accepted
**Date:** 2026-09-16
**Deciders:** Benjamin Goering

## Context

zcap-zod is an ESM library that ships to browsers as well as Node (see the
`lib: ["dom"]` note in `tsconfig.json`). We want each commit on `main` to be
checkable in a real browser, not only through `node --test`.

Every push to `main` runs `.github/workflows/pages.yml`, which deploys
`_site/` to GitHub Pages. The site has a demo page that runs a few smoke tests
against that commit's build and shows ✅ or ❌.

That gives these requirements:

1. **The deployed build must be importable by absolute URL from any page.**
   The demo page shows each test as a `<script type="module">` snippet such as

   ```html
   <script type="module">
   import { Zcap } from "https://gobengo.github.io/zcap-zod/zcap-zod/index.js"
   console.log(Zcap.safeParse({ hello: "world" }).success) // false
   </script>
   ```

   The snippet must work when pasted into any other HTML file, on any origin
   (including `file://`), with no other setup. The same must hold for the same
   layout served from somewhere else: `npm run dev` on localhost, or a Pages
   artifact downloaded from an older workflow run and served locally.
2. **The page must test exactly the code it displays**, run against the output
   of `tsc` for that commit, not a separately produced artifact.
3. **The npm package must not change.** `dist/` keeps importing zod as
   `"zod/v4"`, and zod stays a peer dependency. Consumers who use a bundler or
   Node must resolve their own copy of zod.
4. **No new build dependencies** if we can avoid them. Today the project needs
   only `typescript`.

The conflict is in (1) versus (3). `tsc` emits `import * as z from "zod/v4"`.
That is a *bare specifier*: browsers can only resolve it through an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type/importmap),
and the import map has to live in the page that imports the module. A page
where someone pasted a one-line `import` won't have one. So the `dist/` we
publish to npm cannot, as is, be imported by URL.

## Decision

Build the Pages site with `scripts/build-site.mjs`, and when serving `dist/` on
the web, rewrite its zod imports to relative URLs that point at a copy of zod
published alongside it.

Site layout (the same for `_site/` on Pages and for `npm run dev`):

```
index.html            demo/index.html (smoke tests + snippets)
zcap-zod/             dist/, with "zod/v4" → "../vendor/zod/v4/index.js"
vendor/zod/           node_modules/zod, ESM files only
build-info.json       commit SHA + build time shown on the page
```

- `scripts/rewrite-zod-imports.mjs` does the rewrite. It is shared by
  `build-site.mjs` (at build time) and `dev.mjs` (per request). It maps the
  only specifiers we use (`zod`, `zod/v4`) to the matching entry files in
  zod's package. It **throws** on any zod subpath it doesn't know, or on any
  other bare `from "…"` import still left afterwards. A new runtime dependency
  therefore breaks the Pages build loudly, not the deployed page quietly.
- Relative URLs resolve against wherever the module is hosted. The same files
  work at `https://gobengo.github.io/zcap-zod/`, at `http://localhost:8080/`, or
  under any other prefix. We never hard-code the Pages URL.
- The demo page has **no import map**. Each test's `code` string is shown
  verbatim and executed verbatim: the harness only appends `export { … }` and
  imports it from a Blob URL. The page therefore loads the library exactly the
  way a pasted snippet would.
- Cross-origin module imports need CORS. GitHub Pages sends
  `Access-Control-Allow-Origin: *`, and `dev.mjs` sends the same header.

## Options considered

### A. Rewrite bare zod imports in the served copy of `dist/` (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low–Med: about 30 lines, regex-based |
| New dependencies | None |
| Fidelity to `tsc` output | High: only the import specifier strings change |
| Works when pasted anywhere | Yes |

**Pros:** no bundler. The published modules are `tsc`'s output with
byte-for-byte identical logic. Zod is loaded as its own unmodified ESM files.
Works under any hosting prefix.
**Cons:** it's a regex over JavaScript, not a parser. It only recognises
`from "zod…"` and `import("zod…")`, the forms `tsc` emits here. The
leftover-bare-import guard checks `from "…"` forms only. Source maps are off
by a few columns on rewritten import lines.

### B. Import map in the demo page only

| Dimension | Assessment |
|---|---|
| Complexity | Very low |
| New dependencies | None |
| Works when pasted anywhere | **No** |

This was the first implementation. It proves the build works on *our* page,
but a snippet pasted elsewhere fails with
`Failed to resolve module specifier "zod/v4"`. It fails requirement (1).

### C. Bundle to a single ESM file (e.g. esbuild, zod inlined)

| Dimension | Assessment |
|---|---|
| Complexity | Low in code, but adds a tool and its config |
| New dependencies | esbuild (or similar) |
| Fidelity to `tsc` output | Lower: the page would test the bundle, not `dist/` |
| Works when pasted anywhere | Yes |

**Pros:** robust handling of any import form or future dependency. One file to
fetch.
**Cons:** adds a build dependency. The artifact under test is no longer what
`tsc` produced and npm consumers receive, which weakens requirement (2). A
page that also imports zod separately gets two zod instances.

Worth revisiting if we add runtime dependencies (see Consequences).

### D. Import zod by relative path or URL in `src/`

**Cons:** breaks Node and bundler consumers and the peer-dependency model.
Fails requirement (3). Rejected.

### E. Point zod (or the whole library) at a public CDN such as esm.sh

**Pros:** no vendoring.
**Cons:** a CDN serves *published npm versions*, not the commit under test, so
it can't serve our library per commit. Using it only for zod still means
rewriting the specifier (so it is option A with an external runtime
dependency), and the page would break when the CDN is down or blocked.
Rejected.

### F. Document that pasting pages must add their own import map

**Cons:** snippets are no longer self-contained, which defeats their purpose.
Rejected.

## Trade-off analysis

The deciding factors were requirement (2), which argues against bundling, and
requirement (4). With a single runtime dependency whose import form `tsc`
emits predictably, a narrow rewrite with loud failure is less machinery than a
bundler, and it keeps the demo testing real `tsc` output. The accepted risk is
the regex's narrow coverage. That risk is contained because anything
unrecognised fails the build, not the deployed page.

## Consequences

- **Easier:** checking any commit in a browser (open the Pages URL, or serve a
  downloaded Pages artifact). Sharing a runnable, one-file reproduction of
  zcap-zod behaviour.
- **Easier:** local iteration. `npm run dev` serves the same layout with
  `tsc --watch`, so a browser refresh tests the latest source.
- **Harder:** adding a runtime dependency, a new zod subpath (e.g.
  `zod/v4/core`), or an import form such as `export … from "zod"`. Each needs
  a matching change to `rewrite-zod-imports.mjs`, or a move to option C.
- **Caveat:** the absolute URL is only as stable as Pages. It always serves the
  latest `main`, so a snippet pasted elsewhere tracks `main`, not a release.
  Pin to a published npm version via a CDN if you need stability.
- **Caveat:** snippets copied from `npm run dev` point at `localhost` and only
  work while the dev server runs.

**Revisit this decision if:** zcap-zod gains a second runtime dependency, the
rewrite starts accumulating special cases, or we want versioned (per-release or
per-commit) URLs on Pages.

## Related files

- `.github/workflows/pages.yml`: builds and deploys `_site/` on push to `main`
- `scripts/build-site.mjs`: assembles `_site/`
- `scripts/rewrite-zod-imports.mjs`: the specifier rewrite and guards
- `scripts/dev.mjs`: `npm run dev`, which serves the same layout from the repo
- `demo/index.html`: smoke tests; each snippet is shown and run verbatim
