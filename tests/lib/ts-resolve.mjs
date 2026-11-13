// Lets a test import a convex/*.ts module that itself imports siblings extensionlessly
// ("./personaContextData"), which is the convention across convex/ because the Convex bundler
// resolves it. Node's native TS loader does not, so without this any test whose import graph
// reaches a multi-file convex module dies with ERR_MODULE_NOT_FOUND — which is exactly what
// happened when seedData.ts picked up a value import of ./personaContextData.
//
// Import this module FIRST, then `await import()` the .ts module: a static import's body runs
// before the importing module's own, but module linking happens before any body runs, so the
// convex module has to be pulled in dynamically for the hook to be in place in time.
//
// Test-only. Nothing about how Convex itself bundles changes.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s, c, n) {
        try { return await n(s, c); }
        catch (e) {
          if (s.startsWith(".") && !/\\.[a-zA-Z0-9]+$/.test(s)) return await n(s + ".ts", c);
          throw e;
        }
      }`,
    ),
  import.meta.url,
);
