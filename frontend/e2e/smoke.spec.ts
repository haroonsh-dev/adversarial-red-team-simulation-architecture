import { test, expect } from "@playwright/test";
import { seedAuth } from "./seedAuth";

test.describe("ARTSA frontend smoke", () => {
  test.beforeEach(async ({ page }) => {
    await seedAuth(page);
  });

  test("home page loads enterprise landing", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /see what ai agents actually do/i }).first()
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /contain your ai agents/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /try live demo/i }).first()).toBeVisible();
    await expect(page.getByText(/get started/i).first()).toBeVisible();
  });

  test("sign in panel renders on landing", async ({ page }) => {
    await page.goto("/?signin=1");
    await expect(page).toHaveURL(/\?signin=1/);
    await expect(page.getByRole("heading", { name: /sign in/i }).first()).toBeVisible();
  });

  test("command center page loads", async ({ page }) => {
    await page.goto("/command-center");
    await expect(page).toHaveURL(/\/command-center/);
    await expect(page.getByRole("heading", { name: /command center/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("risk framework page lists the agentic top 10", async ({ page }) => {
    await page.goto("/risks");
    await expect(page.getByRole("heading", { name: /^risk$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: /agent goal hijack/i }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /rogue agents/i }).first()).toBeVisible();
  });

  test("sidebar navigation includes red team", async ({ page }) => {
    await page.goto("/command-center");
    await expect(page.getByRole("link", { name: /^attack lab$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^campaigns$/i })).toBeVisible();
  });
});
