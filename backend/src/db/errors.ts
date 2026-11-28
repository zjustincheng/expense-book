type DbErrorShape = {
  code?: unknown;
  constraint?: unknown;
  message?: unknown;
  cause?: unknown;
};

function readErrorParts(error: unknown): DbErrorShape[] {
  if (!error || typeof error !== "object") return [];
  const primary = error as DbErrorShape;
  const parts: DbErrorShape[] = [primary];
  if (primary.cause && typeof primary.cause === "object") {
    parts.push(primary.cause as DbErrorShape);
  }
  return parts;
}

export function isUniqueConstraintError(
  error: unknown,
  hint?: string,
): boolean {
  for (const part of readErrorParts(error)) {
    const code = typeof part.code === "string" ? part.code : "";
    const constraint =
      typeof part.constraint === "string" ? part.constraint : "";
    const message = typeof part.message === "string" ? part.message : "";
    if (code === "23505" || /unique/i.test(message)) {
      if (!hint) return true;
      if (constraint.includes(hint) || message.includes(hint)) return true;
    }
  }
  return false;
}
