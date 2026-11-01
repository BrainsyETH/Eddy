import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLine as iosSourceLine, SOURCE_NAMES as IOS_NAMES } from '../../../../eddy-ios/src/lib/accessCopy';
import { agencySources, sourceLine, SOURCE_NAMES } from './source-line';

test('the attribution line is identical on web and iOS', () => {
  assert.deepEqual(IOS_NAMES, SOURCE_NAMES);
  for (const input of [[], ['MDC'], ['AGFC'], ['AGFC', 'MDC'], ['MDC', 'MDC'], ['XYZ'], null, undefined]) {
    assert.equal(iosSourceLine(input), sourceLine(input));
  }
  assert.equal(sourceLine(['MDC']), 'Includes data from the Missouri Department of Conservation.');
  assert.equal(sourceLine(['AGFC', 'MDC']), 'Includes data from the Arkansas Game and Fish Commission and the Missouri Department of Conservation.');
  assert.equal(sourceLine([]), null);
});

test('agency codes come from the reviewed source links, de-duplicated and sorted', () => {
  assert.deepEqual(agencySources([{ provider: 'mdc' }, { provider: 'agfc' }, { provider: 'mdc' }, { provider: null }]), ['AGFC', 'MDC']);
  assert.deepEqual(agencySources(null), []);
});
