// e2e/messaging-ui.spec.ts — UI tests for the messaging sidebar on the results page.
import { test, expect } from "@playwright/test";

test.describe("Results Page — Message Sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/results");
  });

  test("shows floating chat button", async ({ page }) => {
    const chatButton = page.getByRole("button", { name: /chat with your dentist/i });
    await expect(chatButton).toBeVisible();
  });

  test("opens sidebar when floating button is clicked", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    const sidebar = page.getByRole("dialog", { name: /chat with your dentist/i });
    await expect(sidebar).toBeVisible();
  });

  test("closes sidebar when X is clicked", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    const sidebar = page.getByRole("dialog", { name: /chat with your dentist/i });
    await expect(sidebar).toBeVisible();

    await page.getByRole("button", { name: /close chat/i }).click();
    await expect(sidebar).not.toBeVisible();
  });

  test("closes sidebar on Escape key", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    const sidebar = page.getByRole("dialog", { name: /chat with your dentist/i });
    await expect(sidebar).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(sidebar).not.toBeVisible();
  });

  test("closes sidebar when backdrop is clicked", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    const sidebar = page.getByRole("dialog", { name: /chat with your dentist/i });
    await expect(sidebar).toBeVisible();

    // Click the backdrop (left side of the screen).
    await page.click("[aria-hidden='true']");
    await expect(sidebar).not.toBeVisible();
  });

  test("shows empty state when no messages exist", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    // Wait for loading to finish.
    await page.waitForTimeout(1000);
    await expect(page.getByText("No messages yet.")).toBeVisible();
  });

  test("sends a message and shows it in the chat", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    await page.waitForTimeout(1000);

    const textarea = page.getByRole("textbox", { name: /message input/i });
    await textarea.fill("Hello, I have a question about my scan results.");
    await page.getByRole("button", { name: /send message/i }).click();

    // Optimistic message should appear immediately.
    await expect(page.getByText("Hello, I have a question about my scan results.")).toBeVisible();
  });

  test("send button is disabled when textarea is empty", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    await page.waitForTimeout(500);

    const sendButton = page.getByRole("button", { name: /send message/i });
    await expect(sendButton).toBeDisabled();
  });

  test("shows character count when typing", async ({ page }) => {
    await page.getByRole("button", { name: /chat with your dentist/i }).click();
    await page.waitForTimeout(500);

    const textarea = page.getByRole("textbox", { name: /message input/i });
    await textarea.fill("Hello");
    await expect(page.getByText("5/500")).toBeVisible();
  });
});
