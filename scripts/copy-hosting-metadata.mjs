import { copyFile, mkdir } from "node:fs/promises";

const repositoryRoot = new URL("../", import.meta.url);
const source = new URL(".openai/hosting.json", repositoryRoot);
const targetDirectory = new URL("dist/.openai/", repositoryRoot);
const target = new URL("hosting.json", targetDirectory);

await mkdir(targetDirectory, { recursive: true });
await copyFile(source, target);
