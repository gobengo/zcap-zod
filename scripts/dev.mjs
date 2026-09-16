// Local dev server for the demo page.
//
// Builds zcap-zod, keeps `tsc --watch` running, and serves the same layout as
// the GitHub Pages site straight from the repo (no copying), so a browser
// refresh always tests the latest dist/:
//
//   /                  -> demo/index.html
//   /zcap-zod/*        -> dist/* (zod imports rewritten, as on Pages)
//   /spec-examples.html -> demo/spec-examples.html
//   /vendor/zod/*      -> node_modules/zod/*
//   /vendor/zcap-spec-examples/* -> node_modules/zcap-spec-examples/dist/*
//   /build-info.json   -> generated per request
//
// Usage: npm run dev   (PORT=3000 npm run dev to change the port)
import { execFileSync, execSync, spawn } from "node:child_process"
import { existsSync, readFile } from "node:fs"
import { createServer } from "node:http"
import { dirname, extname, join, normalize, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { rewriteZodImports } from "./rewrite-zod-imports.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const port = Number(process.env.PORT ?? 8080)
const tsc = join(root, "node_modules", ".bin", "tsc")

if (!existsSync(tsc) || !existsSync(join(root, "node_modules", "zod", "v4", "index.js"))) {
  console.error("Dependencies missing; run `npm install` first.")
  process.exit(1)
}

console.log("Building zcap-zod…")
execFileSync(tsc, ["-p", "tsconfig.json"], { cwd: root, stdio: "inherit" })

const watcher = spawn(tsc, ["-p", "tsconfig.json", "--watch", "--preserveWatchOutput"], {
  cwd: root,
  stdio: "inherit",
})

const mounts = [
  ["/zcap-zod/", join(root, "dist")],
  ["/vendor/zod/", join(root, "node_modules", "zod")],
  ["/vendor/zcap-spec-examples/", join(root, "node_modules", "zcap-spec-examples", "dist")],
]
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
}

function resolve(pathname) {
  if (pathname === "/" || pathname === "/index.html") return join(root, "demo", "index.html")
  if (pathname === "/spec-examples.html") return join(root, "demo", "spec-examples.html")
  for (const [prefix, dir] of mounts) {
    if (!pathname.startsWith(prefix)) continue
    const file = normalize(join(dir, pathname.slice(prefix.length)))
    return file.startsWith(dir + sep) ? file : undefined
  }
}

function buildInfo() {
  let commit = "unknown"
  try {
    commit = execSync("git rev-parse HEAD", { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim()
    const dirty = execSync("git status --porcelain --untracked-files=no", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim()
    if (dirty) commit += "-dirty"
  } catch {}
  return { commit, builtAt: `${new Date().toISOString()} (local dev server)` }
}

const server = createServer((req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://localhost")
  const send = (status, body, type = "text/plain; charset=utf-8") => {
    res.writeHead(status, {
      "content-type": type,
      "cache-control": "no-store",
      // Like GitHub Pages, so snippets pasted into other pages can import from here.
      "access-control-allow-origin": "*",
    })
    res.end(body)
  }
  if (pathname === "/build-info.json") {
    return send(200, JSON.stringify(buildInfo(), null, 2), types[".json"])
  }
  const file = resolve(decodeURIComponent(pathname))
  if (!file) return send(404, "Not found")
  readFile(file, (error, data) => {
    if (error) return send(404, "Not found")
    if (pathname.startsWith("/zcap-zod/") && extname(file) === ".js") {
      const depth = pathname.slice("/zcap-zod/".length).split("/").length - 1
      try {
        data = rewriteZodImports(data.toString("utf8"), depth)
      } catch (rewriteError) {
        return send(500, String(rewriteError))
      }
    }
    send(200, data, types[extname(file)] ?? "application/octet-stream")
  })
})

server.listen(port, () => {
  console.log(`\nzcap-zod demo: http://localhost:${port}/\n`)
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    watcher.kill()
    server.close()
    process.exit(0)
  })
}
