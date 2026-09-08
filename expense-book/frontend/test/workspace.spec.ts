import { expect, test } from "@playwright/test";
test("creates a zero-balance group, previews income, and records a partial settlement", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Create your first group" }).click();
  await page.getByLabel("Group name").fill("Weekend crew");
  await page
    .getByLabel("Member names, separated by commas")
    .fill("Alex, Jordan");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Where everyone stands" }),
  ).toBeVisible();
  await expect(page.getByText("Everyone is settled up.")).toBeVisible();
  await page.getByRole("button", { name: "Add record" }).click();
  await page.getByLabel("Record type").selectOption("income");
  await page.getByLabel("Amount (USD)").fill("1000");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Shared event income");
  await page
    .getByRole("combobox", { name: "Received by", exact: true })
    .selectOption({ label: "Alex" });
  await page.getByRole("button", { name: "Preview balance changes" }).click();
  await expect(
    page.getByRole("heading", { name: /Review balance changes/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm and post" }).click();
  await expect(
    page.getByText("Shared event income", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Why this balance?" }).first().click();
  await expect(page.getByText(/balance explained/)).toBeVisible();
  await page.getByRole("button", { name: "Add record" }).click();
  await page.getByLabel("Record type").selectOption("settlement");
  await page.getByLabel("Amount (USD)").fill("250");
  await page.getByLabel("Description", { exact: true }).fill("Partial payment");
  await page
    .getByRole("combobox", { name: "Sent by", exact: true })
    .selectOption({ label: "Alex" });
  await page
    .getByRole("combobox", { name: "Received by", exact: true })
    .selectOption({ label: "Jordan" });
  await page.getByRole("button", { name: "Preview balance changes" }).click();
  await page.getByRole("button", { name: "Confirm and post" }).click();
  await expect(
    page.getByText("Partial payment", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("USD 250.00").first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Shared event income", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Where everyone stands" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
