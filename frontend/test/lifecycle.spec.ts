import { expect, test, type Page, type Locator } from "@playwright/test";

async function request(page: Page, path: string, body?: unknown) {
  const response =
    body === undefined
      ? await page.request.get(`/api${path}`)
      : await page.request.post(`/api${path}`, {
          data: body,
          headers: {
            Origin: "http://localhost:3100",
            "idempotency-key": crypto.randomUUID(),
          },
        });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function workspace(page: Page) {
  const group = await request(page, "/groups", {
    name: `Lifecycle ${crypto.randomUUID().slice(0, 8)}`,
    currency: "USD",
    members: ["Alex", "Jordan"],
  });
  await page.goto(`/?group=${group.id}`);
  await expect(
    page.getByRole("heading", { name: "Where everyone stands" }),
  ).toBeVisible();
  return group.id as string;
}
async function newExpense(page: Page, description: string, amount = "100") {
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  const form = page.getByRole("region", { name: "New record", exact: true });
  await form.getByLabel("Amount (USD)", { exact: true }).fill(amount);
  await form.getByLabel("Description", { exact: true }).fill(description);
  await form
    .getByRole("combobox", { name: "Paid by", exact: true })
    .selectOption({ label: "Alex" });
  return form;
}
async function post(form: Locator) {
  await form.getByRole("button", { name: "Preview balance changes" }).click();
  await expect(
    form.getByRole("heading", { name: /Review balance changes/ }),
  ).toBeVisible();
  await form.getByRole("button", { name: "Confirm and post" }).click();
}
async function record(page: Page, description: string) {
  const row = page
    .locator("#activity > ul > li")
    .filter({ has: page.getByText(description, { exact: true }) });
  await row.locator("summary").click();
  await row
    .getByRole("button", { name: "Show member balance changes" })
    .click();
  return row;
}

test("receipts upload, preview, delete, and clear the file input", async ({
  page,
}) => {
  const groupId = await workspace(page);
  // Exercise the real proxy and Fastify parser, including older clients that
  // still send a JSON header with an empty DELETE body.
  const missing = await page.request.delete(
    `/api/groups/${groupId}/attachments/${crypto.randomUUID()}`,
    {
      headers: {
        Origin: "http://localhost:3100",
        "Content-Type": "application/json",
      },
    },
  );
  expect(missing.status()).toBe(404);
  expect(await missing.json()).toEqual({ error: "Attachment not found." });
  await post(await newExpense(page, "Receipt test"));
  const receipt = {
    id: crypto.randomUUID(),
    fileName: "receipt.png",
    contentType: "image/png",
    size: 68,
  };
  let uploaded = false;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**/api/groups/*/entries/*/attachments", async (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        json: { ...receipt, uploadUrl: "http://localhost:3100/test-receipt" },
      });
    return route.fulfill({ json: uploaded ? [receipt] : [] });
  });
  await page.route("**/test-receipt", async (route) => {
    if (route.request().method() === "PUT") {
      uploaded = true;
      return route.fulfill({ status: 200, body: "" });
    }
    return route.fulfill({ contentType: "image/png", body: png });
  });
  await page.route("**/attachments/*/download", (route) =>
    route.fulfill({
      json: { downloadUrl: "http://localhost:3100/test-receipt" },
    }),
  );
  const row = await record(page, "Receipt test");
  const input = row.getByLabel("Upload attachment");
  let failFinalization = true;
  let cleanupCalled = false;
  await page.route("**/attachments/*/complete", (route) =>
    route.fulfill(
      failFinalization
        ? {
            status: 503,
            json: { error: "Unable to verify the upload. Please try again." },
          }
        : { json: { ready: true } },
    ),
  );
  await page.route(`**/attachments/${receipt.id}`, async (route) => {
    expect(route.request().method()).toBe("DELETE");
    cleanupCalled = true;
    uploaded = false;
    await route.fulfill({ json: { deleted: true } });
  });
  await input.setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    row.getByText("Unable to verify the upload. Please try again."),
  ).toBeVisible();
  await expect.poll(() => cleanupCalled).toBe(true);
  expect(uploaded).toBe(false);
  await expect(input).toHaveValue("");
  failFinalization = false;
  await input.setInputFiles({
    name: "receipt.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    row.getByText("receipt.png (1 KB)", { exact: true }),
  ).toBeVisible();
  await expect(input).toHaveValue("");
  await row.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(
    row.getByRole("img", { name: "Receipt: receipt.png" }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Close preview" }).click();
  await expect(row.getByRole("img")).toHaveCount(0);
  await page.route(`**/attachments/${receipt.id}`, (route) => {
    expect(route.request().method()).toBe("DELETE");
    expect(route.request().headers()["content-type"]).toBeUndefined();
    return route.fulfill({ json: { deleted: true } });
  });
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Delete attachment?" });
  await expect(
    confirmation.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).not.toBeVisible();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "Delete attachment", exact: true })
    .click();
  await expect(row.getByText("receipt.png", { exact: false })).toHaveCount(0);
  await expect(row.getByText("No receipts attached yet.")).toBeVisible();
});

test("drafts survive reload, stay out of balances, reject stale previews, and can be discarded", async ({
  page,
}) => {
  const id = await workspace(page);
  const form = await newExpense(page, "Planned dinner");
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(form).not.toBeVisible();
  await page.reload();
  const drafts = page.getByRole("region", { name: "Drafts", exact: true });
  await expect(
    drafts.getByText("Planned dinner", { exact: true }),
  ).toBeVisible();
  expect((await request(page, `/groups/${id}`)).entries).toHaveLength(0);
  await expect(page.getByText("Everyone is settled up.")).toBeVisible();
  await drafts.getByRole("button", { name: "Edit draft", exact: true }).click();
  const editor = page.getByRole("region", { name: "Edit draft", exact: true });
  await expect(editor.getByLabel("Amount (USD)", { exact: true })).toHaveValue(
    "100",
  );
  await editor.getByLabel("Amount (USD)", { exact: true }).fill("120");
  await editor.getByRole("button", { name: "Preview balance changes" }).click();
  await expect(
    editor.getByRole("heading", { name: /Review balance changes/ }),
  ).toBeVisible();
  const settings = await request(page, `/groups/${id}/settings`);
  await request(page, `/groups/${id}/settings`, {
    version: settings.version,
    command: { action: "addMember", name: "Sam" },
  });
  await editor.getByRole("button", { name: "Confirm and post" }).click();
  await expect(editor.getByRole("alert")).toContainText("group changed");
  expect((await request(page, `/groups/${id}`)).entries).toHaveLength(0);
  await post(editor);
  await expect(editor).not.toBeVisible();
  await expect(drafts.getByText("No saved drafts.")).toBeVisible();
  const posted = await request(page, `/groups/${id}`);
  expect(posted.entries).toHaveLength(1);
  expect(posted.entries[0].amount).toBe("12000");
  const second = await newExpense(page, "Discard me");
  await second.getByRole("button", { name: "Save draft", exact: true }).click();
  await drafts
    .getByRole("button", { name: "Discard draft", exact: true })
    .click();
  await drafts.getByRole("button", { name: "Confirm discard" }).click();
  await expect(drafts.getByText("No saved drafts.")).toBeVisible();
  expect((await request(page, `/groups/${id}`)).totals).toEqual(posted.totals);
});

test("partial refunds, refund reversals, and atomic corrections retain linked history", async ({
  page,
}) => {
  const id = await workspace(page);
  await post(await newExpense(page, "Dinner receipt"));
  await expect(
    page.getByRole("region", { name: "New record", exact: true }),
  ).not.toBeVisible();
  let original = await record(page, "Dinner receipt");
  await original
    .getByRole("button", { name: "Record refund", exact: true })
    .click();
  const refund = original.getByRole("form", { name: "Record refund" });
  await refund.getByLabel("Refund amount (USD)").fill("100.01");
  await refund.getByLabel("Reason for refund").fill("Returned item");
  await refund
    .getByRole("combobox", { name: "Refund received by", exact: true })
    .selectOption({ label: "Jordan" });
  await refund.getByRole("button", { name: "Preview balance changes" }).click();
  await expect(refund.getByRole("alert")).toContainText("exceeds");
  await refund.getByLabel("Refund amount (USD)").fill("30");
  await post(refund);
  await expect(refund).not.toBeVisible();
  // The details element stays open when its contents refresh.
  await original
    .getByRole("button", { name: "Show member balance changes" })
    .click();
  await expect(
    original.getByText(/Reverse active linked refunds/),
  ).toBeVisible();
  await expect(
    original.getByRole("button", { name: "Correct record", exact: true }),
  ).toHaveCount(0);
  const refundRow = await record(page, "Returned item");
  await refundRow
    .getByRole("button", { name: "Reverse record", exact: true })
    .click();
  const reversal = refundRow.getByRole("form", { name: "Reverse record" });
  await reversal
    .getByLabel("Reason for reversal")
    .fill("Refund was entered by mistake");
  await post(reversal);
  await expect(reversal).not.toBeVisible();
  original = page
    .locator("#activity > ul > li")
    .filter({ has: page.getByText("Dinner receipt", { exact: true }) });
  await original
    .getByRole("button", { name: "Show member balance changes" })
    .click();
  await original
    .getByRole("button", { name: "Correct record", exact: true })
    .click();
  const correction = original.getByRole("region", {
    name: "Correct record",
    exact: true,
  });
  await correction
    .getByLabel("Reason for changing this record")
    .fill("Corrected receipt total");
  await correction.getByLabel("Amount (USD)", { exact: true }).fill("120");
  await correction
    .getByLabel("Description", { exact: true })
    .fill("Correct dinner receipt");
  await correction
    .getByRole("button", { name: "Preview balance changes" })
    .click();
  await expect(
    correction.getByText(/reversal · Corrected receipt total/),
  ).toBeVisible();
  await correction.getByRole("button", { name: "Confirm and post" }).click();
  await expect(correction).not.toBeVisible();
  const result = await request(page, `/groups/${id}`);
  expect(result.entries).toHaveLength(5);
  expect(result.totals.expenses).toBe("12000");
  const source = result.entries.find(
    (entry: { description: string }) => entry.description === "Dinner receipt",
  );
  const detail = await request(page, `/groups/${id}/entries/${source.id}`);
  expect(detail.state).toBe("reversed");
  expect(
    detail.related.some(
      (entry: { corrects: string }) => entry.corrects === source.id,
    ),
  ).toBe(true);
});

test("lost posting responses retry the same operation without duplicating money", async ({
  page,
}) => {
  const id = await workspace(page);
  const form = await newExpense(page, "Reliable save");
  await form.getByRole("button", { name: "Preview balance changes" }).click();
  let dropped = false;
  const keys: string[] = [];
  await page.route(`**/api/groups/${id}/entries`, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]!);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form.getByRole("button", { name: "Confirm and post" }).click();
  await expect(form.getByRole("alert")).toContainText("could not be confirmed");
  await expect(form.getByLabel("Amount (USD)", { exact: true })).toBeDisabled();
  await expect(
    form.getByRole("button", { name: "Edit details" }),
  ).toBeDisabled();
  await form.getByRole("button", { name: "Retry confirmation" }).click();
  await expect(form).not.toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect((await request(page, `/groups/${id}`)).entries).toHaveLength(1);
});

test("detailed allocations and cash participants survive draft editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const id = await workspace(page);
  const group = await request(page, `/groups/${id}`);
  const [a, b] = group.members.map((member: { id: string }) => member.id);
  for (const split of [
    {
      method: "exact",
      shares: [
        { memberId: a, amount: "7000" },
        { memberId: b, amount: "3000" },
      ],
    },
    {
      method: "weights",
      shares: [
        { memberId: a, weight: "7" },
        { memberId: b, weight: "3" },
      ],
    },
    {
      method: "percentages",
      shares: [
        { memberId: a, weight: "7000" },
        { memberId: b, weight: "3000" },
      ],
    },
  ]) {
    const input = {
      kind: "expense",
      description: `Detailed ${split.method}`,
      date: "2026-09-08",
      expression: "50 * 2",
      cash: [
        { memberId: a, amount: "6000" },
        { memberId: b, amount: "4000" },
      ],
      split,
    };
    const created = await request(page, `/groups/${id}/drafts`, {
      action: "create",
      input,
    });
    await page.reload();
    const drafts = page.getByRole("region", { name: "Drafts", exact: true });
    await drafts
      .getByRole("button", { name: "Edit draft", exact: true })
      .last()
      .click();
    const editor = page.getByRole("region", {
      name: "Edit draft",
      exact: true,
    });
    await editor
      .getByLabel("Description", { exact: true })
      .fill(`Edited ${split.method}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await editor
      .getByRole("button", { name: "Save draft", exact: true })
      .click();
    await expect(editor).not.toBeVisible();
    const saved = await request(page, `/groups/${id}/drafts/${created.id}`);
    expect(saved.input).toEqual({
      ...input,
      description: `Edited ${split.method}`,
    });
    await request(page, `/groups/${id}/drafts`, {
      action: "discard",
      draftId: saved.id,
      version: saved.version,
    });
  }
});

test("a lost draft response retries without creating a second draft", async ({
  page,
}) => {
  const id = await workspace(page);
  const form = await newExpense(page, "One planned payment", "12.34");
  let dropped = false;
  const keys: string[] = [];
  await page.route(`**/api/groups/${id}/drafts`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    keys.push(route.request().headers()["idempotency-key"]!);
    if (!dropped) {
      dropped = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await form.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("could not be confirmed");
  await expect(form.getByLabel("Amount (USD)", { exact: true })).toBeDisabled();
  await form.getByRole("button", { name: "Retry saving draft" }).click();
  await expect(form).not.toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const drafts = await request(page, `/groups/${id}/drafts`);
  expect(drafts).toHaveLength(1);
  expect(drafts[0].input.expression).toBe("12.34");
  expect((await request(page, `/groups/${id}`)).entries).toHaveLength(0);
});

test("entry guidance, unsaved edits, failed previews and lost confirmations recover safely", async ({
  page,
}) => {
  const id = await workspace(page);
  const form = await newExpense(page, "Recovery dinner", "80");
  await expect(form.getByText(/Use for a shared purchase/)).toBeVisible();
  await form
    .getByRole("combobox", { name: "Record type", exact: true })
    .selectOption("settlement");
  await expect(form.getByText(/payment already made to settle/)).toBeVisible();
  await form
    .getByRole("combobox", { name: "Record type", exact: true })
    .selectOption("expense");
  await form.getByRole("button", { name: "Close entry form" }).click();
  await expect(
    form.getByText(/Close without saving these edits/),
  ).toBeVisible();
  await form.getByRole("button", { name: "Keep editing" }).click();
  await expect(form.getByLabel("Description", { exact: true })).toHaveValue(
    "Recovery dinner",
  );
  await page.route(
    `**/api/groups/${id}/preview`,
    async (route) => {
      await route.fulfill({
        status: 502,
        contentType: "text/html",
        body: "<html>Bad gateway</html>",
      });
    },
    { times: 1 },
  );
  await form.getByRole("button", { name: "Preview balance changes" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(form.getByLabel("Amount (USD)", { exact: true })).toHaveValue(
    "80",
  );
  await form.getByRole("button", { name: "Preview balance changes" }).click();
  await expect(
    form.getByRole("heading", { name: /Review balance changes/ }),
  ).toBeVisible();
  // The server commits but the proxy loses its response. Retry must reuse the write key.
  await page.route(
    `**/api/groups/${id}/entries`,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.fulfill({
        status: 200,
        body: "",
        contentType: "application/json",
      });
    },
    { times: 1 },
  );
  await form.getByRole("button", { name: "Confirm and post" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "result could not be confirmed",
  );
  await expect(
    form.getByRole("button", { name: "Close entry form" }),
  ).toBeDisabled();
  await form.getByRole("button", { name: "Retry confirmation" }).click();
  await expect(form).not.toBeVisible();
  expect((await request(page, `/groups/${id}`)).entries).toHaveLength(1);

  const inbox = page.getByRole("region", {
    name: "Needs attention",
    exact: true,
  });
  await inbox
    .getByRole("button", { name: "Uncategorized", exact: true })
    .click();
  await expect(
    inbox.getByText("Recovery dinner", { exact: true }),
  ).toBeVisible();
  await inbox
    .getByRole("button", { name: "Expenses without attachments", exact: true })
    .click();
  await expect(
    inbox.getByText("Recovery dinner", { exact: true }),
  ).toBeVisible();
  await inbox.getByText("Review record", { exact: true }).click();
  await inbox
    .getByRole("button", { name: "Show member balance changes" })
    .click();
  await expect(
    inbox.getByRole("heading", { name: "Receipts & attachments", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
