// e2e/results-page.spec.ts — UI tests for the results page layout and features.
import { test, expect } from "@playwright/test";

test.describe("Results Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/results");
  });

  test("displays scan complete heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /scan complete/i })).toBeVisible();
  });

  test("displays AI analysis card", async ({ page }) => {
    await expect(page.getByText("AI Analysis in Progress")).toBeVisible();
    await expect(page.getByText("Powered by DentalScan AI")).toBeVisible();
  });

  test("displays 5 captured view labels", async ({ page }) => {
    for (const label of ["Front", "Left", "Right", "Upper", "Lower"]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
  });

  test("displays next steps section", async ({ page }) => {
    await expect(page.getByText("What happens next")).toBeVisible();
  });

  test("displays notification bell in header", async ({ page }) => {
    const bell = page.getByRole("button", { name: /notifications/i });
    await expect(bell).toBeVisible();
  });

  test("reads scanId from URL params", async ({ page }) => {
    await page.goto("/results?scanId=test_scan_from_url");
    await expect(page.getByText("test_scan_from_")).toBeVisible();
  });
});
