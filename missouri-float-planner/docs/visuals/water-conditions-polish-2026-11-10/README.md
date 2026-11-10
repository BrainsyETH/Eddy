# Water conditions polish — November 10, 2026

Rendered from the actual `PilotDamConditions`, `DamInfoTip`, Eddy icons, fonts and Tailwind styles in this branch. The isolated browser harness uses fixed fixtures for repeatable review; these are not screenshots of live readings or a deployed page.

The Table Rock fixture uses the supplied review values: 705.98 ft below the dam, 910.18 ft lake elevation, 57.4°F, −0.5 ft over 3h below the dam, −0.07 ft in 24h at the lake, and 0 cfs inflow. Truman demonstrates one daily lake reading with a positive change. Both use a fixed November 10 clock.

- [Desktop, 1440px viewport](table-rock-desktop.png)
- [Phone, 390px viewport](table-rock-phone.png)
- [Small phone, 320px viewport](table-rock-small-phone.png)
- [Truman daily reading, 390px viewport](truman-phone.png)

## Verified

- Browser checks at 1440, 768, 390 and 320px: reading order, three aligned columns, no horizontal overflow, matching movement treatment, info dialog, Escape and focus restoration.
- Rising, falling, small and unavailable changes; stale readings; mixed observation times; Truman daily cadence; absent temperature/inflow; a fully empty snapshot; real zero inflow.
- Inflow age deduplicates only for identical observation instants, including equivalent timezone offsets. Different instants that round to the same age remain separately labeled.
- Application and test TypeScript checks passed.
- Repository ESLint passed with 18 existing warnings outside the changed files; changed files have no warnings. Tailwind token check passed.
- All 5,048 registered web tests passed under Node 20. The runner used `node --import tsx` with `TSX_TSCONFIG_PATH=tsconfig.test.json` because the environment disallows the tsx CLI's IPC socket.

This pass changes the existing Table Rock and Truman Water conditions card and retains fishery context in About the dam. It does not change release gates, source data, generation schedules or other dam-card layouts. Browser verification covers the actual component with fixtures, not full-page production navigation.
