// A tailwater's dam lives inside the live report card on both platforms, and on
// the dam's own unrated release tab the dam Read replaces the river Read.
// shared/dam-release-tab.test.ts tests the rule; this holds the two screens to
// using it, and the web page to having no separate Dam release section.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const WEB_DETAIL = 'src/components/gauge/RiverGaugeDetail.tsx';
const WEB_PAGE = 'src/app/rivers/[state]/[slug]/page.tsx';
const WEB_NAV = 'src/app/rivers/[state]/[slug]/HubSectionNav.tsx';
const WEB_FOOTER = 'src/components/gauge/EddyOutlookFooter.tsx';
const IOS_RIVER = '../eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/river/[slug].tsx';
const IOS_TAKE = '../eddy-ios/src/components/EddyTake.tsx';

test('both river screens decide the dam tab with the shared rule', () => {
  assert.match(read(WEB_DETAIL), /from '@shared\/dam-release-tab'/);
  assert.match(read(WEB_DETAIL), /damReleaseTab\(/);
  assert.match(read(IOS_RIVER), /from '@eddy\/conditions\/dam-release-tab'/);
  assert.match(read(IOS_RIVER), /damReleaseTab\(/);
});

test('the dam panel is inside the reading card, not a section of its own', () => {
  const page = read(WEB_PAGE);
  assert.doesNotMatch(page, /id="dam"/, 'the Dam release section is folded into the card');
  assert.doesNotMatch(page, /TailwaterStatusRow/, 'the panel carries the status lines now');
  assert.match(page, /position="lead"/);
  assert.match(page, /position="footer"/);
  assert.doesNotMatch(read(WEB_NAV), /id: 'dam'/, 'no nav tab scrolling to a section that is gone');

  const detail = read(WEB_DETAIL);
  assert.match(detail, /lead=\{damLeads \? damLead : undefined\}/);
  assert.match(detail, /footer=\{damLeads \? undefined : damFooter\}/);

  const ios = read(IOS_RIVER);
  assert.match(ios, /lead=\{damLeads \? <RiverDamPanel/);
  assert.match(ios, /position="footer"/);
});

test('the river card draws the dam the way the dam cards do', () => {
  // Not a third visual: the directory/homepage card's parts on web, the
  // Favorites card's body on iOS. Tomorrow's bars only where the dam leads.
  const web = read('src/components/dam/RiverDamPanel.tsx');
  assert.match(web, /from '\.\/DamCardParts'/);
  assert.match(web, /<DamReadings /);
  assert.match(web, /<GenerationSchedule/);
  assert.match(web, /withTomorrow=\{lead\}/);
  assert.match(read('src/components/dam/DamListCard.tsx'), /from '\.\/DamCardParts'/, 'the list card draws the same parts');

  const ios = read('../eddy-ios/src/components/dam/RiverDamPanel.tsx');
  assert.match(ios, /<DamGlance /);
  assert.match(ios, /withTomorrow=\{position === 'lead'\}/);
  assert.match(read('../eddy-ios/src/components/dam/DamFavoriteCard.tsx'), /<DamGlance dam=\{dam\} onPress=\{onPress\} \/>/, 'Favorites draws the same body, Today only');
});

test("the dam tab's Read is the dam's, with Weather kept and Bottom line dropped", () => {
  const footer = read(WEB_FOOTER);
  assert.match(footer, /<DamReadTeaser/);
  assert.match(footer, /\{!damRead && \(/, 'Bottom line is drawn only off the dam tab');
  assert.match(footer, />Weather</, 'Weather stays on every tab');

  const take = read(IOS_TAKE);
  assert.match(take, /\{damRead \? null : \(/, 'Bottom line is drawn only off the dam tab');
  assert.match(take, /LOCKED_DAM_READ_SHAPE/, 'locked, the dam Read frosts under the card\'s one lock');
  assert.match(read(IOS_RIVER), /damRead=\{damTab \?/);
});
