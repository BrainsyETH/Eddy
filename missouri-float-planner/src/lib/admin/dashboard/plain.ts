/**
 * Plain-language copy for every dashboard number. The catalog keeps the
 * precise source labels (used in the "All numbers" drawer for debugging);
 * everything a person reads first comes from here: a short title, one
 * sentence on what it counts, and what to do about it.
 *
 * `dashboard.test.ts` fails if a catalog metric has no entry, so a new number
 * cannot ship with only its technical label.
 */
import type { Metric } from './model';

export interface PlainCopy {
  title: string;
  means: string;
  todo?: string;
}

/** Section names as the person reading the dashboard thinks of them. */
export const SECTION_NAMES: Record<string, string> = {
  Business: 'Members & Premium',
  'Trips & interests': 'Trips & interests',
  Inbox: 'Inbox',
  'Push & devices': 'Phone alerts & devices',
  Configuration: 'App settings',
  'Data & jobs': 'River data & automation',
  'Content review': 'Content gaps',
  'AI & reach': 'AI & widgets',
  Security: 'Admin sign-ins',
  Errors: 'Errors',
  'Upstream & MCP': 'Outside services',
  'Scheduled jobs': 'Automation',
};

const ALERT_WAIT = 'Alerts that should have gone out but are still waiting.';

export const PLAIN: Record<string, PlainCopy> = {
  subscribers: {
    title: 'Premium members',
    means: 'People who pay for Premium right now.',
  },
  renewal_off: {
    title: "Premium members who won't renew",
    means: 'They keep Premium until it ends, then it stops.',
  },
  expiring: {
    title: 'Premium ending this week',
    means: "Members who turned off renewal and whose Premium ends in 7 days.",
  },
  billing: {
    title: 'Payment problems',
    means: "Members whose card or App Store payment didn't go through.",
    todo: 'Check RevenueCat. Apple usually retries on its own.',
  },
  rc_event: {
    title: 'Last Premium change',
    means: 'The most recent purchase, renewal or cancellation we heard about.',
  },
  signups_7: { title: 'New accounts this week', means: 'Accounts created in the last 7 days.' },
  signins_7: { title: 'People who signed in this week', means: 'Accounts that signed in during the last 7 days.' },
  email_7: { title: 'Email sign-ups this week', means: 'New addresses on the email list in 7 days.' },
  plans_7: { title: 'Trips planned this week', means: 'Float plans saved in the last 7 days.' },
  signups_30: { title: 'New accounts this month', means: 'Accounts created in the last 30 days.' },
  signins_30: { title: 'People who signed in this month', means: 'Accounts that signed in during the last 30 days.' },
  email_30: { title: 'Email sign-ups this month', means: 'New addresses on the email list in 30 days.' },
  plans_30: { title: 'Trips planned this month', means: 'Float plans saved in the last 30 days.' },
  email_sources: {
    title: 'Where email sign-ups come from',
    means: 'Which page or form people used to join the list, last 30 days.',
  },
  plan_views: {
    title: 'Views of this month’s plans',
    means: 'How often plans saved in the last 30 days have been opened.',
  },
  plan_rivers: {
    title: 'Most-planned rivers',
    means: 'Rivers with the most saved float plans, last 30 days.',
  },
  plan_pairs: {
    title: 'Most-planned floats',
    means: 'The put-in and take-out pairs people save most, last 30 days.',
  },
  stars_rivers: { title: 'Most-followed rivers', means: 'Rivers the most people have starred.' },
  stars_gauges: { title: 'Most-followed gauges', means: 'Gauges the most people have starred.' },
  stars_dams: { title: 'Most-followed dams', means: 'Dams the most people have starred.' },
  reports: {
    title: 'River reports to review',
    means: 'Hazard and condition reports from paddlers waiting for approval.',
    todo: 'Approve or reject them so they show up for others.',
  },
  email: {
    title: 'Unread email',
    means: 'Messages sent to Eddy that nobody has opened yet.',
    todo: 'Reply or mark them read.',
  },
  feedback: {
    title: 'Feedback to review',
    means: 'Suggestions and bug reports from the site and app.',
    todo: 'Read and resolve them.',
  },
  push_sent: {
    title: 'Alerts sent this week',
    means: 'Phone alerts sent off for delivery in the last 7 days.',
  },
  push_errors: {
    title: 'Alerts that failed today',
    means: 'Phone alerts that could not be sent in the last 24 hours.',
    todo: 'Look at the error codes below to see why.',
  },
  receipt_errors: {
    title: 'Alerts bounced after sending',
    means: 'Part of the failed alerts above, not extra ones.',
  },
  push_codes: { title: 'Why alerts failed', means: 'Failed alerts grouped by reason, last 7 days.' },
  river_waiting: {
    title: 'River alerts stuck waiting',
    means: `${ALERT_WAIT} Waiting more than 15 minutes.`,
    todo: 'Check that the "Send push alerts" job is running.',
  },
  river_retry: {
    title: 'River alerts being retried',
    means: 'Alerts that failed once and are being tried again.',
    todo: 'Usually clears itself. If it grows, check push errors.',
  },
  river_exhausted: {
    title: 'River alerts that gave up',
    means: 'Alerts that hit the retry limit and will not be sent.',
    todo: 'Check push errors for the cause.',
  },
  gauge_waiting: {
    title: 'Gauge alerts stuck waiting',
    means: `${ALERT_WAIT} Waiting more than 15 minutes.`,
    todo: 'Check that the "Send push alerts" job is running.',
  },
  gauge_retry: {
    title: 'Gauge alerts being retried',
    means: 'Alerts that failed once and are being tried again.',
    todo: 'Usually clears itself. If it grows, check push errors.',
  },
  gauge_exhausted: {
    title: 'Gauge alerts that gave up',
    means: 'Alerts that hit the retry limit and will not be sent.',
    todo: 'Check push errors for the cause.',
  },
  devices: { title: 'iPhones set up for alerts', means: 'iPhones with alerts on that used the app in the last 30 days.' },
  disabled_devices: { title: 'Phones with alerts turned off', means: 'Recently seen phones that can no longer get alerts.' },
  failing_devices: { title: 'Phones where alerts keep failing', means: 'Recently seen phones whose alerts are bouncing.' },
  versions: { title: 'App versions in use', means: 'Which app version recently seen phones are running.' },
  app_config: { title: 'App switches', means: 'Settings the iOS app reads at launch.' },
  trust: {
    title: 'Serious data problems',
    means: 'Critical issues found by Eddy’s automatic data checks.',
    todo: 'Open Trust to see and fix them.',
  },
  trust_last: { title: 'Last data check', means: 'When the automatic data checks last ran.' },
  trust_errors: {
    title: 'Data checks that crashed',
    means: 'Automatic data checks that failed to finish in 24 hours.',
    todo: 'Open Trust to see the error.',
  },
  gauge_stale: {
    title: 'Gauges not updating',
    means: 'River gauges with no new reading in over 6 hours.',
    todo: 'Check the gauge on USGS. It may be down for maintenance.',
  },
  gauge_missing: {
    title: 'Gauges with no usable reading',
    means: 'River gauges with no reading stored, or one with a bad timestamp.',
    todo: 'Check the gauge ID in Gauge Thresholds.',
  },
  dam_stale: {
    title: 'Dam info out of date',
    means: 'Dam generation info older than 6 hours.',
    todo: 'Check the "Refresh dam conditions" job.',
  },
  social_failed: {
    title: 'Social posts that failed',
    means: 'Posts that did not publish in the last 7 days.',
    todo: 'Open Social Media and retry them.',
  },
  social_stuck: {
    title: 'Social videos stuck rendering',
    means: 'Videos still rendering after 30 minutes, last 7 days.',
    todo: 'Open Social Media and retry them.',
  },
  social_fallback: {
    title: 'Videos posted as photos',
    means: 'Video posts that fell back to a still image, last 7 days.',
    todo: 'Open Social Media to see which videos failed to render.',
  },
  campsite_sync_log_errors: {
    title: 'Campsite sync failures',
    means: 'Campsite availability updates that failed this week.',
    todo: 'Open Data Sync to rerun it.',
  },
  campsite_sync_log_empty: {
    title: 'Campsite syncs that found nothing',
    means: 'Updates that returned no campsites this week. Often normal off-season.',
  },
  nps_sync_log_errors: {
    title: 'National park sync failures',
    means: 'National Park Service updates that failed this week.',
    todo: 'Open Data Sync to rerun it.',
  },
  nps_sync_log_empty: {
    title: 'National park syncs that found nothing',
    means: 'Updates that returned no results this week. Can be normal.',
  },
  usfs_sync_log_errors: {
    title: 'National forest sync failures',
    means: 'Forest Service updates that failed this week.',
    todo: 'Open Data Sync to rerun it.',
  },
  usfs_sync_log_empty: {
    title: 'National forest syncs that found nothing',
    means: 'Updates that returned no results this week. Can be normal.',
  },
  images: {
    title: 'Access points without photos',
    means: 'Put-ins and take-outs that have no picture yet.',
    todo: 'Add photos in Access Points.',
  },
  descriptions: {
    title: 'Access points without descriptions',
    means: 'Put-ins and take-outs with no write-up yet.',
    todo: 'Add descriptions in Access Points.',
  },
  driving: {
    title: 'Access points without directions',
    means: 'Put-ins and take-outs missing a driving pin.',
    todo: 'Add driving pins in Access Points.',
  },
  hazards: {
    title: 'Hazards to re-check',
    means: 'Active hazards nobody has updated in 30 days.',
    todo: 'Confirm they still exist or retire them.',
  },
  blogs: {
    title: 'Blog posts that missed their date',
    means: 'Scheduled posts that should have published by now.',
    todo: 'Open Blog Posts to publish or reschedule.',
  },
  eddy_updates_expired: {
    title: 'Old Eddy Reads in storage',
    means: 'Expired river write-ups still stored. Housekeeping only.',
  },
  eddy_updates_tokens: {
    title: 'AI used for Eddy Reads',
    means: 'AI tokens spent writing river Reads in 30 days.',
  },
  gauge_updates_expired: {
    title: 'Old gauge Reads in storage',
    means: 'Expired gauge write-ups still stored. Housekeeping only.',
  },
  gauge_updates_tokens: {
    title: 'AI used for gauge Reads',
    means: 'AI tokens spent writing gauge Reads in 30 days.',
  },
  chat_sessions: { title: 'Chats with Eddy this week', means: 'Conversations with the Eddy assistant in 7 days.' },
  chat_duration: {
    title: 'Typical chat reply time',
    means: 'How long Eddy usually takes to answer, in milliseconds.',
  },
  chat_tokens: { title: 'AI used for chat', means: 'AI tokens spent on assistant chats in 7 days.' },
  chat_tools: { title: 'What chats look up', means: 'Which tools the assistant used most this week.' },
  chat_rivers: { title: 'Rivers people ask about', means: 'Rivers mentioned in assistant chats this week.' },
  embeds: {
    title: 'Widget views this week',
    means: 'Times an Eddy widget loaded anywhere, last 7 days.',
  },
  embed_hosts: {
    title: 'Sites showing widgets this week',
    means: 'Websites a widget loaded from in the last 7 days.',
  },
  embed_partners: {
    title: 'Partner widgets this week',
    means: 'Widget views from registered partners in 7 days.',
  },
  login_failed: {
    title: 'Wrong admin passwords today',
    means: 'Failed admin sign-in attempts in 24 hours.',
    todo: 'If you did not make these, change the admin password.',
  },
  login_success: { title: 'Admin sign-ins today', means: 'Successful admin sign-ins in 24 hours.' },
};

const PROVIDERS: Record<string, string> = {
  usgs: 'USGS',
  nws: 'Weather Service',
  openweather: 'OpenWeather',
  mapbox: 'Mapbox',
  anthropic: 'Anthropic AI',
  mcp: 'AI agent tools',
};
const provider = (id: string) => PROVIDERS[id] ?? id.toUpperCase();

/** Copy for a metric, including the ones built at request time (jobs, providers, Sentry). */
export function plain(metric: Pick<Metric, 'key' | 'label'>, jobLabel?: string): PlainCopy {
  const fixed = PLAIN[metric.key];
  if (fixed) return fixed;
  const [prefix, ...rest] = metric.key.split('_');
  const id = rest.join('_');
  if (metric.key.startsWith('job_'))
    return {
      title: `${jobLabel ?? id} didn’t finish`,
      means: 'This automatic task failed, stalled or missed its schedule.',
      todo: 'Open it to see recent runs.',
    };
  if (prefix === 'sentry')
    return metric.key === 'sentry'
      ? { title: 'Error tracking', means: 'Sentry is not connected to this dashboard.' }
      : {
          title: `Errors on ${id}`,
          means: 'Separate errors that happened in the last 24 hours.',
          todo: 'Open Sentry to see them.',
        };
  if (prefix === 'upstream')
    return id
      ? { title: `${provider(id)} usage`, means: `How often Eddy called ${provider(id)}.` }
      : { title: 'Outside service usage', means: 'Usage tracking is turned off.' };
  if (prefix === '429')
    return {
      title: `${provider(id)} asked us to slow down`,
      means: `Times ${provider(id)} refused a call for being too frequent today.`,
    };
  if (prefix === 'errors')
    return {
      title: `${provider(id)} is failing`,
      means: `More than 1 in 20 calls to ${provider(id)} failed today.`,
      todo: 'Check that service’s status page.',
    };
  if (prefix === 'ai')
    return { title: `AI use: ${id.replaceAll('-', ' ')}`, means: 'Tokens and estimated cost over 7 days.' };
  if (metric.key === 'effective_push')
    return {
      title: 'Phone alerts are switched off',
      means: 'Eddy is not sending any push alerts right now.',
      todo: 'Turn push back on in app settings when ready.',
    };
  if (metric.key === 'below_min')
    return { title: 'Phones on an unsupported version', means: 'They need to update the app.' };
  if (metric.key === 'latest_version')
    return { title: 'Phones on the newest version', means: 'Recently seen phones running the latest release.' };
  if (metric.key === 'unknown_version')
    return { title: 'Phones on an unknown version', means: 'We could not read their app version.' };
  if (metric.key === 'mcp_limit')
    return { title: 'AI agent rate limits', means: 'How many tool calls outside AI agents may make.' };
  if (metric.key === 'telemetry_budget')
    return { title: 'Usage tracking budget', means: 'Tracking operations used today.' };
  if (metric.key === 'telemetry_capped')
    return { title: 'Usage tracking hit its cap', means: 'Some usage today was not counted.' };
  if (metric.key === 'telemetry_dropped')
    return { title: 'Usage events dropped', means: 'Usage events lost before they were saved.' };
  return { title: metric.label, means: '' };
}
