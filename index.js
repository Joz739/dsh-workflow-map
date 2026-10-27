/**
 * dsh-workflow-map — package entry (the manifest's `exports["."]`).
 *
 * The host half itself lives in ./lib/index.js from on: this file only re-exports it,
 * so the bundle manifest written at — and any profile that already points at
 * ./index.js — keeps working unchanged while the implementation grows under lib/ and src/.
 *
 * What a profile actually loads is unchanged: `name`, `inject` and `apply` as named exports.
 */

export * from "./lib/index.js";
export { default } from "./lib/index.js";
