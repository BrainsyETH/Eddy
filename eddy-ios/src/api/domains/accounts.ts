// Focused public API for the accounts domain.
export {
  fetchStarredRivers,
  fetchStarredGauges,
  fetchStarredDams,
  starDam,
  unstarDam,
  starRiver,
  unstarRiver,
  starGauge,
  unstarGauge,
  fetchMeProfile,
  updateDisplayName,
  storeAppleAuthorizationCode,
  deleteAccount,
  waitForEntitlement,
  registerDeviceToken,
  unregisterDeviceToken,
} from '../implementation';
