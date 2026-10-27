import SiteFooter from '@/components/ui/SiteFooter';
import ConditionsExplorer, { type ConditionsExplorerProps } from './ConditionsExplorer';

export default function ConditionsLayout(props: ConditionsExplorerProps) {
  const damEntry = props.defaultKind === 'dams';
  return <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
    <header className="bg-primary-900 py-7 text-white md:py-9">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-accent-400 md:text-4xl" style={{ fontFamily: 'var(--font-display)' }}>{damEntry ? 'Lakes & Dams' : 'Conditions'}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80">{damEntry ? 'Dam releases and generation schedules.' : 'River levels, dam releases, and generation schedules.'}</p>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <ConditionsExplorer {...props} />
      <p className="mt-8 max-w-2xl text-xs text-neutral-500">Readings from USGS, USACE, and Ameren; schedules from SWPA. Releases can change without notice. Follow warning sirens and posted signs below every dam.</p>
      <p className="mt-2 max-w-2xl text-xs text-neutral-500">USGS readings can lag actual river conditions. Check the observation time before heading out.</p>
    </div>
    <SiteFooter maxWidth="max-w-7xl" />
  </div>;
}
