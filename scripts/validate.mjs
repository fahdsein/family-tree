import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const required = ["Dockerfile", "compose.yaml", "database/schema.sql", "public/index.html", "public/styles.css", "public/app.js", "server.mjs"];
await Promise.all(required.map((file) => access(resolve(root, file))));
const html = await readFile(resolve(root, "public/index.html"), "utf8");
const css = await readFile(resolve(root, "public/styles.css"), "utf8");
if (/https?:\/\//.test(html)) throw new Error("Public HTML must not depend on external CDNs");
for (const requiredMarkup of ["id=\"familyGraph\"", "id=\"exportPng\"", "id=\"exportPdf\"", "/vendor/jspdf.umd.min.js", "id=\"editPersonForm\""]) {
  if (!html.includes(requiredMarkup)) throw new Error(`Missing feature markup: ${requiredMarkup}`);
}
const themes = ["heritage", "evergreen", "nordic", "golden", "midnight", "royal", "blossom", "deep-pine", "mossy-grove", "fern-cedar", "misty-redwood", "golden-leaves", "emerald-archive", "botanical"];
for (const theme of themes) {
  if (!css.includes(`[data-theme="${theme}"]`)) throw new Error(`Missing theme: ${theme}`);
}
for (const font of ["Inter Variable", "Lora Variable", "Special Elite"]) {
  if (!css.includes(`font-family:\"${font}\"`)) throw new Error(`Missing self-hosted font: ${font}`);
}
console.log(`Validated ${required.length} deployment files, ${themes.length} color themes, and 3 self-hosted font families.`);
