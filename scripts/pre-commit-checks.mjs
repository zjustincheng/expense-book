import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const MAX_FILE_BYTES = 1024 * 1024;
const LARGE_FILE_ALLOWLIST = new Set(["package-lock.json"]);

const CONFLICT_MARKERS = [
  new RegExp(`^${"<".repeat(7)} `, "m"),
  new RegExp(`^${"=".repeat(7)}$`, "m"),
  new RegExp(`^${">".repeat(7)} `, "m"),
];

const HIGH_CONFIDENCE_SECRET_PATTERNS = [
  {
    name: "Private key block",
    pattern: new RegExp(
      `-----${"BEGIN"} (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----`,
    ),
  },
  {
    name: "AWS Access Key ID",
    pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  },
  {
    name: "AWS Secret Access Key",
    pattern: /aws_secret_access_key\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}["']?/i,
  },
  {
    name: "GitHub token",
    pattern:
      /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  },
  {
    name: "Stripe live key",
    pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    name: "Google API key",
    pattern: /\bAIza[0-9A-Za-z_-]{35}\b/,
  },
  {
    name: "OpenAI or Anthropic API key",
    pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    name: "Cloudflare Tunnel token",
    pattern: new RegExp(
      `${"CLOUDFLARE_TUNNEL_"}TOKEN\\s*[:=]\\s*["']?[A-Za-z0-9+/=_-]{20,}`,
    ),
  },
  {
    name: "Embedded JWT",
    pattern:
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    name: "Hardcoded Bearer token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/,
  },
  {
    name: "Hardcoded Basic auth header",
    pattern: /\bBasic\s+[A-Za-z0-9+/=]{16,}/,
  },
  {
    name: "URL with embedded credentials",
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp|https?):\/\/[^/\s:@]+:[^/\s@<$]+@[^/\s]+/i,
  },
];

const GENERIC_SECRET_PATTERN =
  /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|db_pass(?:word)?|password|passwd)\s*[:=]\s*["'][^"'\s]{8,}["']/i;

function getTargetFiles(scanAll) {
  const args = scanAll
    ? ["ls-files", "-z"]
    : ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"];
  const output = execFileSync("git", args, { encoding: "buffer" });
  if (output.length === 0) return [];
  return output
    .toString("utf8")
    .split("\0")
    .filter((file) => file.length > 0);
}

function readIndexedBlob(file) {
  return execFileSync("git", ["show", `:${file}`], {
    encoding: "buffer",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function isBlockedFilename(file) {
  const baseName = path.posix.basename(file);
  if (
    baseName === ".env" ||
    (baseName.startsWith(".env.") && !baseName.endsWith(".example"))
  ) {
    return "Environment files (.env) must not be committed.";
  }
  if (/\.(?:pem|key|p12|pfx|crt|cer|jks|kdbx)$/i.test(baseName)) {
    return "Key, certificate, or keystore files must not be committed.";
  }
  if (
    baseName === "secrets.yaml" ||
    (/credentials.*\.json$/i.test(baseName) && !baseName.endsWith(".example"))
  ) {
    return "Plaintext secrets or credential files must not be committed.";
  }
  if (/\.tfstate(?:\.|$)/i.test(baseName)) {
    return "Terraform state files must not be committed.";
  }
  if (/\.tfvars$/i.test(baseName) && !/\.tfvars\.example$/i.test(baseName)) {
    return "Terraform .tfvars files must not be committed.";
  }
  if (/\.(?:sqlite|sqlite-shm|sqlite-wal|db)$/i.test(baseName)) {
    return "SQLite/database files must not be committed.";
  }
  return null;
}

function isTestFile(file) {
  return (
    /\.(?:test|spec)\.(?:ts|tsx|js)$/.test(file) ||
    /^(?:backend|frontend)\/test\//.test(file)
  );
}

function isExampleFile(file) {
  return /(?:^|\/|\.)example(?:\.[^/]+)?$/i.test(file);
}

function scanSecrets(file, text, failures) {
  if (isExampleFile(file)) return;

  for (const { name, pattern } of HIGH_CONFIDENCE_SECRET_PATTERNS) {
    if (pattern.test(text)) {
      failures.push(`[secret-scan] ${file}: Possible ${name} detected.`);
    }
  }

  if (
    !isTestFile(file) &&
    file !== "scripts/pre-commit-checks.mjs" &&
    GENERIC_SECRET_PATTERN.test(text)
  ) {
    failures.push(
      `[secret-scan] ${file}: Possible hardcoded secret or password assignment detected.`,
    );
  }
}

function scanFile(file, scanAll, failures) {
  const blockedReason = isBlockedFilename(file);
  if (blockedReason) {
    failures.push(`[blocked-file] ${file}: ${blockedReason}`);
    return;
  }

  if (scanAll && file === "package-lock.json") {
    return;
  }

  const buffer = readIndexedBlob(file);
  if (buffer.length > MAX_FILE_BYTES && !LARGE_FILE_ALLOWLIST.has(file)) {
    failures.push(
      `[large-file] ${file}: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB exceeds 1.00 MB limit.`,
    );
    return;
  }

  if (buffer.includes(0)) {
    return;
  }

  const text = buffer.toString("utf8");

  if (CONFLICT_MARKERS.some((regex) => regex.test(text))) {
    failures.push(
      `[conflict-marker] ${file}: Unresolved merge conflict marker found.`,
    );
  }

  scanSecrets(file, text, failures);

  if (file.endsWith(".json")) {
    try {
      JSON.parse(text);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid JSON syntax";
      failures.push(`[json-syntax] ${file}: ${message}`);
    }
  }

  if (
    /\.(?:test|spec)\.(?:ts|tsx|js)$/.test(file) &&
    /\b(?:test|it|describe)\.only\s*\(/.test(text)
  ) {
    failures.push(
      `[focused-test] ${file}: Remove .only() before committing tests.`,
    );
  }
}

function runNpmScript(args) {
  const result = spawnSync("npm", args, { stdio: "inherit" });
  return result.status === 0;
}

function runTargetedTypecheck(files) {
  const touchesRootTs = files.some(
    (file) => file === "tsconfig.base.json" || file === "package.json",
  );
  if (touchesRootTs) {
    return runNpmScript(["run", "typecheck"]);
  }

  const touchesFrontendTs = files.some(
    (file) =>
      /^frontend\/.*\.(?:ts|tsx)$/.test(file) ||
      file === "frontend/tsconfig.json",
  );
  const touchesBackendTs = files.some(
    (file) =>
      /^backend\/.*\.ts$/.test(file) || file === "backend/tsconfig.json",
  );

  if (
    touchesFrontendTs &&
    !runNpmScript(["run", "typecheck", "-w", "frontend"])
  ) {
    return false;
  }
  if (
    touchesBackendTs &&
    !runNpmScript(["run", "typecheck", "-w", "backend"])
  ) {
    return false;
  }
  return true;
}

function main() {
  const scanAll = process.argv.includes("--all");
  const files = getTargetFiles(scanAll);
  if (files.length === 0) {
    process.exit(0);
  }

  const failures = [];
  for (const file of files) {
    scanFile(file, scanAll, failures);
  }

  if (failures.length > 0) {
    const label = scanAll ? "Tracked-file" : "Pre-commit staged-file";
    console.error(`${label} checks failed:\n`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  if (scanAll) {
    console.log(
      `Scanned ${files.length} tracked files: no sensitive files or secrets detected.`,
    );
    process.exit(0);
  }

  if (!runTargetedTypecheck(files)) {
    process.exit(1);
  }
}

main();
