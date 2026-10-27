import InfoTip from '@/components/ui/InfoTip';

export default function FloatTimeInfoTip() {
  return <InfoTip branded size={24} title="Estimated float time" ariaLabel="About estimated float time"
    body="Paced for a canoe with typical stops. Rafts may be slower. Wind, water levels, and longer stops can change your time."
    colors={{ trigger: 'var(--color-primary-700)', triggerBorder: 'var(--color-neutral-300)',
      popBg: 'var(--color-surface)', popBorder: 'var(--color-primary-700)', title: 'var(--color-neutral-900)',
      body: 'var(--color-neutral-700)', focus: 'var(--color-primary-500)' }} />;
}
