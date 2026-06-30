// src/lib/logger.ts
// Centralized logging chokepoint.
//
// Why this exists: the codebase had ~500 scattered console.* calls with no
// structured context and no path to an error-monitoring backend. Route all
// logging through this module so that:
//   1. log output is structured and level-filtered consistently, and
//   2. there is exactly ONE place to wire Sentry/Datadog/etc. later — register
//      a reporter via setErrorReporter() (e.g. from instrumentation.ts) and
//      every logger.error()/captureException() call starts shipping to it.
//
// Until a reporter is registered this is a thin, safe wrapper over console, so
// adopting it never changes runtime behavior.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = Record<string, unknown>;

/**
 * A monitoring sink. Wire this up once (e.g. Sentry.captureException) and all
 * error-level logs flow to it in addition to the console.
 */
type ErrorReporter = (error: unknown, context?: LogContext) => void;

let errorReporter: ErrorReporter | null = null;

/** Register the monitoring backend. Call once at process startup. */
export function setErrorReporter(reporter: ErrorReporter | null): void {
  errorReporter = reporter;
}

// Order matters: anything at or above the configured threshold is emitted.
const LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function threshold(): LogLevel {
  const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
  if (fromEnv && LEVELS.includes(fromEnv)) return fromEnv;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function enabled(level: LogLevel): boolean {
  return LEVELS.indexOf(level) >= LEVELS.indexOf(threshold());
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!enabled(level)) return;
  const payload = context ? [message, context] : [message];
  // eslint-disable-next-line no-console
  (console[level] ?? console.log)(...payload);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),

  /**
   * Log an error and forward it to the monitoring backend (if registered).
   * Prefer passing the real Error object so stack traces survive.
   */
  error: (message: string, error?: unknown, context?: LogContext) => {
    emit('error', message, { ...context, ...(error !== undefined ? { error } : {}) });
    if (errorReporter && error !== undefined) {
      try {
        errorReporter(error, { message, ...context });
      } catch {
        // A failing reporter must never break the request path.
      }
    }
  },

  /** Report a caught exception to monitoring without a separate log line. */
  captureException: (error: unknown, context?: LogContext) => {
    emit('error', error instanceof Error ? error.message : String(error), context);
    if (errorReporter) {
      try {
        errorReporter(error, context);
      } catch {
        // ignore reporter failures
      }
    }
  },
};
