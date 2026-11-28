export type DatabaseDriver = "sqlite" | "postgres" | "pglite";

export type DatabaseConfig = {
  driver: DatabaseDriver;
  url: string;
};

const POSTGRES_URL_RE = /^postgres(?:ql)?:\/\//i;

export function resolveDriverFromUrl(
  url: string,
  explicitDriver?: string,
): DatabaseDriver {
  const raw = explicitDriver?.trim().toLowerCase();
  if (raw) {
    if (raw === "postgres" || raw === "postgresql" || raw === "pg") {
      return "postgres";
    }
    if (raw === "pglite") {
      return "pglite";
    }
    if (raw === "sqlite" || raw === "sqlite3") {
      return "sqlite";
    }
    throw new Error(
      `Unsupported DB_DRIVER "${explicitDriver}". Expected "sqlite", "postgres", or "pglite".`,
    );
  }
  return POSTGRES_URL_RE.test(url.trim()) ? "postgres" : "sqlite";
}

export function resolveDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  const driver = resolveDriverFromUrl(env.DATABASE_URL ?? "", env.DB_DRIVER);
  if (driver === "postgres") {
    const url = env.DATABASE_URL?.trim();
    if (!url) {
      throw new Error("DATABASE_URL is required when DB_DRIVER=postgres.");
    }
    return { driver, url };
  }
  if (driver === "pglite") {
    return { driver, url: env.DATABASE_URL?.trim() || "memory://" };
  }
  return {
    driver: "sqlite",
    url: env.DATABASE_URL?.trim() || "./data/expense-book.sqlite",
  };
}
