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
