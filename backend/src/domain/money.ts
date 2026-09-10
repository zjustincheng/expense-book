/** Exact rational arithmetic: expressions round once, at the currency boundary. */
type Fraction = { n: bigint; d: bigint };
const MAX_AMOUNT = 999_999_999_999_999n;
function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new Error("Cannot divide by zero.");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  let a = n < 0n ? -n : n;
  let b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / (a || 1n), d: d / (a || 1n) };
}
export function evaluateAmount(expression: string, precision = 2): bigint {
  if (!Number.isInteger(precision) || precision < 0 || precision > 3)
    throw new Error("Unsupported currency precision.");
  if (!expression.trim() || expression.length > 256)
    throw new Error("Enter an expression of 1–256 characters.");
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]|\S/g) ?? [];
  let position = 0;
  function primary(depth: number): Fraction {
    if (depth > 16) throw new Error("Expression is too deeply nested.");
    const token = tokens[position++];
    if (token === "+" || token === "-") {
      const value = primary(depth + 1);
      return { ...value, n: token === "-" ? -value.n : value.n };
    }
    if (token === "(") {
      const value = sum(depth + 1);
      if (tokens[position++] !== ")") throw new Error("Unmatched parentheses.");
      return value;
    }
    if (!token || !/^\d+(?:\.\d+)?$/.test(token))
      throw new Error("Use numbers, parentheses, +, -, * or / only.");
    const [whole, decimal = ""] = token.split(".");
    return fraction(
      BigInt(`${whole}${decimal}`),
      10n ** BigInt(decimal.length),
    );
  }
  function product(depth: number): Fraction {
    let a = primary(depth);
    while (tokens[position] === "*" || tokens[position] === "/") {
      const op = tokens[position++];
      const b = primary(depth);
      a =
        op === "*"
          ? fraction(a.n * b.n, a.d * b.d)
          : fraction(a.n * b.d, a.d * b.n);
    }
    return a;
  }
  function sum(depth: number): Fraction {
    let a = product(depth);
    while (tokens[position] === "+" || tokens[position] === "-") {
      const op = tokens[position++];
      const b = product(depth);
      a = fraction(a.n * b.d + (op === "+" ? b.n : -b.n) * a.d, a.d * b.d);
    }
    return a;
  }
  const value = sum(0);
  if (position !== tokens.length)
    throw new Error("Unexpected expression token.");
  if (value.n <= 0n) throw new Error("Amount must be positive.");
  const scaled = value.n * 10n ** BigInt(precision);
  const amount =
    scaled / value.d + ((scaled % value.d) * 2n >= value.d ? 1n : 0n);
  if (amount <= 0n || amount > MAX_AMOUNT)
    throw new Error("Amount is outside the supported range.");
  return amount;
}

export function allocate(
  amount: bigint,
  shares: { memberId: string; weight: bigint }[],
): Map<string, bigint> {
  if (amount <= 0n || shares.length === 0 || shares.some((s) => s.weight <= 0n))
    throw new Error("Choose members with positive shares.");
  if (new Set(shares.map((s) => s.memberId)).size !== shares.length)
    throw new Error("A member may appear only once.");
  const total = shares.reduce((sum, s) => sum + s.weight, 0n);
  const rows = shares.map((s) => ({
    ...s,
    amount: (amount * s.weight) / total,
    remainder: (amount * s.weight) % total,
  }));
  let remaining = amount - rows.reduce((sum, r) => sum + r.amount, 0n);
  rows.sort((a, b) =>
    a.remainder === b.remainder
      ? a.memberId < b.memberId
        ? -1
        : 1
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (const row of rows) {
    if (remaining-- > 0n) row.amount++;
  }
  return new Map(rows.map((r) => [r.memberId, r.amount]));
}
