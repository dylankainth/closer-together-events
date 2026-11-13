// Node resolve hook for the test runner. Convex's bundler lets one convex/*.ts file import another
// without the extension ("./personaContextData"); Node's own resolver does not, so a test that
// imports such a file failed with ERR_MODULE_NOT_FOUND. Only relative, extensionless specifiers
// that Node cannot find are retried with ".ts"; everything else resolves exactly as before.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[cm]?[jt]sx?$/.test(specifier);
    if (err?.code === "ERR_MODULE_NOT_FOUND" && relative && !hasExtension) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw err;
  }
}
