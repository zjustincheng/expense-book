/** An intentional application response, never an upstream exception. */
export class PublicError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "PublicError";
  }
}
export function fail(message: string, statusCode: number): never {
  throw new PublicError(message, statusCode);
}

export function validateDomain<T>(calculate: () => T): T {
  try {
    return calculate();
  } catch (error) {
    fail(
      error instanceof Error ? error.message : "Invalid financial record.",
      400,
    );
  }
}
