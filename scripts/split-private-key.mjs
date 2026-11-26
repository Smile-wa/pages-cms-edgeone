#!/usr/bin/env node

/**
 * Encode a GitHub App PEM key as hex and split it into EdgeOne-friendly
 * environment variables. Hex values contain ONLY 0-9 and a-f: no spaces,
 * newlines, tabs or other special characters.
 *
 * Usage:
 *   node scripts/split-private-key.mjs private-key.pem
 *   node scripts/split-private-key.mjs private-key.pem --max-chars 900
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const maxCharsArg = args.indexOf("--max-chars");
const maxChars =
  maxCharsArg >= 0 ? Number.parseInt(args[maxCharsArg + 1] || "", 10) : 900;

if (!file || !Number.isFinite(maxChars) || maxChars < 100 || maxChars > 950) {
  console.error(
    "Usage: node scripts/split-private-key.mjs <private-key.pem> [--max-chars 900]",
  );
  console.error("--max-chars must be between 100 and 950.");
  process.exit(1);
}

const pem = readFileSync(file, "utf8")
  .replace(/\r\n/g, "\n")
  .trim();

if (!pem.startsWith("-----BEGIN") || !pem.includes("PRIVATE KEY-----")) {
  console.error("The input file does not look like a PEM private key.");
  process.exit(1);
}

// Hex encoding keeps every chunk within a strict alphanumeric-only value.
const encoded = Buffer.from(pem, "utf8").toString("hex");
const chunks = [];

for (let offset = 0; offset < encoded.length; offset += maxChars) {
  chunks.push(encoded.slice(offset, offset + maxChars));
}

console.log(`# ${chunks.length} chunk(s), ${encoded.length} hex chars`);
console.log("# Values contain only 0-9 and a-f (no spaces or line breaks).");
console.log("# Copy each line into EdgeOne as a separate environment variable.");
console.log("# Do NOT also set GITHUB_APP_PRIVATE_KEY when using chunks.\n");

chunks.forEach((chunk, index) => {
  console.log(`GITHUB_APP_PRIVATE_KEY_${index + 1}=${chunk}`);
});
