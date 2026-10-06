export interface EvalCall {
  tool: string;
  arguments: unknown;
  result: unknown;
  isError?: boolean;
}
interface HostedBlock {
  type: string;
  name?: string;
  id?: string;
  tool_use_id?: string;
  input?: unknown;
  arguments?: string;
  output?: string;
  content?: unknown;
  is_error?: boolean;
  error?: unknown;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function decoded(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return decoded(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (Array.isArray(value)) {
    for (const block of value) {
      const parsed = decoded(record(block).text);
      if (parsed.data) return parsed;
    }
    return {};
  }
  const object = record(value);
  if (object.structuredContent) return decoded(object.structuredContent);
  if (object.content && !object.data) return decoded(object.content);
  return object;
}
export function hostedCalls(blocks: HostedBlock[]): EvalCall[] {
  return blocks
    .filter((b) => b.type === 'mcp_tool_use' || b.type === 'mcp_call')
    .map((b) => {
      const output =
        b.type === 'mcp_call'
          ? b
          : blocks.find(
              (r) => r.type === 'mcp_tool_result' && r.tool_use_id === b.id,
            );
      return {
        tool: b.name ?? 'unknown',
        arguments: b.input ?? decoded(b.arguments),
        result: decoded(output?.output ?? output?.content),
        isError: !!(output?.is_error || output?.error),
      };
    });
}
/** Trace evidence, not an NLP correctness score. A full-plan response must
 * follow the search and resolve the same endpoints, vessel and requested date.
 * Missing links/ambiguous prose are left for the case's human reviewer.
 */
export function reviewDetailFollowups(calls: EvalCall[], answer: string) {
  const options: Array<{
    url: string;
    presented: boolean;
    confirmed: boolean;
  }> = [];
  for (let index = 0; index < calls.length; index++) {
    if (calls[index].tool !== 'find_floats') continue;
    const recommendations = record(
      decoded(calls[index].result).data,
    ).recommendations;
    if (!Array.isArray(recommendations)) continue;
    for (const recommendation of recommendations) {
      const plan = record(record(recommendation).data);
      if (plan.detailRequired !== true) continue;
      const start = record(plan.putIn),
        end = record(plan.takeOut);
      const url = typeof plan.url === 'string' ? plan.url : '';
      const presented =
        (!!url && answer.includes(url)) ||
        (typeof start.name === 'string' &&
          typeof end.name === 'string' &&
          answer.includes(start.name) &&
          answer.includes(end.name));
      const confirmed = calls.slice(index + 1).some((call) => {
        if (call.tool !== 'plan_float' || call.isError) return false;
        const envelope = decoded(call.result),
          full = record(envelope.data);
        return (
          ['ok', 'partial'].includes(String(envelope.status)) &&
          !!start.id &&
          !!end.id &&
          record(full.putIn).id === start.id &&
          record(full.takeOut).id === end.id &&
          typeof plan.vesselType === 'string' &&
          full.vesselType === plan.vesselType &&
          typeof plan.requestedDate === 'string' &&
          full.requestedDate === plan.requestedDate
        );
      });
      options.push({ url, presented, confirmed });
    }
  }
  return {
    options,
    unconfirmedPresentedOptions: options.filter(
      (o) => o.presented && !o.confirmed,
    ).length,
    humanReviewRequired: true,
    note: 'Review prose-only route selection and preserved warnings manually. A plan call for another route/date/vessel or before the search does not satisfy detailRequired.',
  };
}
