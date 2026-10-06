# Eddy Read accuracy boundary

Both `generate-update.ts` and `generate-gauge-update.ts` use `report-facts.ts`
for the condition, matching-unit optimal-band comparison, prompt facts, and
post-generation checks. The shared condition ladder remains authoritative.

A cfs rating with no discharge (or a feet rating with no stage) is unknown;
there is no cross-unit fallback in generated reports. An available official
flood stage can still classify a reading as dangerous independently. Editorial
`level_dangerous` is not an official closure order.

A requested section is supported only if its assigned station actually resolved.
Otherwise its report is replaced with a factual station observation explicitly
saying the section is not assessed. Whole-river and secondary-gauge prompts
restrict claims to the reporting station; static local knowledge is not evidence
of current water at other locations. Secondary prompts no longer compare raw
heights at different stations.

The post-generation guard checks all three prose fields for explicit condition,
reading and optimal-band contradictions. It replaces the entire response with a
factual fallback on rejection and logs the station and rejection reasons (not the
full prompt). It does not attempt general semantic validation: arbitrary
paraphrases, geographic claims in whole-river prose, negation and hypothetical
phrasing are not fully understood. Conservative false positives can produce the
fallback. Prompt restrictions and review of generated samples remain necessary.

This change does not rewrite saved reports, change models, alter report-length
requirements, or disable section generation. After deployment, inspect newly
generated samples, especially the Current at Van Buren. The October 5 incident
(2.57 ft, 756 cfs; optimal 1190–2700 cfs) must be Good and below optimal, without
current Montauk/Akers claims. Review both the full Read and its compact versions.

Unknown ratings and unresolved section gauges return their fallback before any
model request; their usage is null. Database thresholds are normalized to numbers
in both loading paths, including secondary and primary-gauge thresholds.

Reading checks compare only explicit present gauge readings with the current
snapshot. Historical peaks and flood stages are not assumed to be current.
Condition predicates require a river, gauge, flow or water-level subject (or an
explicit rating label). Weather predicates such as “chance of rain is low” do
not change the river rating. A sentence may cite both feet and cfs; only a direct
comparison in the wrong dimension or an incorrectly quoted band is rejected.

Review follow-up (items 1–4 and 6): both generators fetch relevant active NWS
flood alerts before selecting a fallback. Fallbacks lead with the event and its
reported area in all three prose fields; the gauge rating remains independent.
Expired alerts are removed. Alert lookup failures are logged, not described as
an all-clear. Matching is the existing river/area filter, not station-level
flood-boundary verification.

Negated, forecast, conditional and historical clauses are not treated as current
rating/band assertions. This is still a deliberately narrow check, not a general
English parser. Separate unqualified present clauses remain checked.

The shared getGaugeConditions loader now uses strictUnit, so chat and Reads agree
when the matching measurement is missing; official flood-stage overrides remain.
River fallbacks skip local knowledge and trajectory work. Weather is retained
because it supplies the returned weather summary, and NWS supplies warning text.
Post-validation fallbacks list only the sources used in the published fallback
and weather summary. Section target selection and row persistence are unchanged.
