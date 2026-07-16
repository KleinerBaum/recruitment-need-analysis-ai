import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";

// Sites evaluates the ESM entry in a worker-style loader where import.meta.url
// is unavailable, while createRequire itself is supported through Node compat.
function sitesCreateRequireCompat(): Plugin {
  return {
    name: "sites:create-require-compat",
    apply: "build",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;

        const importMatch = output.code.match(
          /import\s*\{\s*createRequire(?:\s+as\s+([\w$]+))?\s*\}\s*from\s*["']node:module["']/u
        );
        if (!importMatch) continue;

        const identifier = importMatch[1] ?? "createRequire";
        const callPattern = new RegExp(`${identifier.replaceAll("$", "\\$")}\\(import\\.meta\\.url\\)`, "gu");
        output.code = output.code.replace(
          callPattern,
          `${identifier}(process.cwd()+"/package.json")`
        );
      }
    }
  };
}

export default defineConfig({
  plugins: [vinext(), sitesCreateRequireCompat()]
});
