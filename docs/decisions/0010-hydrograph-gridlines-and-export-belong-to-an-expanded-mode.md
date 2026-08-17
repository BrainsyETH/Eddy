# 0010 — Gridlines and data export belong to an expanded hydrograph, not to the inline one

Status: open · 2026-08

A chart review asked for four readability additions:
neutral horizontal gridlines, a larger/full-screen web mode, CSV or table
export, and a user-set reference level. They are recorded here rather than built,
because three of the four are cheap only if the fourth exists first, and one of
them has a correctness decision inside it that a "readability" pass would settle
by accident.

**Gridlines are gated on the expanded mode.** The inline chart already carries,
at 128px on a card and 192px on a detail page: up to five threshold rules with
labels, two shaded condition zones, the day-of-year typical band and its dashed
median, a dashed violet forecast with a now-boundary, and a crosshair. Value
ticks are drawn in a sibling DOM column — text inside a `preserveAspectRatio="none"`
SVG would be text at the wrong aspect ratio, see the header of
[`FlowTrendChart.tsx`](../../missouri-float-planner/src/components/ui/FlowTrendChart.tsx).
Neutral rules across that plot compete with the threshold rules, which are the
lines a reader is meant to notice; the ladder is the point of this chart. In a
full-height view there is room for both, and the gridline is doing what it is for.

**Export has a sampling decision in it, and must not be settled quietly.** The
history endpoint reduces the series before sending it —
`samplePreservingExtrema()` keeps both endpoints and the high and low of every
time bucket, so peaks survive but density does not, and the retained points are
deliberately unevenly spaced. A CSV built from what the chart holds is therefore
not the station's record, and someone comparing it against USGS's own hydrograph
will find fewer rows. Either the export re-fetches raw readings, or every export
declares itself sampled in the file — a filename and a header row, not a tooltip.
The chart now says "thinned for display, peaks kept" under any detail plot whose
payload was reduced; an export is the place that claim has to be machine-readable.

**A user reference level is a preference, and this app has no home for one.** It
needs to persist per gauge, sync to the phone (`@eddy/sync`), and be described in
the same breath as the thresholds Eddy publishes without being confused for them
— a reader's own line and a rated ladder cannot look alike. That is a feature
with a data model, not a chart affordance.

**Consequence:** the inline chart stays as it is. When the expanded mode is
built, it owns gridlines, the tabular view behind the keyboard scrub (see
`role="slider"` in `FlowTrendChart`), and export — and the sampling declaration
ships with the export in the same change, not after it.

Reopening this means deciding the expanded mode's surface first: a route, a
dialog, or a full-bleed panel on the existing detail page. Everything else here
hangs off that answer.
