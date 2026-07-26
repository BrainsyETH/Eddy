import { Placeholder } from '@/components/Placeholder';

export default function AlertsScreen() {
  return (
    <Placeholder
      title="Alerts"
      blurb="Condition changes for your starred rivers. The feed is free to read; real-time push is the paid layer."
      waitingOn="public river_condition_events feed endpoint"
    />
  );
}
