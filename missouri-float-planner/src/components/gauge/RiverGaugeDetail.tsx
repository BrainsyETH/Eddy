'use client';

// src/components/gauge/RiverGaugeDetail.tsx
// Embeddable live report for a river — section/gauge selection, trend chart,
// current reading, Eddy Says, and threshold table. Rendered inside the
// canonical river hub at /rivers/[slug].

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ExternalLink } from 'lucide-react';

import { applyFloodStageOverride, computeCondition, getConditionShortLabel, getConditionTailwindColor, type ConditionThresholds } from '@/lib/conditions';
import { hasLadder } from '@shared/condition-ladder';
import { damReleaseTab } from '@shared/dam-release-tab';
import { stationTier } from '@shared/station-tier';
import { CFS_EXPLAINER } from '@/constants';
import InfoTip from '@/components/ui/InfoTip';
import Card from '@/components/ui/Card';
import Skeleton from '@/components/ui/Skeleton';
import type { ConditionCode } from '@/types/api';
import { useRiverGroup } from '@/hooks/useRiverGroups';
import { useGaugeDetail } from '@/hooks/useGaugeDetail';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import { useRiverOutlook } from '@/hooks/useRiverOutlook';
import { useSelectedEddyReport } from '@/hooks/useSelectedEddyReport';
import GaugeSummary from '@/components/gauge/GaugeSummary';
import GaugeHistoryChart from '@/components/gauge/GaugeHistoryChart';
import { resolveHistoryCapabilities } from '@shared/history-capabilities';
import HistoricalWaterQuality from './HistoricalWaterQuality';
import CurrentReadingCard from '@/components/gauge/CurrentReadingCard';
import WillItHold from '@/components/gauge/WillItHold';
import EddyOutlookFooter from '@/components/gauge/EddyOutlookFooter';
import ThresholdTable from '@/components/gauge/ThresholdTable';
import GaugeTabBar from '@/components/gauge/GaugeTabBar';
import RiverVisualGallery from '@/components/river/RiverVisualGallery';
import { usePathname } from 'next/navigation';
import { buildEddyTakeSections } from '@/lib/river-outlook';
import { buildZones } from '@/lib/gauge/threshold-zones';
import { ageHoursOf } from '@/lib/utils/reading-age';
import { shortenGaugeName } from '@/lib/gauge/format-name';
import {
  rangeLabelForDays,
  trackGaugeContextChanged,
  trackGaugeExpandedOpened,
  trackGaugeRangeChanged,
  trackGaugeSourceOpened,
} from '@/lib/gauge/analytics';
import { createPortal } from 'react-dom';
import RiverSectionSelector from '@/components/river/RiverSectionSelector';
import { sectionFromUrl, sectionGauge, riverSectionLabel, type RiverReportSection } from '@/lib/river-report-sections';

const NO_SECTIONS: RiverReportSection[] = [];

interface RiverGaugeDetailProps {
  riverSlug: string;
  /**
   * The river's dam panel (RiverDamPanel), server-rendered by the page in its
   * two positions; this component picks one per tab. Both absent on every
   * river without a dam.
   *
   * ── Why slots and not a prop of data ──────────────────────────────────────
   * The panel is a SERVER component fed by the dam snapshot the page already
   * fetched. This file is 'use client', so taking the snapshot as data would
   * mean importing @/lib/data/dams into the browser bundle for one river in
   * every twenty. Pre-rendered nodes cost nothing and keep the fetch on the
   * server where it already was.
   *
   * ── Inside the reading card ───────────────────────────────────────────────
   * It used to be a "Dam release" section after this whole report, plus a
   * status row under the reading. On a tailwater the schedule is what decides
   * the day, so it is part of the card now: `damLead` opens it on the dam's
   * own unrated release tab, `damFooter` closes it everywhere else.
   */
  damLead?: React.ReactNode;
  damFooter?: React.ReactNode;
  /** The dam those slots describe — the river's controlling dam. */
  heldDamId?: string | null;
  /** The whole river runs at a dam's release (a dam_tailwater river). */
  damControlled?: boolean;
  /** Curated hydrological sections; ordinary gauge tabs remain on other rivers. */
  sections?: RiverReportSection[];
  /** Raw registry slug: an unresolved section must never apply to the whole river. */
  damSectionSlug?: string | null;
}

export default function RiverGaugeDetail({
  riverSlug,
  damLead,
  damFooter,
  heldDamId = null,
  damControlled = false,
  sections = NO_SECTIONS,
  damSectionSlug = null,
}: RiverGaugeDetailProps) {
  const { riverGroup, isLoading } = useRiverGroup(riverSlug);
  const prefetchHistory = useGaugeHistoryPrefetch();
  const [selectedSiteId, setActiveSiteId] = useState<string | null>(null);
  const [lastYearFor, setLastYearFor] = useState<string | null>(null);
  const [displayUnit, setDisplayUnit] = useState<'ft' | 'cfs' | null>(null);
  const [gaugeNavTarget, setGaugeNavTarget] = useState<HTMLElement | null>(null);
  const [sectionSlug, setSectionSlug] = useState<string | null>(null);
  const [sectionReady, setSectionReady] = useState(false);
  const hasSections = sections.length > 1;
  const selectedSection = hasSections
    ? sections.find((section) => section.sectionSlug === sectionSlug) ?? sections[0]
    : null;

  useEffect(() => {
    if (!hasSections) return;
    const readSelection = () => {
      setSectionSlug(sectionFromUrl(sections, new URL(window.location.href)));
      setSectionReady(true);
    };
    readSelection();
    window.addEventListener('popstate', readSelection);
    window.addEventListener('hashchange', readSelection);
    return () => {
      window.removeEventListener('popstate', readSelection);
      window.removeEventListener('hashchange', readSelection);
    };
  }, [hasSections, sections]);

  const selectSection = (slug: string) => {
    setSectionSlug(slug);
    setLastYearFor(null);
    const url = new URL(window.location.href);
    url.searchParams.set('section', slug);
    // A previous reach anchor must not override this new query selection.
    if (url.hash.startsWith('#reach-')) url.hash = 'status';
    window.history.pushState(null, '', url);
  };

  const activeGauge = useMemo(() => {
    if (!riverGroup) return null;
    if (hasSections) return sectionReady ? sectionGauge(selectedSection, riverGroup.allGauges) : null;
    return riverGroup.allGauges.find((gauge) => gauge.usgsSiteId === selectedSiteId) ?? riverGroup.primaryGauge;
  }, [riverGroup, hasSections, sectionReady, selectedSection, selectedSiteId]);
  const activeSiteId = activeGauge?.usgsSiteId ?? null;
  const showDamContext = !damSectionSlug || selectedSection?.sectionSlug === damSectionSlug
    || activeSiteId === heldDamId;
  const selectedDamControlled = damControlled || selectedSection?.riverType === 'dam_tailwater';
  const sectionSelector = hasSections ? (
    <RiverSectionSelector sections={sections} selectedSlug={selectedSection?.sectionSlug ?? null} onChange={selectSection} />
  ) : null;

  useEffect(() => {
    setGaugeNavTarget(document.getElementById('gauge-selection-slot'));
  }, []);

  // Dedicated, shareable Add-a-Photo page for this river. The hub is always at
  // the canonical /rivers/[state]/[slug], so append the segment to the path.
  const pathname = usePathname();
  const addPhotoHref = `${pathname}/add-photo`;

  // Prefetch history for all gauges in this river
  useEffect(() => {
    if (!riverGroup) return;
    const timeout = setTimeout(() => {
      const siteIds = riverGroup.allGauges.map(g => g.usgsSiteId);
      prefetchHistory(siteIds, 14);
    }, 500);
    return () => clearTimeout(timeout);
  }, [riverGroup, prefetchHistory]);

  const isOnPrimaryTab = riverGroup ? activeSiteId === riverGroup.primaryGauge.usgsSiteId : true;

  const selectedEddyReport = useSelectedEddyReport({
    riverSlug,
    siteId: activeSiteId,
    isPrimary: isOnPrimaryTab,
    enabled: Boolean(activeSiteId),
  });

  // Active gauge derived state
  // Station-level facts the river-group payload does not carry — today that
  // means the NWS flood stages the chart draws.
  const { data: gaugeDetail } = useGaugeDetail(activeSiteId ?? null);

  // Get the threshold for this river from the active gauge
  const activeThreshold = useMemo(() => {
    if (!activeGauge || !riverGroup) return null;
    return activeGauge.thresholds?.find(t => t.riverId === riverGroup.riverId) ||
      activeGauge.thresholds?.find(t => t.isPrimary) ||
      activeGauge.thresholds?.[0] || null;
  }, [activeGauge, riverGroup]);

  // Primary unit from threshold data
  const primaryUnit = activeThreshold?.thresholdUnit || 'ft';

  // Initialize displayUnit from threshold when it loads, with localStorage persistence
  useEffect(() => {
    if (!activeThreshold) return;
    const stored = localStorage.getItem(`gauge-unit-${riverSlug}`);
    if (stored === 'ft' || stored === 'cfs') {
      setDisplayUnit(stored);
    } else {
      setDisplayUnit(activeThreshold.thresholdUnit);
    }
  }, [activeThreshold, riverSlug]);

  // Three states, not two: 'unknown' while neither payload has answered means
  // the summary renders a shape, not a sentence (shared/station-tier.ts).
  const tier = stationTier({
    thresholds: activeGauge?.thresholds,
    curated: gaugeDetail ? gaugeDetail.curated : null,
  });

  // Persist unit toggle
  const handleUnitToggle = useCallback((unit: 'ft' | 'cfs') => {
    setDisplayUnit(unit);
    if (unit !== 'cfs') setLastYearFor(null);
    localStorage.setItem(`gauge-unit-${riverSlug}`, unit);
    trackGaugeContextChanged({ provider: gaugeDetail?.provider ?? 'usgs', tier }, unit);
  }, [riverSlug, gaugeDetail?.provider, tier]);

  // Determine if we're showing alt thresholds
  const effectiveUnit = displayUnit || primaryUnit;
  const showingAlt = effectiveUnit !== primaryUnit;

  // Compute chart thresholds based on selected unit. `unit` declares which one
  // the levels are in, so the chart can refuse a mismatch instead of trusting
  // this file forever got the swap right.
  const chartThresholds = useMemo(() => {
    if (!activeThreshold) return null;
    if (showingAlt) {
      return {
        levelTooLow: activeThreshold.altLevelTooLow,
        levelLow: activeThreshold.altLevelLow,
        levelOptimalMin: activeThreshold.altLevelOptimalMin,
        levelOptimalMax: activeThreshold.altLevelOptimalMax,
        levelHigh: activeThreshold.altLevelHigh,
        levelDangerous: activeThreshold.altLevelDangerous,
        unit: effectiveUnit,
      };
    }
    return {
      levelTooLow: activeThreshold.levelTooLow,
      levelLow: activeThreshold.levelLow,
      levelOptimalMin: activeThreshold.levelOptimalMin,
      levelOptimalMax: activeThreshold.levelOptimalMax,
      levelHigh: activeThreshold.levelHigh,
      levelDangerous: activeThreshold.levelDangerous,
      unit: effectiveUnit,
    };
  }, [activeThreshold, showingAlt, effectiveUnit]);

  // Alt thresholds for ThresholdTable
  const altThresholds = useMemo(() => {
    if (!activeThreshold) return null;
    const hasAny = activeThreshold.altLevelTooLow !== null ||
      activeThreshold.altLevelLow !== null ||
      activeThreshold.altLevelOptimalMin !== null ||
      activeThreshold.altLevelOptimalMax !== null ||
      activeThreshold.altLevelHigh !== null ||
      activeThreshold.altLevelDangerous !== null;
    if (!hasAny) return null;
    return {
      levelTooLow: activeThreshold.altLevelTooLow,
      levelLow: activeThreshold.altLevelLow,
      levelOptimalMin: activeThreshold.altLevelOptimalMin,
      levelOptimalMax: activeThreshold.altLevelOptimalMax,
      levelHigh: activeThreshold.altLevelHigh,
      levelDangerous: activeThreshold.altLevelDangerous,
    };
  }, [activeThreshold]);

  const altUnit = primaryUnit === 'ft' ? 'cfs' as const : 'ft' as const;

  // Ladder for the reading card's band track. Always the primary unit — the
  // track sits beside the reading the condition was computed from, and the
  // ft/cfs toggle below only reframes the reference list.
  const ladderZones = useMemo(() => {
    if (!activeThreshold) return undefined;
    return buildZones({
      levelTooLow: activeThreshold.levelTooLow,
      levelLow: activeThreshold.levelLow,
      levelOptimalMin: activeThreshold.levelOptimalMin,
      levelOptimalMax: activeThreshold.levelOptimalMax,
      levelHigh: activeThreshold.levelHigh,
      levelDangerous: activeThreshold.levelDangerous,
    }, activeGauge?.thresholdDescriptions);
  }, [activeThreshold, activeGauge?.thresholdDescriptions]);

  // NWS forecasts are stage-only. Use the stored foot ladder regardless of
  // which unit the user currently has selected, and never compare feet to CFS.
  const stageThresholds = useMemo<ConditionThresholds | null>(() => {
    if (!activeThreshold) return null;
    const values = primaryUnit === 'ft'
      ? {
          levelTooLow: activeThreshold.levelTooLow,
          levelLow: activeThreshold.levelLow,
          levelOptimalMin: activeThreshold.levelOptimalMin,
          levelOptimalMax: activeThreshold.levelOptimalMax,
          levelHigh: activeThreshold.levelHigh,
          levelDangerous: activeThreshold.levelDangerous,
        }
      : altThresholds;
    return values ? { ...values, thresholdUnit: 'ft' } : null;
  }, [activeThreshold, altThresholds, primaryUnit]);

  const outlook = useRiverOutlook({
    siteId: activeGauge?.usgsSiteId ?? null,
    lat: activeGauge?.coordinates.lat ?? null,
    lon: activeGauge?.coordinates.lng ?? null,
    trendUnit: activeThreshold?.thresholdUnit || 'ft',
    stageThresholds,
  });

  const latestValue = effectiveUnit === 'cfs' ? activeGauge?.dischargeCfs : activeGauge?.gaugeHeightFt;

  // Compute condition for active gauge
  const condition = useMemo(() => {
    if (!activeGauge || !activeThreshold) {
      return { code: 'unknown' as ConditionCode, label: 'Unknown', tailwindColor: 'bg-neutral-400' };
    }
    const thresholds: ConditionThresholds = {
      levelTooLow: activeThreshold.levelTooLow,
      levelLow: activeThreshold.levelLow,
      levelOptimalMin: activeThreshold.levelOptimalMin,
      levelOptimalMax: activeThreshold.levelOptimalMax,
      levelHigh: activeThreshold.levelHigh,
      levelDangerous: activeThreshold.levelDangerous,
      thresholdUnit: activeThreshold.thresholdUnit,
    };
    // An uncalibrated ladder is 'unknown', not a verdict. Without this guard an
    // all-null threshold row falls through classifyReading to 'too_low' and
    // paints a perfectly healthy river brown — a gauge with no thresholds yet
    // must show its reading and stay silent about floatability.
    if (!hasLadder(thresholds)) {
      return { code: 'unknown' as ConditionCode, label: 'Unknown', tailwindColor: 'bg-neutral-400' };
    }
    const result = computeCondition(activeGauge.gaugeHeightFt, thresholds, activeGauge.dischargeCfs);
    // Same flood-stage escalation the gauge-report API applies. Without it the
    // server could withhold prose for a "dangerous" reading that this page was
    // still labeling "High".
    const code = applyFloodStageOverride(
      result.code,
      activeGauge.gaugeHeightFt,
      activeThreshold.floodStageFt,
    );
    return {
      code,
      label: getConditionShortLabel(code),
      tailwindColor: getConditionTailwindColor(code),
    };
  }, [activeGauge, activeThreshold]);

  // A dam's own release with no ladder: the dam leads the card and its Read
  // replaces the river Read. Per TAB, not per river — a downstream USGS gauge
  // keeps its own reading and Read. See shared/dam-release-tab.ts.
  const ratedHere = useMemo(() => Boolean(activeThreshold && hasLadder({
    levelTooLow: activeThreshold.levelTooLow,
    levelLow: activeThreshold.levelLow,
    levelOptimalMin: activeThreshold.levelOptimalMin,
    levelOptimalMax: activeThreshold.levelOptimalMax,
    levelHigh: activeThreshold.levelHigh,
    levelDangerous: activeThreshold.levelDangerous,
    thresholdUnit: activeThreshold.thresholdUnit,
  })), [activeThreshold]);
  const damTab = damReleaseTab({
    siteId: activeGauge?.usgsSiteId,
    provider: activeGauge?.provider ?? gaugeDetail?.provider,
    rated: ratedHere,
    heldDamId,
  });
  const damLeads = Boolean(damTab?.leadsCard && damLead);

  // Where this gauge's number actually comes from. USGS and NWS both publish a
  // monitoring page keyed on the site id; USACE dam releases have no public
  // per-dam page we've verified, so they get no link rather than a guessed one.
  const sourceLink = useMemo(() => {
    const siteId = activeGauge?.usgsSiteId;
    if (!siteId) return null;
    switch (activeGauge?.provider ?? 'usgs') {
      case 'usgs':
        return {
          href: `https://waterdata.usgs.gov/monitoring-location/${siteId}/`,
          label: 'USGS source',
        };
      case 'nws':
        return { href: `https://water.noaa.gov/gauges/${siteId}`, label: 'NWS source' };
      default:
        return null;
    }
  }, [activeGauge]);

  const activeEddyUpdate = selectedEddyReport.data;

  // Public web callers receive only the selected report's summary. The iOS app
  // separately requests the long report after entitlement verification.
  const eddyTakeSections = useMemo(
    () => buildEddyTakeSections({
      outlook,
      currentCondition: condition.code,
      generatedEddyRead: activeEddyUpdate?.summaryText,
      damControlled: selectedDamControlled,
    }),
    [condition.code, outlook, activeEddyUpdate?.summaryText, selectedDamControlled],
  );

  const eddySourceGaugeName = activeGauge?.name ?? null;

  // Tab data for GaugeTabBar
  const tabs = useMemo(() => {
    if (!riverGroup) return [];
    const primarySiteId = riverGroup.primaryGauge.usgsSiteId;
    return riverGroup.allGauges
      .map(g => ({
        siteId: g.usgsSiteId,
        name: g.name,
        isPrimaryForRiver: g.usgsSiteId === primarySiteId,
      }))
      .sort((a, b) => {
        if (a.isPrimaryForRiver) return -1;
        if (b.isPrimaryForRiver) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [riverGroup]);

  // Show unit toggle when the gauge reports both ft and cfs data
  // (alt thresholds are a bonus — threshold lines just won't draw in the alt unit if missing)
  const canToggleUnit = activeGauge?.gaugeHeightFt != null && activeGauge?.dischargeCfs != null;

  // ── Why the dam panel renders in EVERY branch ─────────────────────────────
  //
  // It rendered only in the main return, and that made the tailwater row
  // invisible on all three rivers it was written for.
  //
  // This component's data is a client useQuery on /api/gauges, and /api/gauges
  // filters on active = true. The White, Lake Taneycomo and the Norfork
  // tailwater are all active = false, so riverGroup is null for every one of
  // them and the second branch below is what they render — permanently, not
  // just while loading. Measured against production: 0 threshold rows for those
  // three, against 3 for the Black and 5 for the Current.
  //
  // The slot has nothing to do with any of that. It is a SERVER-rendered node
  // built from a dam snapshot the page already resolved in its own Promise.all,
  // so gating it behind a gauge query suppresses data that was in hand because a
  // DIFFERENT request failed. On an unrated tailwater with no gauge in the
  // reach, the dam is the only live thing on the page — the "no gauge data"
  // branch is where this row matters MOST, not least.
  //
  // It also belongs in the loading branch, because isLoading is true for the
  // whole SSR pass (there is no HydrationBoundary anywhere in this app). Absent
  // there, the row never reaches the server HTML at all, which is the opposite
  // of what the page comment above fetchRiverDam promises.

  // One comparison setting for every chart presentation, held per station so a
  // gauge switch starts with the layer off.
  const lastYearSite = activeGauge?.usgsSiteId ?? null;
  const lastYearCapabilities = resolveHistoryCapabilities(gaugeDetail?.provider ?? activeGauge?.provider, gaugeDetail?.historyCapabilities);
  const lastYearOn = lastYearFor !== null && lastYearFor === lastYearSite;
  const setLastYearOn = (on: boolean) => setLastYearFor(on ? lastYearSite : null);

  // Loading state
  if (isLoading || (hasSections && !sectionReady)) {
    return (
      <section aria-busy="true">
        {sectionSelector}
        <div id="river-section-report" className="space-y-6">
        {/* The animation is on each Skeleton, not the section. It was on the
            section, which animates OPACITY, and `animate-none` on a child
            cannot opt out of an inherited opacity animation — so the tailwater
            row below, real data already on the page, faded in and out with the
            placeholders until the gauge query settled. */}
        {/* Shaped like what replaces it — reading card, dam row, chart — so
            the page does not jump when the gauge query settles. */}
        <Skeleton className="h-4 w-40" />
        <Skeleton rounded="xl" className="h-44" />
        {showDamContext && damLead ? <div className="card-framed bg-white pb-4">{damLead}</div> : null}
        <Skeleton rounded="xl" className="h-72" />
        </div>
      </section>
    );
  }

  if (!riverGroup || !activeGauge) {
    return (
      <section>
        {sectionSelector}
        <div id="river-section-report" className="space-y-6">
        <Card variant="panel" className="p-6 text-center">
          <p className="text-sm text-neutral-600">
            {selectedSection ? `Live gauge data isn’t available for ${riverSectionLabel(selectedSection).title} right now.` : 'Live gauge data isn’t available for this river right now.'}
          </p>
        </Card>
        {showDamContext && damLead ? <div className="card-framed bg-white pb-4">{damLead}</div> : null}
        </div>
      </section>
    );
  }

  return (
    <div>
        {sectionSelector}
        {/* The gauge picker lives in the sticky section bar so it remains close
            to Live report without consuming another row in the report. */}
        {!hasSections && tabs.length > 1 && gaugeNavTarget && createPortal(
            <GaugeTabBar
              gauges={tabs}
              activeSiteId={activeSiteId || ''}
              onTabChange={setActiveSiteId}
            />,
            gaugeNavTarget,
        )}

        {/* Selected-gauge meta — identity only. Freshness is stated on the
            reading card itself, where the number it qualifies actually is;
            Share sits in the hero, Add Photo in the photo gallery. */}
        {!hasSections && <div className="mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
          {tabs.length <= 1 && <span className="font-medium text-neutral-600">{activeGauge.name}</span>}
          {/* Provider-driven: a USACE dam slug is not a USGS monitoring
              location, and linking one there is a dead end. Providers with no
              public page (usace) render no link rather than a broken one. */}
          {sourceLink && (
            <a
              href={sourceLink.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackGaugeSourceOpened({ provider: gaugeDetail?.provider ?? 'usgs', tier })}
              className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1"
            >
              {sourceLink.label}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>}

        {/* A section owns one reading and its chart. Dam context follows that
            chart only for the section the dam controls. Other rivers keep
            their existing gauge picker and dam presentation. */}
        <div id="river-section-report" className="space-y-6">
        <div className={hasSections ? 'card-panel min-w-0 overflow-hidden' : undefined}>
          {/* On the dam's own unrated release the dam IS the card: its
              readings, schedule and schedule check, and nothing after. The
              gauge card's water quality, Lately/Safety/Forecast rows and
              "Updated" line restated the dam block's temperature and age in a
              second voice, and doubled the card's height. */}
          {damLeads ? (
            <div className="card-framed bg-white" role="group" aria-labelledby="river-dam-heading">
              {damLead}
            </div>
          ) : (
            <CurrentReadingCard
              key={`reading-${activeSiteId}`}
              siteId={activeGauge.usgsSiteId}
              gaugeHeightFt={activeGauge.gaugeHeightFt}
              dischargeCfs={activeGauge.dischargeCfs}
              thresholdUnit={activeThreshold?.thresholdUnit || 'ft'}
              conditionCode={condition.code}
              waterTempF={gaugeDetail?.waterTemperature?.valueF ?? null}
              waterTempAgeHours={ageHoursOf(gaugeDetail?.waterTemperature?.observedAt)}
              dissolvedOxygenMgL={gaugeDetail?.dissolvedOxygen?.valueMgL ?? null}
              dissolvedOxygenAgeHours={ageHoursOf(gaugeDetail?.dissolvedOxygen?.observedAt)}
              waterQualitySourceName={
                gaugeDetail?.dissolvedOxygen?.measuredAtName ??
                gaugeDetail?.waterTemperature?.measuredAtName ??
                null
              }
              readingAgeHours={activeGauge.readingAgeHours}
              zones={ladderZones}
              embedded={hasSections}
              sectionHeading={hasSections ? `${shortenGaugeName(activeGauge.name)} gauge` : undefined}
              source={hasSections && sourceLink ? (
                <a href={sourceLink.href} target="_blank" rel="noopener noreferrer"
                  onClick={() => trackGaugeSourceOpened({ provider: gaugeDetail?.provider ?? 'usgs', tier })}
                  className="inline-flex min-h-6 items-center gap-1 text-xs text-primary-700 hover:underline">
                  {sourceLink.label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              ) : null}
              footer={!hasSections && showDamContext ? damFooter : null}
            >
              {/* Safety and forecast only — the card above already shows the
                  level, trend and verdict. */}
              <GaugeSummary
                hideCurrentReading
                bare
                siteId={activeGauge.usgsSiteId}
                days={7}
                tier={tier}
                provider={gaugeDetail?.provider ?? 'usgs'}
                gaugeHeightFt={activeGauge.gaugeHeightFt}
                dischargeCfs={activeGauge.dischargeCfs}
                primaryUnit={activeThreshold?.thresholdUnit || 'ft'}
                readingAgeHours={activeGauge.readingAgeHours}
                readingSuspect={gaugeDetail?.readingSuspect ?? false}
                qualifierNote={gaugeDetail?.qualifierNote ?? null}
                conditionCode={condition.code}
                flowPercentile={gaugeDetail?.flowPercentile ?? null}
                floodStages={gaugeDetail?.floodStages ?? null}
                waterTemperature={gaugeDetail?.waterTemperature ?? null}
              />
            </CurrentReadingCard>
          )}

        <div className={hasSections ? 'border-t border-neutral-200' : 'mt-6'}>
        <GaugeHistoryChart
          key={activeGauge.usgsSiteId}
          embedded={hasSections}
          riverId={riverGroup.riverId}
          riverSlug={riverSlug}
          provider={gaugeDetail?.provider}
          timeZone={gaugeDetail?.timeZone}
          siteId={activeGauge.usgsSiteId}
          siteName={activeGauge.name}
          thresholds={chartThresholds}
          floodStages={gaugeDetail?.floodStages ?? null}
          latestValue={latestValue}
          displayUnit={effectiveUnit}
          onUnitChange={handleUnitToggle}
          canToggleUnit={canToggleUnit}
          showTypical={tier !== 'rated'}
          capabilities={lastYearCapabilities}
          lastYearOn={lastYearOn}
          onLastYearChange={setLastYearOn}
          onRangeChange={range => trackGaugeRangeChanged(
            { provider: gaugeDetail?.provider ?? 'usgs', tier },
            range.kind === 'custom' ? 'custom' : rangeLabelForDays(range.days),
          )}
          onExpand={() => trackGaugeExpandedOpened({ provider: gaugeDetail?.provider ?? 'usgs', tier })}
          help={<InfoTip title={CFS_EXPLAINER.title} body={CFS_EXPLAINER.body} ariaLabel="What is CFS?"
            colors={{ trigger: '#857D70', triggerBorder: '#C2BAAC', popBg: '#FFFFFF', popBorder: '#DBD5CA', title: '#2D2A24', body: '#524D43', focus: '#2D7889' }} />}
        />

        </div>
        {hasSections && showDamContext && damFooter}
        </div>

        {/* What happens next, in its own card as on iOS. */}
        <section className="card-panel" aria-label="Eddy's Read and three-day outlook">
          <EddyOutlookFooter
            destination={{ kind: 'river', id: riverSlug }}
            compact={hasSections}
            sections={eddyTakeSections}
            readLoading={selectedEddyReport.isFetching && !activeEddyUpdate}
            readIsGenerated={Boolean(activeEddyUpdate?.summaryText)}
            generatedAt={activeEddyUpdate?.generatedAt}
            gaugeName={eddySourceGaugeName}
            damRead={damTab ? { damId: damTab.damId, scheduleAbove: damLeads } : null}
          />
          <WillItHold
            key={`outlook-${activeSiteId}`}
            outlook={outlook}
            embedded
          />
        </section>

        {activeThreshold && (
          <div>
            <ThresholdTable
              thresholdUnit={activeThreshold.thresholdUnit}
              levelTooLow={activeThreshold.levelTooLow}
              levelLow={activeThreshold.levelLow}
              levelOptimalMin={activeThreshold.levelOptimalMin}
              levelOptimalMax={activeThreshold.levelOptimalMax}
              levelHigh={activeThreshold.levelHigh}
              levelDangerous={activeThreshold.levelDangerous}
              altThresholds={altThresholds}
              altUnit={altUnit}
              thresholdDescriptions={activeGauge.thresholdDescriptions}
              currentCondition={condition.code}
            />
          </div>
        )}

        <HistoricalWaterQuality data={gaugeDetail?.historicalWaterQuality} />

        {/* Community photos — what the current condition looks like. */}
        <RiverVisualGallery riverSlug={riverSlug} addPhotoHref={addPhotoHref} layout="wide" />
        </div>

    </div>
  );
}
