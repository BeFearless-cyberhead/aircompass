import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * App-level flows and accessibility gates against the production build.
 * The web server runs with GEMINI_API_KEY="" so plans use the deterministic engine.
 */

const PROFILE_KEY = "aircompass_profile_v1";
const DEMO_KEY = "aircompass_demo_v1";
const LANG_KEY = "aircompass_lang_v1";

const SAMPLE = {
  lang: "en",
  place: { name: "Greater Noida", lat: 28.47, lon: 77.5, country: "IN" },
  household: { adults: 2, children: 1, seniors: 1, conditions: ["respiratory"] },
  home: { type: "apartment", windows: "normal", ac: true, purifier: "none", cooking: "lpg", roomAreaM2: 15 },
  commute: { mode: "car", km: 12, daysPerWeek: 5 },
  habits: { morningOutdoorExercise: true, schoolRun: true },
  budget: "low",
} as const;

async function seedProfile(page: Page): Promise<void> {
  await page.addInitScript(
    ({ profileKey, demoKey, langKey, profile }) => {
      localStorage.setItem(profileKey, JSON.stringify(profile));
      localStorage.setItem(demoKey, "true");
      localStorage.setItem(langKey, profile.lang);
    },
    { profileKey: PROFILE_KEY, demoKey: DEMO_KEY, langKey: LANG_KEY, profile: SAMPLE },
  );
}

async function waitForPlan(page: Page): Promise<void> {
  await expect(page.getByTestId("plan-outcome")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("plan-card").first()).toBeVisible();
}

test("sample family loads, plan tabs disclose calculations, and reload keeps the profile", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sample-family-btn").click();
  await expect(page.getByRole("heading", { name: /Today — Greater Noida/ })).toBeVisible();
  await expect(page.getByTestId("sample-family-btn")).toHaveCount(0);

  await page.goto("/plan");
  await waitForPlan(page);
  await expect(page.getByTestId("plan-outcome")).toHaveText("Engine plan (AI unavailable)");

  const indoor = page.getByRole("tab", { name: "Indoors" });
  await indoor.click();
  await expect(indoor).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("plan-card").first()).toBeVisible();

  await page.getByText("How we calculated").first().click();
  await expect(page.getByText(/Method|Assumptions|Confidence/).first()).toBeVisible();

  await page.reload();
  await waitForPlan(page);
});

test("setup saves a new household and routes to a usable plan", async ({ page }) => {
  await page.goto("/setup");
  await page.getByLabel("Adults").fill("1");
  await page.getByLabel("Children").fill("0");
  await page.getByLabel("Seniors (60+)").fill("0");
  await page.locator("#room-size").fill("18");
  await page.locator("#commute-mode").selectOption("wfh");
  await page.locator("#commute-km").fill("0");
  await page.locator("#commute-days").fill("0");
  await page.locator("#budget").selectOption("zero");
  await page.getByRole("button", { name: "Get my plan" }).click();

  await expect(page).toHaveURL(/\/plan$/);
  await waitForPlan(page);
  await expect(page.getByTestId("plan-outcome")).toHaveText("Engine plan (AI unavailable)");
});

test("impact what-if changes the hero using the engine", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/impact");
  const hero = page.getByTestId("impact-hero");
  await expect(hero).toBeVisible();
  const before = await hero.textContent();

  await page.locator("#whatif-purifier").selectOption("hepa");
  await page.locator("#whatif-windows").selectOption("shut");
  await page.locator("#whatif-commute").selectOption("wfh");
  await expect(hero).not.toHaveText(before ?? "");
});

test("brief has a printable community brief", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/brief");
  await expect(page.getByRole("heading", { name: "Community Brief — Greater Noida" })).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Community Brief — Greater Noida" })).toBeVisible();
});

test("language toggle switches to Hindi and persists across reload", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("lang-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByTestId("sample-family-btn")).toContainText("सैंपल परिवार");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");
  await expect(page.getByTestId("lang-toggle")).toHaveText("English");
});

const ROUTES = [
  { path: "/", heading: /Today/ },
  { path: "/plan", heading: /Plan/ },
  { path: "/impact", heading: /Your Impact/ },
  { path: "/brief", heading: /Community Brief/ },
  { path: "/setup", heading: /Set up your household/ },
  { path: "/about", heading: /About AirCompass/ },
];

for (const route of ROUTES) {
  for (const combo of [
    { lang: "en", scheme: "light" as const },
    { lang: "hi", scheme: "dark" as const },
  ]) {
    test(`axe: ${route.path} (${combo.lang}, ${combo.scheme})`, async ({ page }) => {
      await seedProfile(page);
      await page.emulateMedia({ colorScheme: combo.scheme });
      await page.goto(route.path);
      if (route.path === "/plan") {
        await waitForPlan(page);
      } else {
        await expect(page.getByRole("heading", { name: route.heading }).first()).toBeVisible({ timeout: 20_000 });
      }

      if (combo.lang === "hi") {
        const planRequest = page.waitForResponse(
          (res) => res.url().includes("/api/plan") && res.request().method() === "POST",
          { timeout: 20_000 },
        );
        await page.getByTestId("lang-toggle").click();
        await planRequest;
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        results.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 4),
        })),
      ).toEqual([]);
    });
  }
}
