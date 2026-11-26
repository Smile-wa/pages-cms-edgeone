import "server-only";

// EdgeOne Makers limits env var values to roughly 1 KB and rejects whitespace
// and other special characters. A GitHub App PEM key is usually larger, so it
// can be stored hex-encoded in numbered chunks:
// GITHUB_APP_PRIVATE_KEY_1, _2, _3, ... (1-based, no gaps).
// Generate the chunks with: npm run key:split -- private-key.pem
const MAX_CHUNKS = 40;

const normalizeKey = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .trim();

const isHex = (value: string) =>
  /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0;

const decodeValue = (value: string) => {
  const trimmed = value.trim();
  if (!isHex(trimmed)) return normalizeKey(trimmed);

  const decoded = Buffer.from(trimmed, "hex").toString("utf8");
  if (!decoded.includes("PRIVATE KEY-----")) {
    throw new Error(
      "GITHUB_APP_PRIVATE_KEY is hex-encoded but does not decode to a PEM private key.",
    );
  }
  return normalizeKey(decoded);
};

export function getGithubAppPrivateKey(): string {
  const direct = process.env.GITHUB_APP_PRIVATE_KEY;
  if (direct?.trim()) {
    return decodeValue(direct);
  }

  const chunks: string[] = [];
  for (let index = 1; index <= MAX_CHUNKS; index += 1) {
    const chunk = process.env[`GITHUB_APP_PRIVATE_KEY_${index}`];
    if (!chunk) break;
    chunks.push(chunk.trim());
  }

  const joined = chunks.join("");
  if (!joined) {
    throw new Error(
      "Missing GitHub App private key. Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_1, _2, ... in the environment.",
    );
  }

  return decodeValue(joined);
}
