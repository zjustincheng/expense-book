import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

const MAX_FILE_BYTES = 1024 * 1024;
const LARGE_FILE_ALLOWLIST = new Set(["package-lock.json"]);

const CONFLICT_MARKERS = [
  new RegExp(`^${"<".repeat(7)} `, "m"),
  new RegExp(`^${"=".repeat(7)}$`, "m"),
  new RegExp(`^${">".repeat(7)} `, "m"),
];

const SECRET_PATTERNS = [
  {
    name: "Private key block",
    pattern: new RegExp(
      `-----${"BEGIN"} (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----`,
    ),
  },
  {
    name: "AWS Access Key ID",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "GitHub token",
    pattern:
      /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/,
  },
  {
    name: "Stripe live secret key",
    pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: "Slack token",
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
];

function getStagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
    { encoding: "buffer" },
  );
  if (output.length === 0) return [];
  return output
    .toString("utf8")
    .split("\0")
    .filter((file) => file.length > 0);
}

function readStagedBlob(file) {
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
  if (/\.(?:pem|key|p12|pfx)$/i.test(baseName)) {
    return "Key or certificate files must not be committed.";
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

function runNpmScript(args) {
  const result = spawnSync("npm", args, { stdio: "inherit" });
  return result.status === 0;
}

function main() {
  const files = getStagedFiles();
  if (files.length === 0) {
    process.exit(0);
  }

  const failures = [];

  for (const file of files) {
    const blockedReason = isBlockedFilename(file);
    if (blockedReason) {
      failures.push(`[blocked-file] ${file}: ${blockedReason}`);
      continue;
    }

    const buffer = readStagedBlob(file);
    if (buffer.length > MAX_FILE_BYTES && !LARGE_FILE_ALLOWLIST.has(file)) {
      failures.push(
        `[large-file] ${file}: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB exceeds 1.00 MB limit.`,
      );
      continue;
    }

    if (buffer.includes(0)) {
      continue;
    }

    const text = buffer.toString("utf8");

    if (CONFLICT_MARKERS.some((regex) => regex.test(text))) {
      failures.push(
        `[conflict-marker] ${file}: Unresolved merge conflict marker found.`,
      );
    }

    if (!file.endsWith(".example")) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(text)) {
          failures.push(`[secret-scan] ${file}: Possible ${name} detected.`);
        }
      }
    }

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

  if (failures.length > 0) {
    console.error("Pre-commit staged-file checks failed:\n");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  const touchesRootTs = files.some(
    (file) => file === "tsconfig.base.json" || file === "package.json",
  );
  if (touchesRootTs) {
    if (!runNpmScript(["run", "typecheck"])) {
      process.exit(1);
    }
  } else {
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
      process.exit(1);
    }
    if (
      touchesBackendTs &&
      !runNpmScript(["run", "typecheck", "-w", "backend"])
    ) {
      process.exit(1);
    }
  }
}

main();
