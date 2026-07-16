import { writeFile } from "node:fs/promises";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["mcp/widget-client.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false
});
const javascript = result.outputFiles[0]?.text;
if (!javascript) throw new Error("Widget bundling produced no JavaScript.");
await writeFile(
  "mcp/widget-bundle.ts",
  `// Generated from mcp/widget-client.ts via esbuild.\nexport const WIDGET_BUNDLE = ${JSON.stringify(javascript)};\n`,
  "utf8"
);
