import { expect, test } from "@playwright/test";

test("group tools load, empty reports export, and CSV imports create review drafts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a group", exact: true })
    .click();
  await page.getByLabel("Group name").fill(`Tools ${Date.now()}`);
  await page
    .getByLabel("Member names, separated by commas")
    .fill("Alex, Jordan");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const reportLink = page.getByRole("link", {
    name: "Reports & activity",
    exact: true,
  });
  await expect(
    page.getByRole("link", { name: "Search", exact: true }),
  ).toHaveCount(0);
  await expect(reportLink).toBeVisible();
  const path = (await reportLink.getAttribute("href"))!.replace(
    /\/reports$/,
    "",
  );
  await reportLink.click();
  await expect(page.getByText("No records match these filters.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export all", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("report.csv");
  await page.goto(`${path}/search`);
  await expect(page).toHaveURL(new RegExp(`${path}/reports$`));
  await expect(
    page.getByRole("heading", { name: "Reports & activity" }),
  ).toBeVisible();
  await page.goto(`${path}/recurring`);
  await expect(page.getByText("No upcoming schedules.")).toBeVisible();
  await page.getByRole("button", { name: "Generate due drafts" }).click();
  await expect(page.getByRole("status")).toContainText("0 due drafts");
  await page.goto(`${path}/import`);
  await page.getByLabel("CSV file").setInputFiles({
    name: "expenses.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "date,description,kind,amount\n2026-09-08,Lunch,expense,12.50\n",
    ),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(
    page.getByRole("cell", { name: "Lunch", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create review drafts" }).click();
  await expect(
    page.getByText("1 draft records created. Review them before posting."),
  ).toBeVisible();
  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Notification preferences" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
