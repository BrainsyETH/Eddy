# River Read preview — 2026-11-10

`mobile.png` shows the actual `WillItHold` and `EddyOutlookFooter` components at
390px and 320px iframe viewport widths, with the website's compiled styles,
Geist/Fredoka fonts and existing Eddy icon assets. Sample conditions reproduce
the supplied Huzzah screenshot; this is a local layout fixture, not live data.
The same components were also visually reviewed at 1024px.

The Read, Weather and Bottom line are blurred. Their labels and attribution
remain legible, and the coral app CTA fills the available width on phones.
The browser accessibility tree excludes all three blurred passages while
retaining the forecast, section labels, Premium explanation and app link.
The fixture uses static server rendering; live API loading and client-side
campaign persistence were not browser-tested in this preview.
