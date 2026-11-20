// Midnight Marquee — make.fun entry.
// Preflight the authored studio, copy app + screenshots into the output
// directory, then let the shared dossier builder validate and write it.

import { buildDossier } from "./vendor/makefun-app.ts";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || "/output";

const LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000
} as const;

const MAX_SCREENSHOT_BYTES = 262144;
const MAX_APP_FILE_BYTES = 262144;

const AUTHORED_APP_FILES = [
  "index.html",
  "style.css",
  "src/main.js",
  "src/cover.js",
  "src/shots.js"
];

type ImportEdge = { file: string; spec: string; line: number };

function fail(message: string): never {
  console.error(`preflight failed: ${message}`);
  process.exit(1);
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function sizeOf(file: string): number {
  return statSync(file).size;
}

function relativeImports(file: string): ImportEdge[] {
  const ext = extname(file).toLowerCase();
  if (ext !== ".js" && ext !== ".mjs" && ext !== ".ts") return [];
  const text = readFileSync(file, "utf8");
  const edges: ImportEdge[] = [];
  const patterns = [
    /(?:^|[\s;])(?:import|export)\s[^'"();]*?from\s*["']([^"']+)["']/g,
    /(?:^|[\s;])import\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const spec = match[1];
      if (!spec.startsWith(".")) continue;
      const line = text.slice(0, match.index ?? 0).split("\n").length;
      edges.push({ file, spec, line });
    }
  }
  return edges;
}

function htmlScriptSources(file: string): ImportEdge[] {
  const text = readFileSync(file, "utf8");
  const edges: ImportEdge[] = [];
  const patterns = [
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const spec = match[1];
      if (/^(https?:)?\/\//i.test(spec) || spec.startsWith("data:")) {
        fail(`${relative(ROOT, file)} references a remote asset (${spec}); local files only`);
      }
      edges.push({ file, spec, line: 0 });
    }
  }
  return edges;
}

function resolveImport(fromFile: string, spec: string): string {
  const clean = spec.split("?")[0].split("#")[0];
  const base = resolve(dirname(fromFile), clean);
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.ts`, join(base, "index.js")];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  fail(`${relative(ROOT, fromFile)} imports "${spec}" but no such file exists`);
}

function checkImportGraph(): void {
  const appDir = join(ROOT, "app");
  const visited = new Set<string>();
  const queue = [join(appDir, "index.html")];
  while (queue.length) {
    const file = queue.pop() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const edges = extname(file).toLowerCase() === ".html" ? htmlScriptSources(file) : relativeImports(file);
    for (const edge of edges) {
      const target = resolveImport(edge.file, edge.spec);
      if (!target.startsWith(appDir + sep)) {
        fail(`${relative(ROOT, edge.file)} imports outside app/ (${edge.spec})`);
      }
      queue.push(target);
    }
  }
  const authored = AUTHORED_APP_FILES.map((rel) => join(appDir, rel));
  for (const file of authored) {
    if (!existsSync(file)) fail(`missing authored app file: ${relative(ROOT, file)}`);
    const isModule = [".js", ".mjs", ".ts"].includes(extname(file).toLowerCase());
    if (isModule && !visited.has(file)) fail(`${relative(ROOT, file)} is not reachable from app/index.html`);
  }
}

function checkSizes(): void {
  const appFiles = listFiles(join(ROOT, "app"));
  for (const file of appFiles) {
    const bytes = sizeOf(file);
    if (bytes > MAX_APP_FILE_BYTES) {
      fail(`${relative(ROOT, file)} is ${bytes} bytes; the limit is ${MAX_APP_FILE_BYTES}`);
    }
  }
  const shots = listFiles(join(ROOT, "screenshots"));
  if (shots.length > LIMITS.screenshots.max) {
    fail(`${shots.length} screenshots present; at most ${LIMITS.screenshots.max} are allowed`);
  }
  for (const file of shots) {
    const bytes = sizeOf(file);
    if (bytes > MAX_SCREENSHOT_BYTES) {
      fail(`${relative(ROOT, file)} is ${bytes} bytes; the screenshot limit is ${MAX_SCREENSHOT_BYTES}`);
    }
  }
}

function printListing(): string[] {
  const appDir = join(ROOT, "app");
  const appFiles = listFiles(appDir).sort();
  const shots = listFiles(join(ROOT, "screenshots")).sort();
  console.log(`app/ (${appFiles.length} files)`);
  for (const file of appFiles) {
    console.log(`  ${relative(appDir, file).padEnd(30)} ${String(sizeOf(file)).padStart(9)} B`);
  }
  console.log(`screenshots/ (${shots.length} files)`);
  for (const file of shots) {
    console.log(`  ${relative(join(ROOT, "screenshots"), file).padEnd(30)} ${String(sizeOf(file)).padStart(9)} B`);
  }
  return [...appFiles, ...shots];
}

function copyTree(from: string, to: string): void {
  for (const file of listFiles(from)) {
    const dest = join(to, relative(from, file));
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
  }
}

async function main(): Promise<void> {
  console.log("Midnight Marquee — preflight");
  for (const rel of AUTHORED_APP_FILES) {
    if (!existsSync(join(ROOT, "app", rel))) fail(`missing authored app file: app/${rel}`);
  }
  if (!existsSync(join(ROOT, "screenshots"))) fail("screenshots/ directory is missing");

  checkImportGraph();
  checkSizes();
  const files = printListing();
  console.log(`preflight ok: ${files.length} files, ${files.filter((f) => f.includes(`${sep}screenshots${sep}`)).length} screenshots`);

  const out = resolve(OUT);
  mkdirSync(out, { recursive: true });
  copyTree(join(ROOT, "app"), join(out, "app"));
  copyTree(join(ROOT, "screenshots"), join(out, "screenshots"));

  if (existsSync(join(ROOT, "README.md"))) {
    copyFileSync(join(ROOT, "README.md"), join(out, "README.md"));
  }

  const result = await buildDossier(out, {
    text_max_bytes: LIMITS.text_max_bytes,
    screenshots: { max: LIMITS.screenshots.max, max_bytes: LIMITS.screenshots.max_bytes },
    app_max_files: LIMITS.app_max_files,
    app_max_bytes: LIMITS.app_max_bytes,
    app_path_max_bytes: LIMITS.app_path_max_bytes
  });

  const dossierPath = join(out, "dossier.json");
  if (!existsSync(dossierPath)) {
    if (typeof result === "string") {
      writeFileSync(dossierPath, result);
    } else if (result instanceof Uint8Array) {
      writeFileSync(dossierPath, result);
    } else if (result instanceof ArrayBuffer) {
      writeFileSync(dossierPath, new Uint8Array(result));
    } else if (result && typeof result === "object") {
      writeFileSync(dossierPath, `${JSON.stringify(result, null, 2)}\n`);
    }
  }
  if (!existsSync(dossierPath)) fail("buildDossier did not produce dossier.json");

  const dossierBytes = sizeOf(dossierPath);
  console.log(`wrote ${relative(ROOT, dossierPath) || dossierPath} (${dossierBytes} B)`);
  console.log(`output ready: ${out}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`build failed: ${message}`);
  process.exit(1);
});
