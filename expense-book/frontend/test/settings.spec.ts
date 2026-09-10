import { expect, test } from "@playwright/test";

test("labels and split templates save, persist, and appear in record forms", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a group", exact: true })
    .click();
  await page.getByLabel("Group name").fill(`Settings ${Date.now()}`);
  await page
    .getByLabel("Member names, separated by commas")
    .fill("Alex, Jordan");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await page
    .getByRole("link", { name: "Members & access", exact: true })
    .click();
  await page.getByLabel("Label name").fill("Summer trip");
  await expect(page.getByLabel("Reference amount (USD)")).toHaveValue("0.00");
  await page.getByLabel("Reference amount (USD)").fill("-0.50");
  await page.getByLabel("As of date").fill("2026-01-01");
  await page
    .getByRole("button", { name: "Save opening balance", exact: true })
    .click();
  await expect(
    page.getByText("Opening balance saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Reference amount (USD)")).toHaveValue("-0.50");
  await expect(page.getByLabel("As of date")).toHaveValue("2026-01-01");
  await page.getByLabel("Label name").fill("Summer trip");
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await expect(page.getByText("Label created.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Label name")).toHaveValue("");
  await page.getByLabel("Label name").fill("Food");
  await page.locator('select[name="kind"]').selectOption("category");
  await page.getByRole("button", { name: "Create label", exact: true }).click();
  await expect(page.getByText("Category: Food", { exact: true })).toBeVisible();
  await page.getByLabel("Template name").fill("Household");
  await page.locator('input[name="templateMember"]').first().check();
  await page
    .getByRole("button", { name: "Create template", exact: true })
    .click();
  await expect(
    page.getByText("Split template created.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Project: Summer trip", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Category: Food", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Back to group" }).click();
  await page.getByRole("button", { name: "Add record", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Project or trip", exact: true })
    .selectOption("Summer trip");
  await page
    .getByRole("combobox", { name: "Category or tag", exact: true })
    .selectOption("Food");
  await page
    .getByLabel("Apply saved split template")
    .selectOption({ label: "Household" });
  await expect(page.locator('input[name="shared"]:checked')).toHaveCount(1);
  expect(errors).toEqual([]);
});
