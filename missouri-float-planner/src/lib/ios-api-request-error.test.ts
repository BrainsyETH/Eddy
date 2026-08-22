import assert from 'node:assert/strict';
import test from 'node:test';

import { requestErrorMessage } from '../../../eddy-ios/src/api/request-error';

test('caller aborts remain distinguishable from connectivity failures', () => {
  const abort = new Error('aborted');
  abort.name = 'AbortError';

  assert.equal(requestErrorMessage(abort, false), 'Request cancelled');
  assert.equal(requestErrorMessage(abort, true), 'No connection');
  assert.equal(requestErrorMessage(new TypeError('network failed'), false), 'No connection');
});
