// src/components/plan/FloatTimeCaveat.tsx
// The sentence that qualifies a float time on the website.
//
// Two cases, both new with the tailwater work and both previously unsaid here:
//
//   release-dependent  the number is quoted, and is only good while the
//                      release holds. Built by shared/float-time-caveat.ts so
//                      this card, the iOS card and the chat tool say the same
//                      thing about the same number.
//   regulated          no number at all: a tailwater with no live flow to
//                      estimate from. The stat tile shows "--" and nothing else
//                      said why — which reads as a missing feature, not a
//                      refusal with a reason.
//
// `inline` renders with style attributes for FloatPlanCard, which is rasterised
// for sharing and does not carry Tailwind classes into the image.

import type { FloatPlan } from '@/types/api';
import { REGULATED_HEADLINE, REGULATED_SENTENCE, releaseCaveat } from '@shared/float-time-caveat';

type Props = {
  plan: Pick<FloatPlan, 'floatTime' | 'floatTimeWithheldReason'>;
  inline?: boolean;
};

export function floatTimeCaveatText(
  plan: Pick<FloatPlan, 'floatTime' | 'floatTimeWithheldReason'>,
): { headline: string | null; sentence: string } | null {
  const assumptions = plan.floatTime?.assumptions;
  if (plan.floatTime && assumptions) {
    const sentence = releaseCaveat({
      releaseDependent: assumptions.releaseDependent,
      model: plan.floatTime.model,
      gaugeName: assumptions.gaugeName ?? null,
    });
    return sentence ? { headline: null, sentence } : null;
  }
  if (!plan.floatTime && plan.floatTimeWithheldReason === 'regulated') {
    return { headline: REGULATED_HEADLINE, sentence: REGULATED_SENTENCE };
  }
  return null;
}

export default function FloatTimeCaveat({ plan, inline = false }: Props) {
  const text = floatTimeCaveatText(plan);
  if (!text) return null;

  if (inline) {
    return (
      <div
        style={{
          marginTop: -6,
          marginBottom: 16,
          padding: '8px 10px',
          borderRadius: 8,
          background: '#FFF7E6',
          border: '1px solid #F2C879',
          fontSize: 12,
          lineHeight: 1.35,
          color: '#5B4300',
        }}
      >
        {text.headline ? <strong style={{ display: 'block', marginBottom: 2 }}>{text.headline}</strong> : null}
        {text.sentence}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
      {text.headline ? <span className="block font-semibold">{text.headline}</span> : null}
      {text.sentence}
    </div>
  );
}
