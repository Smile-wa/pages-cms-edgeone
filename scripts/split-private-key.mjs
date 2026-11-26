#!/usr/bin/env node

/**
 * Split a GitHub App PEM key into EdgeOne-friendly env var chunks.
 *
 * Usage:
 *   node scripts/split-private-key.mjs private-key.pem
 *   node scripts/split-private-key.mjs private-key.pem --max-bytes 450
 */

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const maxBytesArg = args.indexOf("--max-bytes");
const maxBytes =
  maxBytesArg >= 0 ? Number.parseInt(args[maxBytesArg + 1] || "", 10) : 450;

if (!file || !Number.isFinite(maxBytes) || maxBytes < 100 || maxBytes > 1000) {
  console.error(
    "Usage: node scripts/split-private-key.mjs <private-key.pem> [--max-bytes 450]",
  );
  console.error("--max-bytes must be between 100 and 1000.");
  process.exit(1);
}

const pem = readFileSync(file, "utf8")
  .replace(/\r\n/g, "\n")
  .trim();

if (!pem.startsWith("-----BEGIN") || !pem.includes("PRIVATE KEY-----")) {
  console.error("The input file does not look like a PEM private key.");
  process.exit(1);
}

// Store newlines as literal \n so every value stays on one line.
const singleLine = pem.replace(/\n/g, "\\n");
const buffer = Buffer.from(singleLine, "utf8");
const chunks = [];

for (let offset = 0; offset < buffer.length; offset += maxBytes) {
  chunks.push(buffer.subarray(offset, offset + maxBytes).toString("utf8"));
}

console.log(`# ${chunks.length} chunk(s), ${buffer.length} bytes total`);
console.log("# Copy each line into EdgeOne as a separate environment variable.");
console.log("# Do NOT also set GITHUB_APP_PRIVATE_KEY when using chunks.\n");

chunks.forEach((chunk, index) => {
  console.log(`GITHUB_APP_PRIVATE_KEY_${index + 1}=${chunk}`);
});
