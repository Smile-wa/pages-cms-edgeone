import "server-only";

// EdgeOne Makers limits a single env var value to roughly 1 KB. A GitHub App
// PEM key is usually larger, so it can be stored as numbered chunks instead:
// GITHUB_APP_PRIVATE_KEY_1, _2, _3, ... (1-based, no gaps).
const MAX_CHUNKS = 20;

const normalizeKey = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

export function getGithubAppPrivateKey(): string {
  const direct = process.env.GITHUB_APP_PRIVATE_KEY;
  if (direct?.trim()) {
    return normalizeKey(direct);
  }

  const chunks: string[] = [];
  for (let index = 1; index <= MAX_CHUNKS; index += 1) {
    const chunk = process.env[`GITHUB_APP_PRIVATE_KEY_${index}`];
    if (!chunk) break;
    chunks.push(chunk);
  }

  const joined = chunks.join("");
  if (!joined.trim()) {
    throw new Error(
      "Missing GitHub App private key. Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_1, _2, ... in the environment.",
    );
  }

  return normalizeKey(joined);
}
