# Restored five-item dam card

[Desktop preview](restored-desktop.png) renders the original `DamStateCard` through the actual `DamDetail`, using Eddy's existing icons, fonts and styles. These are fixed sample readings for visual review, not a live production screenshot.

The original five items share one desktop row: river level below dam, water temperature below dam, lake level, inflow and fishery. The existing responsive layout is retained on phones. The restore changes which card the lake experience renders; `DamStateCard` and its styles are unchanged.

Browser checks passed at 1440, 1272, 390 and 320px, including both lake-experience states, absent lake data, absent temperature, and empty measurements. They verify one measurements card, all available icons loading, five items on the same desktop row and no horizontal overflow. The browser harness renders the real components with fixtures; it does not test production navigation.

All 5,048 registered web tests passed under Node 20. The runner used `node --import tsx` with `TSX_TSCONFIG_PATH=tsconfig.test.json` because this environment disallows the tsx CLI's IPC socket.
