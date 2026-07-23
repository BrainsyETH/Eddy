import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyConditionEvent,
  hasSuspectQualifier,
  retryDelayMs,
  subscriptionMatches,
} from './policy';

test('classifies every push-relevant transition', () => {
  assert.equal(classifyConditionEvent('low', 'good'), 'floatable');
  assert.equal(classifyConditionEvent('good', 'high'), 'warning');
  assert.equal(classifyConditionEvent('high', 'dangerous'), 'warning');
  assert.equal(classifyConditionEvent('dangerous', 'high'), 'easing');
  assert.equal(classifyConditionEvent('high', 'flowing'), 'recovery');
  assert.equal(classifyConditionEvent('good', 'flowing'), 'info');
});

test('matches subscription kinds without pushing informational transitions', () => {
  assert.equal(subscriptionMatches('floatable', 'floatable'), true);
  assert.equal(subscriptionMatches('safety', 'warning'), true);
  assert.equal(subscriptionMatches('safety', 'floatable'), false);
  assert.equal(subscriptionMatches('all', 'info'), false);
});

test('rejects suspect readings and caps retry delay', () => {
  assert.equal(hasSuspectQualifier(['P', 'Ice']), true);
  assert.equal(hasSuspectQualifier(['P']), false);
  assert.equal(retryDelayMs(20), 3_600_000);
});
