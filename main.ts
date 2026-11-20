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

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg"]);

/**
 * Read the pixel dimensions of a PNG or JPEG from its own header bytes.
 * PNG: the IHDR chunk carries width/height at fixed offsets. JPEG: walk the
 * marker segments until a start-of-frame marker (SOF0..SOF3, SOFn) and read
 * the height/width pair. Returns null for anything unreadable or unsupported.
 */
function imageSize(file: string): { width: number; height: number } | null {
  const bytes = readFileSync(file);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

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
      rejectUnresolvableSpecifier(file, spec);
      if (!spec.startsWith(".")) continue;
      const line = text.slice(0, match.index ?? 0).split("\n").length;
      edges.push({ file, spec, line });
    }
  }
  // A dynamic import built from a template literal cannot be resolved or
  // sandboxed statically, so refuse it outright.
  for (const match of text.matchAll(/\bimport\s*\(\s*`([^`]*)`/g)) {
    if (match[1].includes("${")) fail(`${relative(ROOT, file)} builds an import path dynamically (${match[1]})`);
    rejectUnresolvableSpecifier(file, match[1]);
    if (match[1].startsWith(".")) {
      edges.push({ file, spec: match[1], line: 0 });
    }
  }
  return edges;
}

/**
 * No import map exists in this app, so every module specifier must be
 * relative. Network and protocol-relative specifiers are refused with a
 * dedicated message; a bare name would only fail in the browser, so it is
 * refused here where the failure is readable.
 */
function rejectUnresolvableSpecifier(file: string, spec: string): void {
  if (/^(https?:|data:|blob:|\/\/)/i.test(spec)) {
    fail(`${relative(ROOT, file)} imports from the network (${spec}); local relative modules only`);
  }
  if (spec.startsWith("/")) {
    fail(`${relative(ROOT, file)} uses a root-absolute import (${spec}); relative modules only`);
  }
  if (!spec.startsWith(".")) {
    fail(`${relative(ROOT, file)} imports the bare specifier "${spec}"; this app has no import map, relative modules only`);
  }
}

function htmlScriptSources(file: string): ImportEdge[] {
  const text = readFileSync(file, "utf8");
  const edges: ImportEdge[] = [];
  const patterns = [
    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<(?:img|source|video|audio|track|iframe|embed|object)\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
    /<use\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const spec = match[1];
      if (/^(https?:)?\/\//i.test(spec) || spec.startsWith("data:") || spec.startsWith("blob:") || spec.startsWith("/")) {
        fail(`${relative(ROOT, file)} references a remote or root-absolute asset (${spec}); local relative files only`);
      }
      edges.push({ file, spec, line: 0 });
    }
  }
  // Inline event handlers would be executable code living outside the
  // reviewed module graph; the authored app wires events from modules.
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(text)) {
    fail(`${relative(ROOT, file)} contains an inline event handler (on*=); wire events from a module instead`);
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
    // The dossier builder accepts PNG and JPEG only; refuse anything else
    // here where the failure names the file, not inside the vendor code.
    if (!IMAGE_EXTS.has(extname(file).toLowerCase())) {
      fail(`${relative(ROOT, file)} is not a PNG or JPEG screenshot`);
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
    const dims = imageSize(file);
    const dimsText = dims ? `${dims.width}x${dims.height}` : "dimensions unreadable";
    console.log(`  ${relative(join(ROOT, "screenshots"), file).padEnd(30)} ${String(sizeOf(file)).padStart(9)} B  ${dimsText}`);
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
