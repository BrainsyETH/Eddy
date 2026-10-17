// Run from this package: node --import tsx scripts/generate-widget-preview.ts
import { writeFileSync } from 'node:fs';
import { conditionWidgetPreview } from '../shared/condition-widget-preview';

writeFileSync(new URL('../../eddy-ios/modules/eddy-live-activity/widget/ConditionsPreview.json', import.meta.url),
  `${JSON.stringify(conditionWidgetPreview(), null, 2)}\n`);

// Public picker metadata only; no network or account state.
import { USACE_DAMS, hasPowerhouse } from '../src/lib/flow-providers/usace-registry';
writeFileSync(new URL('../../eddy-ios/modules/eddy-live-activity/widget/DamWidgetCatalog.json', import.meta.url),
  `${JSON.stringify(Object.values(USACE_DAMS).filter(hasPowerhouse).map(({ id, name, state }) => ({ id, name, state })).sort((a, b) => a.name.localeCompare(b.name)), null, 2)}\n`);
