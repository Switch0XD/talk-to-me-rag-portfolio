import { expect, test } from "@playwright/test";

test("opens, answers, and closes the portfolio assistant", async ({ page }) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        kind: "answer",
        answer: "HIMS used HL7 FHIR R4-compliant REST APIs.",
        citations: [{ sourceId: "hims", title: "HIMS", heading: "Healthcare standard" }],
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Talk to Kuldeep" })).toBeVisible();
  await page.getByRole("button", { name: "Talk to Kuldeep" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Your question").fill("What healthcare standard did HIMS use?");
  await page.getByRole("button", { name: "Ask" }).click();
  await expect(page.getByText("HIMS used HL7 FHIR R4-compliant REST APIs.")).toBeVisible();
  await expect(page.getByText("HIMS · Healthcare standard")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("keeps the mobile trigger inside the viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "This assertion is specific to the 375px mobile layout.");
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Talk to Kuldeep" });
  const box = await trigger.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(box!.y + box!.height).toBeLessThanOrEqual(667);
});
