import assert from 'node:assert/strict';
import test from 'node:test';
import { premiumExcerpt } from '../../../eddy-ios/src/lib/todayPresentation';
test('Premium excerpt keeps report words while removing presentation markup', () => {
  assert.equal(premiumExcerpt('## Eddy’s Read\n\n**Watch the rise.** Check [the gauge](https://example.com).'), 'Eddy’s Read Watch the rise. Check the gauge.');
  assert.equal(premiumExcerpt('   '), '');
  assert.equal(premiumExcerpt('Short report.'), 'Short report.');
  const report = 'Watch the rising water at the next access point. '.repeat(20);
  const excerpt = premiumExcerpt(report);
  assert.ok(excerpt.length <= 321);
  assert.ok(excerpt.endsWith('…'));
  assert.ok(report.startsWith(excerpt.slice(0, -1)));
});
