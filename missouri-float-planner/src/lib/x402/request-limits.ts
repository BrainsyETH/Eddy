// Bound attacker-controlled base64 JSON before the payment SDK decodes it or
// validates it with its Zod 3 dependency. This is a request-side mitigation;
// it does not patch the SDK's dependency or its facilitator response parser.
export const MAX_PAYMENT_HEADER_BYTES = 16 * 1024;
const PAYMENT_HEADERS = ['payment-signature', 'x-payment', 'sign-in-with-x'];

export function paymentHeadersWithinLimit(headers: Headers): boolean {
  let total = 0;
  for (const name of PAYMENT_HEADERS) {
    const value = headers.get(name);
    if (!value) continue;
    // HTTP header values are byte strings. These protocol headers carry ASCII
    // base64, so length bounds the encoded bytes without allocating a copy.
    total += value.length;
    if (total > MAX_PAYMENT_HEADER_BYTES) return false;
  }
  return true;
}
