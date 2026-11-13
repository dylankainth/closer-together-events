import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../../", import.meta.url));
const nodeRequire = createRequire(import.meta.url);

function reference(path) {
  return new Proxy({}, { get: (_, key) => key === Symbol.toPrimitive ? () => path : reference(`${path}.${String(key)}`) });
}

/** Load the real TS huddle/guards without generated Convex files or a live deployment.
 * Only model responses and Convex registration/storage boundaries are substituted.
 */
export function loadHuddle({ museJSON, museText } = {}) {
  const cache = new Map();
  const calls = [];
  const models = {
    async museJSON(opts) {
      calls.push({ kind: "json", model: opts.model });
      if (museJSON) return museJSON(opts);
      return { data: await opts.fallback(), source: "offline" };
    },
    async museText(opts) {
      calls.push({ kind: "text", model: opts.model });
      if (museText) return museText(opts);
      return { data: await opts.fallback(), source: "offline" };
    },
  };
  function load(path) {
    const absolute = resolve(root, path);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const compiled = ts.transpileModule(readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    vm.runInNewContext(compiled, {
      module, exports: module.exports, console, process, setTimeout, clearTimeout, AbortController,
      require(name) {
        if (name.endsWith("/_generated/server")) {
          return Object.fromEntries(["action", "query", "mutation", "internalAction", "internalQuery", "internalMutation"].map((key) => [key, (definition) => definition]));
        }
        if (name.endsWith("/_generated/api")) return { internal: reference("internal"), api: reference("api") };
        if (name.startsWith(".")) {
          if (basename(name) === "muse") return models;
          return load(resolve(dirname(absolute), name.replace(/\.js$/, "") + ".ts"));
        }
        return nodeRequire(name);
      },
    }, { filename: absolute });
    return module.exports;
  }
  return {
    privacy: load("convex/privacy.ts"),
    huddle: () => load("convex/huddle.ts"),
    free: () => load("convex/huddleChat.ts"),
    hasFreeMode: existsSync(resolve(root, "convex/huddleChat.ts")),
    load, calls,
  };
}
