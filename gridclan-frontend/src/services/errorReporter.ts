import { Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';

const BASE_URL: string =
  (Constants.expoConfig?.extra?.API_BASE_URL as string | undefined) ??
  'https://api.gridclanpuzzle.win';

export type ErrorType =
  | 'JS_CRASH'
  | 'RENDER_ERROR'
  | 'UNHANDLED_REJECTION'
  | 'NETWORK_ERROR';

export interface ErrorReport {
  errorType:     ErrorType;
  errorMessage:  string;
  stackTrace?:   string;
  componentName?: string;
  screenName?:   string;
  extra?:        Record<string, unknown>;
}

// In-memory queue: flush when network comes back or on next heartbeat
const queue: ErrorReport[] = [];
let isFlushing = false;

/** Send a crash/error report to the backend. Fire-and-forget. */
export async function reportError(report: ErrorReport): Promise<void> {
  queue.push(report);
  await flushQueue();
}

async function flushQueue(): Promise<void> {
  if (isFlushing || queue.length === 0) return;
  isFlushing = true;

  while (queue.length > 0) {
    const report = queue[0];
    try {
      const appVersion =
        Application.nativeApplicationVersion ??
        Constants.expoConfig?.version ??
        'unknown';

      await fetch(`${BASE_URL}/ops/error-report`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorType:     report.errorType,
          errorMessage:  report.errorMessage.substring(0, 5000),
          stackTrace:    report.stackTrace?.substring(0, 20000),
          componentName: report.componentName,
          screenName:    report.screenName,
          appVersion,
          platform:      Platform.OS,
          deviceModel:   `${Platform.OS} ${Platform.Version}`,
          osVersion:     String(Platform.Version),
          extra:         report.extra,
        }),
      });
      queue.shift();
    } catch {
      // Network unavailable — stop flushing, leave in queue for next attempt
      break;
    }
  }

  isFlushing = false;
}

/** Install global handlers for uncaught errors and unhandled rejections. */
export function installGlobalErrorHandlers(): void {
  // Unhandled promise rejections
  const nativeHandler = (globalThis as any).onunhandledrejection;
  (globalThis as any).onunhandledrejection = (event: PromiseRejectionEvent) => {
    const msg = event.reason instanceof Error
      ? event.reason.message
      : String(event.reason);
    const stack = event.reason instanceof Error ? event.reason.stack : undefined;

    reportError({
      errorType:    'UNHANDLED_REJECTION',
      errorMessage: msg,
      stackTrace:   stack,
    });

    nativeHandler?.(event);
  };

  // Uncaught JS errors (React Native exposes ErrorUtils)
  const ErrorUtils = (globalThis as any).ErrorUtils;
  if (ErrorUtils) {
    const previousHandler = ErrorUtils.getGlobalHandler?.();

    ErrorUtils.setGlobalHandler((error: Error, isFatal: boolean) => {
      reportError({
        errorType:    'JS_CRASH',
        errorMessage: error?.message ?? 'Unknown error',
        stackTrace:   error?.stack,
        extra:        { isFatal },
      });

      previousHandler?.(error, isFatal);
    });
  }
}
