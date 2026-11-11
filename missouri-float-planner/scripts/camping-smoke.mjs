// Labelled synthetic observations exercise summer states during off-season QA.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";
const port = 3148,
  origin = `http://127.0.0.1:${port}`,
  fixtureDir = "src/app/camping-layout-check";
const out = process.env.CAMPING_SMOKE_OUTPUT || "/tmp/eddy-camping";
const now = new Date(),
  at = now.toISOString();
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(now);
const advance = (date, n) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000)
    .toISOString()
    .slice(0, 10);
const dates = Array.from({ length: 90 }, (_, i) => advance(day, i));
const names = [
  "Fixture · Open campground",
  "Fixture · Missing inventory",
  "Fixture · Closed campground",
  "Fixture · Unreleased dates",
  "Fixture · Booked campground",
];
const camps = names.map((name, i) => ({
  id: `place-${i}`,
  facilityId: `facility-${i}`,
  name,
  imageUrl:
    i === 0
      ? "/images/river-guides/buffalo-point-aerial.webp"
      : i === 4
        ? "/camping-missing-photo-fixture.jpg"
        : null,
  place: { type: "nps_campground", id: `place-${i}` },
  location: null,
  riverSlugs: i === 1 ? ["jacks-fork", "current"] : ["current"],
  displayGroup:
    i === 1
      ? { key: "jacks-fork", label: "Jacks Fork River" }
      : { key: "current", label: "Current River" },
  managingAgency: null,
  website: "https://www.nps.gov/ozar/",
  reservationUrl: null,
  firstCome: "unknown",
  accessDestination: null,
  serviceId: null,
  loopName: null,
  source: "recreation_gov",
  booking: {
    url: "https://www.recreation.gov/camping/campgrounds/234001",
    label: "Check Recreation.gov",
  },
  latestObservationAt: at,
  expectedReservable: 40,
  freshness: "fresh",
  nights: dates.map((date) => ({
    date,
    sitesOpen: i === 0 ? 40 : 0,
    sitesReservable: 40,
    status: ["open", "full", "closed", "not_yet_released", "full"][i],
    checkedAt: at,
  })),
}));
const overview = {
  schemaVersion: 1,
  generatedAt: at,
  maxObservationAgeSeconds: 259200,
  timeZone: "America/Chicago",
  horizon: {
    startDate: day,
    endDateExclusive: advance(day, 90),
    nights: dates,
  },
  weekend: {
    startDate: advance(day, 3),
    endDateExclusive: advance(day, 5),
    nights: dates.slice(3, 5),
    label: "This weekend",
  },
  tracked: camps,
  untracked: [
    {
      imageUrl: camps[0].imageUrl,
      location: null,
      riverSlugs: ["current"],
      displayGroup: { key: "current", label: "Current River" },
      managingAgency: null,
      website: "https://www.nps.gov/ozar/",
      reservationUrl: null,
      firstCome: "unknown",
      accessDestination: null,
      id: "untracked",
      name: "Fixture · Check directly",
      place: null,
    },
  ],
};
const flags = { Tent: null, RV: null, Electric: true };
const summaries = camps.map((c, i) => ({
  facilityId: c.facilityId,
  fetchedAt: at,
  catalogSites: 40,
  buckets:
    i === 1
      ? [
          { flags, state: "unavailable", complete: true, count: 5 },
          { flags, state: "unknown", complete: false, count: 35 },
        ]
      : [
          {
            flags: i === 4 ? { ...flags, Electric: false } : flags,
            state: [
              "available",
              "unknown",
              "closed",
              "not_yet_released",
              "unavailable",
            ][i],
            complete: true,
            count: 40,
          },
        ],
}));
const fixturePolicy = (operation) => ({
  sourceUrl: "https://www.nps.gov/buff/planyourvisit/camping.htm",
  checkedAt: at,
  reviewBy: `${advance(day, 90)}T12:00:00Z`,
  periods: [
    {
      startDate: day,
      endDateExclusive: advance(day, 90),
      bookingMethod: "first_come",
      operation,
    },
  ],
});
summaries[0].catalogSites += 2;
for (const state of ["first_come", "closed"])
  summaries[0].buckets.push({ flags, state, complete: true, count: 1 });
let server, browser;
let logs = "";
const errors = [];
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server?.kill("SIGKILL");
    void Promise.all([
      rm(fixtureDir, { recursive: true, force: true }),
      rm(".next/dev/types/app/camping-layout-check", {
        recursive: true,
        force: true,
      }),
      rm(".next/dev/types/validator.ts", { force: true }),
    ]).finally(() => process.exit(1));
  });
assert(!existsSync(fixtureDir), "Refusing to overwrite fixture route");
try {
  await mkdir(fixtureDir, { recursive: true });
  await mkdir(out, { recursive: true });
  await writeFile(
    `${fixtureDir}/page.tsx`,
    `import { notFound } from 'next/navigation'; import { Suspense } from 'react'; import CampingHub from '@/components/camping/CampingHub'; export default function Page() { if(process.env.NODE_ENV !== 'development' || process.env.CAMPING_SMOKE !== '1') notFound(); return <main className="min-h-screen bg-neutral-50"><p>Labelled QA fixtures — synthetic availability</p><Suspense><CampingHub overview={${JSON.stringify(overview)}} /></Suspense></main>; }`,
  );
  server = spawn(
    process.execPath,
    ["scripts/conditions-smoke-server.mjs", String(port)],
    {
      env: {
        ...process.env,
        CAMPING_SMOKE: "1",
        EDDY_CONDITIONS_SMOKE: "1",
        CAMPING_WEB_ENABLED: "true",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout.on("data", (d) => {
    logs += d;
    process.stdout.write(d);
  });
  server.stderr.on("data", (d) => {
    logs += d;
    process.stderr.write(d);
  });
  for (let i = 0; i < 120; i++) {
    try {
      if (
        (
          await fetch(`${origin}/camping-layout-check`, {
            signal: AbortSignal.timeout(2000),
          })
        ).ok
      )
        break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (process.env.CAMPING_SMOKE_SERVE_ONLY === "1") {
    console.log("Camping fixture ready for shared browser");
    await new Promise(() => {});
  }
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/campsites?**", (route) => {
    errors.push(
      "The web hub must use its own detail endpoint, not the existing iOS API.",
    );
    return route.abort();
  });
  await page.route("**/api/camping/stay?**", (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({
      json: {
        arrival: url.searchParams.get("arrival"),
        departure: url.searchParams.get("departure"),
        generatedAt: at,
        facilities: summaries,
        filters: ["Electric"],
      },
    });
  });
  await page.route("**/api/camping/sites?**", (route) => {
    const p = new URL(route.request().url()).searchParams;
    const facilityIndex = Number(p.get("facility").split("-").at(-1));
    const occupied = dates.filter(
      (date) => date >= p.get("arrival") && date < p.get("departure"),
    );
    const sites = Array.from({ length: 40 }, (_, i) => {
      const nightState =
        facilityIndex === 0
          ? "open"
          : facilityIndex === 1 && i >= 5
            ? "unknown"
            : facilityIndex === 2
              ? "closed"
              : facilityIndex === 3
                ? "not_yet_released"
                : "reserved";
      const code = {
        open: "A",
        unknown: "-",
        closed: "C",
        not_yet_released: "N",
        reserved: "R",
      }[nightState];
      return {
        site: {
          id: `site-${i + 1}`,
          name: `Fixture site ${String(i + 1).padStart(2, "0")}`,
          loop: "A",
          siteType: "STANDARD ELECTRIC",
          maxOccupancy: 6,
          bookingUrl: "https://www.recreation.gov/camping/campsites/123",
          nights: code.repeat(occupied.length),
        },
        state:
          nightState === "open"
            ? "available"
            : nightState === "unknown"
              ? "unknown"
              : "unavailable",
        nights: occupied.map((date) => ({ date, state: nightState })),
      };
    });
    if (facilityIndex === 0)
      for (const operation of ["open", "closed"])
        sites.push({
          site: {
            id: `policy-${operation}`,
            name:
              operation === "open"
                ? "Fixture · First-come policy site"
                : "Fixture · Seasonal closure site",
            loop: "Policy fixture",
            siteType: "STANDARD ELECTRIC",
            maxOccupancy: 6,
            bookingUrl: "https://www.recreation.gov/camping/campsites/123",
            nights: "-".repeat(occupied.length),
            policy: fixturePolicy(operation),
          },
          state: operation === "open" ? "first_come" : "unavailable",
          nights: occupied.map((date) => ({
            date,
            state: operation === "open" ? "walk_up" : "closed",
            observedState: "unknown",
          })),
        });
    return route.fulfill({
      json: {
        facilityId: p.get("facility"),
        arrival: p.get("arrival"),
        departure: p.get("departure"),
        fetchedAt: at,
        summary:
          facilityIndex === 1
            ? null
            : {
                sitesOpen: facilityIndex === 0 ? 40 : 0,
                sitesReservable: 40,
                sitesWalkUp: facilityIndex === 0 ? 1 : 0,
                status: ["open", "full", "closed", "not_yet_released", "full"][
                  facilityIndex
                ],
              },
        sites,
        availableSites: sites
          .filter((s) => s.state === "available")
          .map((s) => s.site),
      },
    });
  });
  await page.route("**/camping-missing-photo-fixture.jpg", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route("**/api/campsites/photos?**", (route) =>
    route.fulfill({ json: { photos: {} } }),
  );
  await page.goto(`${origin}/camping-layout-check`);
  await page
    .getByRole("heading", { name: "Find your next campsite." })
    .waitFor();
  assert.equal(
    await page
      .getByRole("option", { name: "Current River", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("option", { name: "Jacks Fork River", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Cards", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  const cover = page.getByAltText("Fixture · Open campground", { exact: true });
  await cover.waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(
      'img[alt="Fixture · Open campground"]',
    );
    return image?.complete && image.naturalWidth > 0;
  });
  assert.ok(
    (await page.getByText("Photo unavailable", { exact: true }).count()) > 0,
  );
  const brokenPhotoCard = page
    .getByRole("article")
    .filter({ hasText: "Fixture · Booked campground" });
  await brokenPhotoCard.scrollIntoViewIfNeeded();
  await brokenPhotoCard
    .getByText("Photo unavailable", { exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Find your next campsite." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${out}/desktop-photo-cards-fixture.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByRole("table").waitFor();
  await page.screenshot({
    path: `${out}/desktop-calendar-fixture.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page.getByRole("button", { name: "Tonight", exact: true }).click();
  await page.getByText("40 sites available", { exact: true }).waitFor();
  assert.match(page.url(), /arrival=/);
  await page.getByText("Availability unknown", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Electric", exact: true }).click();
  assert.equal(
    await page.getByRole("button", { name: "Tent", exact: true }).count(),
    0,
  );
  await page.screenshot({
    path: `${out}/desktop-list-fixture.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "View campground" }).first().click();
  await page.getByRole("dialog").waitFor({ state: "visible" });
  await page.getByText("Fixture site 01", { exact: true }).waitFor();
  await page
    .getByText("First come · No reservations", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByText("Fixture · Seasonal closure site", { exact: true })
      .count(),
    0,
  );
  await page.getByLabel("Show unavailable sites", { exact: true }).check();
  await page.getByText("Closed for your stay", { exact: true }).waitFor();
  await page.getByText("First-come site when open", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("link", { name: "Park’s camping rules ↗", exact: true })
      .count(),
    2,
  );
  assert.match(page.url(), /campground=/);
  await page
    .getByRole("button", { name: "Site photos", exact: true })
    .first()
    .click();
  await page
    .getByText("No photos available for this site.", { exact: true })
    .waitFor();
  await page.screenshot({
    path: `${out}/desktop-detail-fixture.png`,
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.doesNotMatch(page.url(), /campground=/);
  assert.equal(
    await page
      .locator(":focus")
      .textContent()
      .then((s) => s.trim())
      .then((s) => s.startsWith("View campground")),
    true,
  );
  const availableOnly = page.getByLabel("Available for my stay");
  for (let i = 0; i < 3; i++) {
    await availableOnly.check();
    assert.equal(await availableOnly.isChecked(), true);
    assert.equal(
      await page.getByRole("button", { name: "View campground" }).count(),
      1,
    );
    assert.equal(new URL(page.url()).searchParams.get("available"), "1");
    await availableOnly.uncheck();
    assert.equal(await availableOnly.isChecked(), false);
    assert.equal(
      await page.getByRole("button", { name: "View campground" }).count(),
      4,
      "Electric excludes a campground known to have no electric sites",
    );
  }
  const search = page.getByRole("searchbox", { name: "Search campgrounds" });
  await search.pressSequentially("Open campground", { delay: 1 });
  assert.equal(
    await search.inputValue(),
    "Open campground",
    "rapid typing retains every character",
  );
  assert.equal(new URL(page.url()).searchParams.get("q"), "Open campground");
  await search.press("Home");
  await search.pressSequentially("Fixture ", { delay: 1 });
  assert.equal(
    await search.inputValue(),
    "Fixture Open campground",
    "typing at the start preserves the caret",
  );
  await search.fill("Open");
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("q", "Booked");
    url.searchParams.set("available", "1");
    window.history.pushState(null, "", url);
  });
  await page.waitForFunction(
    () =>
      document.querySelector('input[placeholder="Search campgrounds"]')
        ?.value === "Booked",
  );
  assert.equal(await availableOnly.isChecked(), true);
  await page
    .getByText("No confirmed openings with these filters.", { exact: false })
    .waitFor();
  await page.goBack();
  await page.waitForFunction(
    () =>
      document.querySelector('input[placeholder="Search campgrounds"]')
        ?.value === "Open",
  );
  assert.equal(await availableOnly.isChecked(), false);
  await page.goForward();
  await page.waitForFunction(
    () =>
      document.querySelector('input[placeholder="Search campgrounds"]')
        ?.value === "Booked",
  );
  assert.equal(await availableOnly.isChecked(), true);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  assert.equal(await search.inputValue(), "");
  assert.equal(await availableOnly.isChecked(), false);
  assert.equal(new URL(page.url()).searchParams.has("q"), false);
  assert.equal(new URL(page.url()).searchParams.has("types"), false);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  assert.equal(
    await page.locator('thead th[data-selected="true"]').count(),
    1,
    "selected stay highlights occupied nights only",
  );
  await page.getByRole("button", { name: "Cards", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await brokenPhotoCard.scrollIntoViewIfNeeded();
  await brokenPhotoCard
    .getByText("Photo unavailable", { exact: true })
    .waitFor();
  await page
    .getByRole("heading", { name: "Find your next campsite." })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `${out}/mobile-list-fixture.png`,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile has no page overflow",
  );
  await page.setViewportSize({ width: 320, height: 844 });
  const [arriveBox, leaveBox] = await Promise.all([
    page.getByLabel("Arrive", { exact: true }).boundingBox(),
    page.getByLabel("Leave", { exact: true }).boundingBox(),
  ]);
  assert.ok(
    leaveBox.y > arriveBox.y && arriveBox.width >= 250,
    "narrow date fields stack without clipping the date",
  );
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "320px has no page overflow",
  );
  await page.screenshot({
    path: `${out}/small-mobile-cards-fixture.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "View campground" }).first().click();
  await page.getByText("Fixture site 01", { exact: true }).waitFor();
  await page.screenshot({
    path: `${out}/mobile-detail-fixture.png`,
    fullPage: true,
  });
  await page.goBack();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByLabel("Arrive", { exact: true }).fill(day);
  await page.getByLabel("Leave", { exact: true }).fill(advance(day, 15));
  await page
    .getByRole("button", { name: "Find campsites", exact: true })
    .click();
  await page.getByRole("alert").filter({ hasText: "1–14 nights" }).waitFor();
  const tomorrow = advance(day, 1);
  await page.clock.setFixedTime(new Date(`${tomorrow}T12:00:00Z`));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(
    (date) => document.querySelector('input[type="date"]')?.min === date,
    tomorrow,
  );
  await page.getByRole("button", { name: "Tonight", exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get("arrival"), tomorrow);
  assert.equal(
    await page.getByLabel("Arrive", { exact: true }).inputValue(),
    tomorrow,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Camping browser smoke passed: desktop calendar/list, unknown state, immediate filters, rapid typing/caret, URL/Back/Forward/clear, modal/Escape/focus, mobile overflow, 14-night cap.",
  );
} catch (error) {
  console.error(logs.slice(-6000));
  throw error;
} finally {
  server?.kill("SIGKILL");
  await browser?.close();
  await rm(fixtureDir, { recursive: true, force: true });
  await rm(".next/dev/types/app/camping-layout-check", {
    recursive: true,
    force: true,
  });
  await rm(".next/dev/types/validator.ts", { force: true });
}
