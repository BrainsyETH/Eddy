// Temporary compatibility barrel. New code should import a focused domain
// module; existing callers retain the same public API during the migration.
export { ApiError, USER_AGENT } from './transport';
export * from './domains/accounts';
export * from './domains/alerts';
export * from './domains/camping';
export * from './domains/dams';
export * from './domains/gauges';
export * from './domains/reports';
export * from './domains/rivers';
