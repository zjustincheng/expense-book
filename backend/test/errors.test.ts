import { expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { fail } from "../src/lib/errors.js";
import type { Database } from "../src/db/client.js";

it("exposes intentional service messages but masks upstream exceptions", async () => {
  const app = await createApp(
    {} as Database,
    async () => ({
      subject: "test",
      verifiedEmail: async () => "test@example.test",
    }),
    { logging: false },
  );
  app.get("/test-public-error", () =>
    fail("Storage temporarily unavailable. Retry shortly.", 503),
  );
  app.get("/test-private-error", () => {
    throw Object.assign(new Error("secret upstream credentials"), {
      statusCode: 503,
    });
  });
  try {
    const publicResponse = await app.inject({ url: "/test-public-error" });
    expect(publicResponse.statusCode).toBe(503);
    expect(publicResponse.json().error).toBe(
      "Storage temporarily unavailable. Retry shortly.",
    );
    const privateResponse = await app.inject({ url: "/test-private-error" });
    expect(privateResponse.statusCode).toBe(503);
    expect(privateResponse.json().error).toBe(
      "The request could not be completed.",
    );
  } finally {
    await app.close();
  }
});
