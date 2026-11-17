// Labelled synthetic observations exercise summer states during off-season QA.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const port = Number(process.env.CAMPING_SMOKE_PORT || 3148),
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
  firstCome: 'unknown',
  // Out of name order on purpose; the second has no mile, as older responses do.
  accessDestination: { riverSlug: 'current', accessId: 'fixture-access', riverMile: [51, undefined, 9, 97, 26][i] },
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
const riverReading = (code, label, readingAgeHours) => ({
  label, code, thresholdUnit: "cfs", gaugeHeightFt: null, dischargeCfs: 900,
  readingAgeHours, trend: { direction: "falling", label: "Falling", windowHours: 6 },
});
// Jacks Fork's reading is a day old: the hub must not present it as "now".
const rivers = [
  ["current", "Current River", riverReading("good", "Good", 1)],
  ["jacks-fork", "Jacks Fork River", riverReading("good", "Good", 30)],
  ["meramec", "Meramec River", riverReading("high", "High", 1)],
].map(([slug, name, currentCondition]) => ({
  id: slug, slug, name, state: "MO", riverType: null, lengthMiles: 100,
  description: null, difficultyRating: null, region: null, accessPointCount: 0,
  path: `/rivers/missouri/${slug}`, currentCondition,
}));
overview.rivers = rivers.map(({ slug, name, path }) => ({ slug, name, path }));
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
    `import { notFound } from 'next/navigation'; import { Suspense } from 'react'; import CampingHub from '@/components/camping/CampingHub'; import type { CampingOverview } from '@/lib/camping/overview-types'; export default function Page() { if(process.env.NODE_ENV !== 'development' || process.env.CAMPING_SMOKE !== '1') notFound(); return <main className="min-h-screen bg-neutral-50"><p>Labelled QA fixtures — synthetic availability</p><Suspense><CampingHub overview={${JSON.stringify(overview)} as unknown as CampingOverview} /></Suspense></main>; }`,
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
  page.on('pageerror', (e) => errors.push(e.message));
  // Deliberate image failure must not wait for Next's full 404 page/remote media.
  await page.route(/camping-missing-photo-fixture/, route => route.fulfill({
    status: 404, contentType: 'text/plain', body: 'Labelled missing-photo fixture',
  }));
  // Exercise the client with the AbortSignal statics missing, as on older Safari.
  await page.addInitScript(() => {
    for (const name of ['any', 'timeout']) Object.defineProperty(AbortSignal, name, { value: undefined, configurable: true });
  });
  await page.route('**/api/campsites?**', (route) => {
    errors.push('The web hub must use its own detail endpoint, not the existing iOS API.');
    return route.abort();
  });
  let failRivers = false;
  let riverRequests = 0;
  let servedRivers = rivers;
  await page.route("**/api/rivers", (route) => {
    riverRequests++;
    return route.fulfill(failRivers ? { status: 503, json: { error: 'Fixture outage' } } : { json: { rivers: servedRivers } });
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
  let siteRequests = 0, photoRequests = 0, activePhotos = 0, maxPhotos = 0;
  let failSiteRefresh = false, detailFetchedAt = at;
  await page.route('**/api/camping/sites?**', async (route) => {
    siteRequests++;
    if (failSiteRefresh) return route.fulfill({ status: 503, json: { error: 'Fixture outage' } });
    await new Promise(resolve => setTimeout(resolve, 250));
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
          name: `${names[facilityIndex]} - Site ${String(i + 1).padStart(2, '0')}`,
          loop: 'A',
          siteType: 'STANDARD ELECTRIC',
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
        facilityId: p.get('facility'),
        arrival: p.get('arrival'),
        departure: p.get('departure'),
        fetchedAt: detailFetchedAt,
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
  await page.route('**/api/campsites/photos?**', async route => {
    photoRequests++; activePhotos++; maxPhotos = Math.max(maxPhotos, activePhotos);
    const site = new URL(route.request().url()).searchParams.get('site');
    await new Promise(resolve => setTimeout(resolve, 120));
    activePhotos--;
    return route.fulfill({ json: { photos: { [site]: site === 'site-2' ? [] : [
      { url: '/lakes/table-rock.jpg', title: 'Labelled photo fixture', credit: 'Fixture credit', source: 'Recreation.gov' },
      { url: '/lakes/nwk-truman-dam.jpg', title: 'Second labelled fixture', source: 'Recreation.gov' },
    ] } } });
  });
  // Even a failed condition request cannot remove the selected river or its links.
  failRivers = true;
  await page.goto(`${origin}/camping-layout-check?river=meramec`);
  const failedRiver = page.getByRole('region', { name: 'Meramec River now' });
  await failedRiver.getByText('Conditions unavailable', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'River', exact: true }).inputValue(), 'meramec');
  assert.equal(await failedRiver.getByRole('link', { name: 'Meramec River conditions' }).getAttribute('href'), '/rivers/missouri/meramec');
  assert.equal(await failedRiver.getByRole('link', { name: 'Plan a float' }).getAttribute('href'), '/plan?river=meramec');
  failRivers = false;
  // A link from a river with no campgrounds listed still names that river.
  await page.goto(`${origin}/camping-layout-check?river=meramec`);
  const riverSelect = page.getByRole("combobox", { name: "River", exact: true });
  await page.getByRole("region", { name: "Meramec River now" }).getByText("High", { exact: true }).waitFor();
  assert.equal(await riverSelect.inputValue(), "meramec");
  assert.equal(await riverSelect.locator("option:checked").textContent(), "Meramec River");
  await page.getByText("No campgrounds match this search.", { exact: false }).waitFor();
  // A slug that names no river is ignored, not shown as an invented river.
  const unknownRiverRequest = page.waitForResponse((response) => response.url().endsWith("/api/rivers"));
  await page.goto(`${origin}/camping-layout-check?river=not-a-river`);
  await page.getByRole("heading", { name: "5 campgrounds", exact: true }).waitFor();
  // The slug is checked against the live list too; let that request finish.
  await unknownRiverRequest;
  assert.equal(await riverSelect.inputValue(), "");
  assert.equal(await riverSelect.getByRole("option", { name: "Not A River" }).count(), 0);
  assert.equal(await page.getByRole("region", { name: /now$/ }).count(), 0);
  const requestsBeforeAllRivers = riverRequests;
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
  await brokenPhotoCard.locator("[data-campground-photo]").scrollIntoViewIfNeeded();
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
  // All-river cards prioritise campsite availability; conditions appear once for a selected river.
  assert.equal(riverRequests, requestsBeforeAllRivers, "conditions are not requested until a river is selected");
  const cards = page
    .getByRole("article")
    .filter({ has: page.getByRole("button", { name: "View campground" }) });
  const openCard = cards.filter({ hasText: "Fixture · Open campground" });
  assert.equal(await cards.getByText("Good", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("region", { name: /now$/ }).count(), 0);
  assert.equal(await page.getByText("Upstream to downstream", { exact: false }).count(), 0);
  // One river: its condition moves to a panel and campgrounds run downstream.
  await riverSelect.selectOption("current");
  const riverNow = page.getByRole("region", { name: "Current River now" });
  await riverNow.getByText("Good", { exact: true }).waitFor();
  await riverNow.getByText("Falling", { exact: true }).waitFor();
  assert.equal(
    await riverNow.getByRole("link", { name: "Current River conditions" }).getAttribute("href"),
    "/rivers/missouri/current",
  );
  assert.equal(
    await riverNow.getByRole("link", { name: "Plan a float" }).getAttribute("href"),
    "/plan?river=current",
  );
  assert.deepEqual(
    await cards.locator("h3").allTextContents(),
    [2, 4, 0, 3, 1].map((i) => names[i]),
    "upstream to downstream; a campground without a mile follows",
  );
  await openCard.getByText("River mile 51", { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'More campgrounds', exact: true }).waitFor();
  const sort = page.getByRole('combobox', { name: 'Sort campgrounds' });
  assert.equal(await sort.inputValue(), 'river');
  // Dates choose openings first until the person explicitly picks an order.
  const tonightShortcut = page.getByRole('button', { name: 'Tonight', exact: true });
  const weekendShortcut = page.getByRole('button', { name: 'This weekend', exact: true });
  const stayDates = () => ['arrival', 'departure'].map((key) => new URL(page.url()).searchParams.get(key)).join();
  assert.equal(await tonightShortcut.getAttribute('aria-pressed'), 'false');
  await tonightShortcut.click();
  await openCard.getByText('40 sites available', { exact: true }).waitFor();
  assert.equal(await tonightShortcut.getAttribute('aria-pressed'), 'true', 'the chosen shortcut stays highlighted');
  const tonightDates = stayDates();
  assert.equal(await sort.inputValue(), 'available');
  assert.equal((await cards.locator('h3').allTextContents())[0], names[0]);
  assert.equal(await page.getByRole('heading', { name: 'More campgrounds', exact: true }).count(), 0);
  await sort.selectOption('river');
  assert.equal(new URL(page.url()).searchParams.get('sort'), 'river');
  await weekendShortcut.click();
  assert.equal(await weekendShortcut.getAttribute('aria-pressed'), 'true', 'the chosen shortcut stays highlighted');
  // On a day when tonight is also the weekend, both describe the stay.
  if (stayDates() !== tonightDates) assert.equal(await tonightShortcut.getAttribute('aria-pressed'), 'false');
  assert.notEqual(
    await weekendShortcut.evaluate((node) => getComputedStyle(node).backgroundColor),
    await tonightShortcut.evaluate((node) => getComputedStyle(node).backgroundColor),
    'the highlight is visible, not only announced',
  );
  assert.equal(await sort.inputValue(), 'river', 'date changes retain an explicit sort');
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await page.getByRole('table').getByText('River mile 51', { exact: true }).waitFor();
  await page.getByRole('cell', { name: 'More campgrounds', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Cards', exact: true }).click();
  await page.getByRole('button', { name: 'Clear dates', exact: true }).click();
  assert.equal(await weekendShortcut.getAttribute('aria-pressed'), 'false');
  assert.equal(await sort.inputValue(), 'river');
  // Chevrons are drawn at the text's inset, not the browser's flush arrow.
  for (const select of [riverSelect, sort]) {
    const style = await select.evaluate((node) => {
      const computed = getComputedStyle(node);
      return { appearance: computed.appearance, image: computed.backgroundImage, room: parseFloat(computed.paddingRight) };
    });
    assert.equal(style.appearance, 'none');
    assert.match(style.image, /^url\(/);
    assert.ok(style.room >= 30, 'the label cannot run under the chevron');
  }
  // A mouse or touch pick releases the select, so no focus ring lingers on it.
  await sort.dispatchEvent('pointerdown');
  await sort.selectOption('available');
  assert.equal(await sort.evaluate((node) => node === document.activeElement), false);
  // A keyboard pick keeps focus, shown as the site's field focus, not a coral ring.
  await sort.focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await sort.inputValue(), 'river');
  assert.equal(await sort.evaluate((node) => node === document.activeElement), true);
  const fieldFocus = await sort.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { outline: computed.outlineStyle, ring: computed.boxShadow };
  });
  assert.equal(fieldFocus.outline, 'none');
  assert.notEqual(fieldFocus.ring, 'none');
  assert.equal(await openCard.getByText("Good", { exact: true }).count(), 0, "the panel replaces per-card conditions");
  await page.getByText("Upstream to downstream", { exact: false }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("river"), "current");
  await page.screenshot({
    path: `${out}/desktop-river-fixture.png`,
    fullPage: true,
  });
  await riverSelect.selectOption("jacks-fork");
  await page
    .getByRole("region", { name: "Jacks Fork River now" })
    .getByText("Conditions unavailable", { exact: true })
    .waitFor();
  assert.deepEqual(await cards.locator("h3").allTextContents(), [names[1]]);
  assert.equal(await page.getByText("Upstream to downstream", { exact: false }).count(), 0);
  assert.equal(await sort.count(), 0, "a river with no measured campgrounds offers no river order");
  await riverSelect.selectOption("");
  assert.equal(await page.getByRole("region", { name: /now$/ }).count(), 0);
  assert.equal(new URL(page.url()).searchParams.has("river"), false);
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
  await page.getByRole('button', { name: 'View campground' }).first().click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.getByText('Site 01', { exact: true }).waitFor();
  await page.getByText('First come', { exact: true }).waitFor();
  assert.equal(await page.getByText('Fixture · Seasonal closure site', { exact: true }).count(), 0);
  await page.getByLabel('Show unavailable sites', { exact: true }).check();
  await page.getByText('Closed', { exact: true }).waitFor();
  await page.getByText('First-come site when open', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Park’s camping rules ↗', exact: true }).count(), 2);
  assert.match(page.url(), /campground=/);
  const photos = page.getByRole('button', { name: 'View photos of Site 01', exact: true });
  await photos.waitFor();
  assert.ok(photoRequests > 0 && photoRequests < 15, 'only nearby rows request photos automatically');
  assert.ok(maxPhotos <= 3, 'optional media has at most three concurrent requests');
  await page.getByRole('dialog').getByText('No site photo', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('button', { name: 'Site photos', exact: true }).count(), 0);
  assert.equal(await page.getByRole('dialog').getByRole('img', { name: names[0], exact: true }).count(), 1);
  assert.match(await page.getByRole('link', { name: 'River map', exact: true }).getAttribute('href'), /access=fixture-access/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Link copied', exact: true }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /campground=/);
  await photos.click();
  await page.getByRole('region', { name: 'Photos of Site 01' }).waitFor();
  await page.getByRole('button', { name: 'Close photos', exact: true }).click();
  assert.equal(await photos.evaluate(node => node === document.activeElement), true);
  await page.getByRole('dialog').evaluate(node => node.scrollTop = 0);
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
  const beforeReopen = siteRequests;
  await page.getByRole('button', { name: 'View campground' }).first().click();
  await page.getByText('Site 01', { exact: true }).waitFor();
  assert.equal(siteRequests, beforeReopen, 'recent details are reused on reopen');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const availableOnly = page.getByLabel('Available for my stay');
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
  await brokenPhotoCard.locator("[data-campground-photo]").scrollIntoViewIfNeeded();
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
  await riverSelect.selectOption("current");
  await page.getByRole("region", { name: "Current River now" }).getByText("Good", { exact: true }).waitFor();
  await page.screenshot({
    path: `${out}/mobile-river-fixture.png`,
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "the river panel fits a phone",
  );
  await riverSelect.selectOption("");
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
  await riverSelect.selectOption('current');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'river summary and sort fit 320px');
  await page.screenshot({ path: `${out}/small-mobile-river-fixture.png`, fullPage: true });
  await riverSelect.selectOption('');
  await page.screenshot({
    path: `${out}/small-mobile-cards-fixture.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "View campground" }).first().click();
  await page.getByText("Site 01", { exact: true }).waitFor();
  await page.screenshot({
    path: `${out}/mobile-detail-fixture.png`,
    fullPage: true,
  });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const dialog = page.getByRole('dialog');
    assert.ok(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), 'dialog fits narrow screens');
    await page.screenshot({ path: `${out}/detail-${width}-fixture.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: `${out}/detail-dark-fixture.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  const dialog = page.getByRole('dialog');
  const refreshAt = Date.now() + 61_000;
  failSiteRefresh = true;
  await page.clock.setFixedTime(new Date(refreshAt));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await dialog.getByRole('status').filter({ hasText: 'Couldn’t refresh.' }).waitFor();
  assert.equal(await dialog.getByText('Site 01', { exact: true }).isVisible(), true, 'failed refresh retains the loaded list');
  assert.equal(await dialog.locator('[data-state="available"]').count(), 40, 'still-fresh availability remains usable');
  assert.equal(await dialog.getByRole('alert').count(), 0);
  failSiteRefresh = false;
  detailFetchedAt = new Date(refreshAt - overview.maxObservationAgeSeconds * 1000 + 30_000).toISOString();
  const retryResponse = page.waitForResponse(response => response.url().includes('/api/camping/sites?') && response.status() === 200);
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await retryResponse;
  await dialog.getByRole('status').filter({ hasText: 'Couldn’t refresh.' }).waitFor({ state: 'hidden' });
  await dialog.getByText(`Checked ${Math.floor(overview.maxObservationAgeSeconds / 3600) - 1}h ago`, { exact: true }).waitFor();
  // Retry recovers a nearly-expired observation; the next failed refresh must
  // still drop its green pills when the original observation ages out.
  failSiteRefresh = true;
  await page.clock.setFixedTime(new Date(refreshAt + 61_000));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await dialog.getByRole('status').filter({ hasText: 'Couldn’t refresh.' }).waitFor();
  assert.equal(await dialog.locator('[data-state="available"]').count(), 0, 'retained data cannot extend observation freshness');
  assert.equal(await dialog.getByText('Site 01', { exact: true }).count(), 0);
  failSiteRefresh = false;
  detailFetchedAt = at;
  await dialog.getByRole('button', { name: 'Retry', exact: true }).click();
  await dialog.getByText('Site 01', { exact: true }).waitFor();
  await page.screenshot({ path: `${out}/detail-refresh-recovery-fixture.png`, fullPage: true });
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
  await page.clock.install({ time: new Date(at) });
  servedRivers = rivers.map(r => r.slug === 'current' ? {
    ...r, currentCondition: { ...r.currentCondition, readingTimestamp: new Date(Date.parse(at) - 5.9 * 3_600_000).toISOString() },
  } : r);
  await page.goto(`${origin}/camping-layout-check?river=current`);
  const agingRiver = page.getByRole('region', { name: 'Current River now' });
  await agingRiver.getByText('Good', { exact: true }).waitFor();
  const beforePolling = riverRequests;
  const pollingResponse = page.waitForResponse(response => response.url().endsWith('/api/rivers'));
  await page.clock.fastForward(5 * 60_000);
  await page.waitForFunction(() => document.querySelector('[aria-label="Current River now"]')?.textContent?.includes('Good'));
  // Allow the scheduled request to finish before simulating an outage.
  await pollingResponse;
  assert.ok(riverRequests > beforePolling, 'current conditions refresh periodically');
  failRivers = true;
  const failedRefresh = page.waitForResponse(response => response.url().endsWith('/api/rivers') && response.status() === 503);
  await page.clock.fastForward(5 * 60_000);
  await failedRefresh;
  await agingRiver.getByText('Conditions unavailable', { exact: true }).waitFor();
  assert.equal(await agingRiver.getByText('Good', { exact: true }).count(), 0, 'cached readings expire on the open page');
  assert.equal(await agingRiver.getByRole('link', { name: 'Plan a float' }).count(), 1);
  assert.deepEqual(errors, []);
  console.log(
    'Camping browser smoke passed: river panel/order/handoff, desktop calendar/list, unknown state, immediate filters, rapid typing/caret, URL/Back/Forward/clear, modal/Escape/focus, mobile overflow, 14-night cap, missing AbortSignal statics, refresh failure/recovery and expiry.',
  );
} catch (error) {
  // First, so a failing diagnostic below cannot replace the real failure.
  console.error("Camping smoke failure", error);
  const failedPage = browser?.contexts()[0]?.pages()[0];
  if (failedPage) {
    console.error("Page errors", errors);
    console.error("Image state before screenshot", await failedPage.locator("[data-campground-photo] img").evaluateAll(images => images.map(image => ({
      alt: image.alt, src: image.currentSrc, complete: image.complete,
      naturalWidth: image.naturalWidth, rect: image.getBoundingClientRect().toJSON(),
      scrollY, viewportHeight: innerHeight,
    }))));
    await failedPage
      .screenshot({ path: `${out}/failure-fixture.png`, fullPage: true })
      .catch(() => {});
    console.error(
      await failedPage
        .locator("[data-campground-photo]")
        .evaluateAll((photos) =>
          photos.map((photo) => ({
            text: photo.textContent,
            image: photo.querySelector("img[alt]")
              ? {
                  complete: photo.querySelector("img[alt]").complete,
                  width: photo.querySelector("img[alt]").naturalWidth,
                  src: photo.querySelector("img[alt]").currentSrc,
                }
              : null,
          })),
        )
        .catch(() => []),
    );
  }
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
