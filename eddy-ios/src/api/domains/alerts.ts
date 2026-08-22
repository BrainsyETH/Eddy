// Focused public API for the alerts domain.
export {
  subscribeToRiver,
  unsubscribeFromRiver,
  fetchSubscriptions,
  fetchAlertRules,
  CreateGaugeAlertInput,
  createGaugeAlert,
  UpdateAlertRuleInput,
  UpdateAlertRuleResult,
  updateAlertRule,
  deleteAlertRule,
  fetchNotificationPreferences,
  updateNotificationPreferences,
  fetchAppConfig,
  fetchAlerts,
  fetchHighWater,
  fetchRiverAlerts,
} from '../implementation';
