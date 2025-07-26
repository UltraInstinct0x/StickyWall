import { test, expect } from "@playwright/test";

test("homepage loads correctly", async ({ page }) => {
  await page.goto("/");

  // Check if the page loads
  await expect(page).toHaveTitle(/Digital Wall/i);

  // Check for main heading or content
  await expect(page.locator("h1")).toBeVisible();
});

test("PWA manifest is accessible", async ({ page }) => {
  const response = await page.request.get("/manifest.json");
  expect(response.status()).toBe(200);

  const manifest = await response.json();
  expect(manifest.name).toBeTruthy();
  expect(manifest.short_name).toBeTruthy();
});

test("share target endpoint works", async ({ page }) => {
  // Test the share target functionality
  const response = await page.request.post("/api/share", {
    form: {
      title: "Test Share",
      text: "This is a test share",
      url: "https://example.com",
    },
  });

  expect(response.status()).toBe(303); // Should redirect
});

test("walls API endpoint works", async ({ page }) => {
  const response = await page.request.get("http://backend:8000/api/health");
  expect(response.status()).toBe(200);
});
