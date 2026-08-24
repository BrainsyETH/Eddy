# Research material

Archival source documents used for data ingestion and outreach. Reference
them; don't rewrite them. Dates in filenames are when the file entered the
repository, not necessarily when the research was performed.

| File | What it is |
| --- | --- |
| `2026-07-eddy-guide-campground-outfitter-data-gap-analysis-rev1.pdf` | Campground & outfitter data-gap analysis for eddy.guide (originally `Eddy.guide Ozark Rivers Campground & Outfitter Data Gap Analysis.pdf`). |
| `2026-07-eddy-guide-campground-outfitter-data-gap-analysis-rev2.pdf` | Second revision of the same analysis (originally the ` (1).pdf` download). The two files differ in content, so both are retained; rev1/rev2 reflects filename convention, not a verified edit order. |
| `2026-07-ozark-float-business-database-outreach.pdf` | Database of 75 float trip businesses across six river corridors, compiled for outreach (originally `Missouri Ozark Float Trip Business Database for eddy.guide Outreach.pdf`). |
| `2026-07-ozark-float-business-database-outreach.md` | Markdown edition of the same business database (originally the UUID-named `compass_artifact_…_text_markdown.md`). Greppable; use this one from scripts and prompts. |

## Known defects in the business database

The 2026 business database is still worth reading, but two of its fields are
**not** what their names say, and rows imported from it carry the damage:

- **`city` and ZIP are corridor labels, not addresses.** The document groups
  businesses by float corridor and appears to have stamped each section with one
  town. Four Gasconade businesses reached production as Jerome, 65529, when they
  are in Richland, Waynesville and Dixon; Hufstedler's reached it as Riverton,
  63965 — Van Buren's ZIP, ninety miles from its actual Alton address. Four
  Van Buren rows still carry Eminence's 65466.
- **The river attribution follows the section heading.** The document has one
  combined "Big Piney / Gasconade / Little Piney" section, and every business in
  it was described as being on the Big Piney — including the four that are on
  the Gasconade, which Eddy's own access points had placed correctly all along.

Check any row sourced to it against the operator's own site before trusting the
town, the ZIP or the river. `npm run db:check-services` lists what is still
sourced this way.

Used by: the services phase of river ingestion — see
[`missouri-float-planner/scripts/ingestion/README.md`](../../missouri-float-planner/scripts/ingestion/README.md)
(Phase 8.5), which backfills `nearby_services` from these documents.
