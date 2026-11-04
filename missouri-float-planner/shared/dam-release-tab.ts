// missouri-float-planner/shared/dam-release-tab.ts
// Whether the gauge a river page or screen is showing is a dam's own release,
// unrated — the case where the dam, not Eddy's float ladder, is the answer.
//
// ── What changes on such a tab ─────────────────────────────────────────────
// The live report card leads with the dam (release now, today's and the next
// day's posted generation) instead of an "Unknown" verdict and "Not rated by
// Eddy", and Eddy's Read is the dam's Read instead of the river Read, which on
// an unrated release can only say that no assessment is available. Weather
// stays; the river Bottom line goes, because it could only say there is not
// enough data.
//
// ── Why the tab and not the river ──────────────────────────────────────────
// The dam Read states every time AT THE DAM (ADR 0017); how long a release
// takes to reach an access downstream is not modelled. The White runs 90 miles
// and has USGS tabs at Norfork and Calico Rock, and the Norfork joins at mile
// 43 with its own dam. So a downstream USGS tab keeps its own reading card and
// river Read, and the White's Norfork release tab gets Norfork Dam's Read, not
// Bull Shoals'.
//
// ── Why unrated only ───────────────────────────────────────────────────────
// A release gauge WITH a ladder (Clearwater's, on the Black) has a working
// float verdict and a river Read written against it. Nothing here touches it.
//
// ── The id ─────────────────────────────────────────────────────────────────
// A USACE release gauge's site id IS the dam id (usace-registry.ts: "Also
// gauge_stations.site_id_external and the URL segment", and
// USACE_RELEASE_SITE_IDS is built from the dam ids), so the tab names its dam.
//
// Pure TypeScript, sibling imports only, like everything in shared/.

export interface DamReleaseTabInput {
  /** The shown gauge's provider-native site id. */
  siteId: string | null | undefined;
  /** The shown gauge's provider; a missing provider is USGS on the legacy contract. */
  provider: string | null | undefined;
  /** True when the shown gauge has a condition ladder for this river. */
  rated: boolean;
  /**
   * The snapshot available for this tab. Native selects it from the dam
   * catalog; a page holding only its controlling dam may supply that id.
   * Only a matching snapshot can lead the card.
   */
  heldDamId: string | null | undefined;
}

export interface DamReleaseTab {
  /** The dam this release belongs to: whose Read replaces the river Read. */
  damId: string;
  /** The held snapshot is this dam's, so the card can lead with it. */
  leadsCard: boolean;
}

/** Null for every tab that is not an unrated dam release. */
export function damReleaseTab(input: DamReleaseTabInput): DamReleaseTab | null {
  if (input.provider !== 'usace' || !input.siteId || input.rated) return null;
  return { damId: input.siteId, leadsCard: input.siteId === input.heldDamId };
}
