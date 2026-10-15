// Run from this package: node --import tsx scripts/generate-widget-preview.ts
import { writeFileSync } from 'node:fs';
import { conditionWidgetPreview } from '../shared/condition-widget-preview';

writeFileSync(new URL('../../eddy-ios/modules/eddy-live-activity/widget/ConditionsPreview.json', import.meta.url),
  `${JSON.stringify(conditionWidgetPreview(), null, 2)}\n`);
