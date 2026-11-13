// Loaded with `node --import` by `npm test` (see package.json) so tests can import convex/*.ts
// files whose own imports omit the ".ts" extension. Works on Node 20.6+ (module.register).
import { register } from "node:module";

register("./resolve-ts-hooks.mjs", import.meta.url);
