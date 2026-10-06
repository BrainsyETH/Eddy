import test from 'node:test';
import assert from 'node:assert/strict';
import { hostedEndpoint } from './mcp-eval-config';
import {
  hostedCalls,
  reviewDetailFollowups,
  type EvalCall,
} from './mcp-eval-review';

test('hosted bypass requires a dedicated credential and explicit opt-in', () => {
  const url = 'https://preview.example/api/mcp';
  assert.equal(hostedEndpoint(url).toString(), url);
  assert.throws(
    () => hostedEndpoint(url, 'fixture-secret'),
    /explicitly|Explicitly/,
  );
  assert.throws(() => hostedEndpoint(url, undefined, true), /dedicated/);
  assert.throws(
    () => hostedEndpoint(url + '?x-vercel-protection-bypass=secret'),
    /credentials/,
  );
  assert.throws(
    () => hostedEndpoint('https://user:secret@preview.example/api/mcp'),
    /credentials/,
  );
  assert.equal(
    hostedEndpoint(url, 'fixture-secret', true).searchParams.get(
      'x-vercel-protection-bypass',
    ),
    'fixture-secret',
  );
});

const plan = {
  url: 'https://eddy.guide/plan?putIn=a&takeOut=b',
  putIn: { id: 'a', name: 'Akers' },
  takeOut: { id: 'b', name: 'Pulltite' },
  requestedDate: '2026-09-29',
  vesselType: 'canoe',
  detailRequired: true,
};
const search: EvalCall = {
  tool: 'find_floats',
  arguments: {},
  result: { status: 'ok', data: { recommendations: [{ data: plan }] } },
};
const full: EvalCall = {
  tool: 'plan_float',
  arguments: {},
  result: { status: 'partial', data: plan },
};

test('detailRequired requires a later completed plan for the same route, date and vessel', () => {
  const check = (calls: EvalCall[]) =>
    reviewDetailFollowups(calls, plan.url).unconfirmedPresentedOptions;
  assert.equal(check([search]), 1);
  assert.equal(check([search, full]), 0);
  assert.equal(check([full, search]), 1);
  assert.equal(check([search, { ...full, isError: true }]), 1);
  for (const change of [
    { takeOut: { id: 'c' } },
    { vesselType: 'tube' },
    { requestedDate: '2026-09-30' },
  ]) {
    assert.equal(
      check([
        search,
        { ...full, result: { status: 'ok', data: { ...plan, ...change } } },
      ]),
      1,
    );
  }
  assert.equal(
    check([
      search,
      {
        ...full,
        result: { status: 'unavailable', data: { message: 'deadline' } },
      },
    ]),
    1,
  );
  assert.equal(
    reviewDetailFollowups([search], 'Akers to Pulltite')
      .unconfirmedPresentedOptions,
    1,
  );
  assert.equal(
    reviewDetailFollowups([search], 'No trip selected')
      .unconfirmedPresentedOptions,
    0,
  );
});

test('hosted traces pair Anthropic result IDs and parse OpenAI MCP output', () => {
  const blocks = [
    { type: 'mcp_tool_use', id: 'search', name: 'find_floats', input: {} },
    {
      type: 'mcp_tool_result',
      tool_use_id: 'search',
      content: [{ type: 'text', text: JSON.stringify(search.result) }],
    },
    {
      type: 'mcp_call',
      name: 'plan_float',
      arguments: '{}',
      output: JSON.stringify(full.result),
    },
  ];
  const calls = hostedCalls(blocks);
  assert.equal(
    reviewDetailFollowups(calls, plan.url).unconfirmedPresentedOptions,
    0,
  );
});
