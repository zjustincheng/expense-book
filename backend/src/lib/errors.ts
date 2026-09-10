export function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
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
