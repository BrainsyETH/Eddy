// eddy-ios/modules/eddy-float-recorder/index.ts
// The native float recorder (ios/FloatRecorder.swift, ios/FloatJournal.swift).
// See docs/decisions/0014-float-recording-is-native.md.
//
// Null in builds without the module (Expo Go, web): Float Mode then says
// tracking is unavailable in this build rather than pretending.

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { RecordedFix, RecorderStatus } from '../../src/lib/floatRecording';

export interface FixesEvent {
  sessionId: string;
  /** Byte offsets of these fixes in the float's journal. */
  from: number;
  to: number;
  fixes: RecordedFix[];
}

export interface JournalPage {
  fixes: RecordedFix[];
  /** Offset after the last complete line returned. */
  next: number;
  /** Journal size when read. */
  end: number;
}

interface NativeFloatRecorder {
  start(sessionId: string): Promise<RecorderStatus>;
  stop(sessionId: string | null): Promise<RecorderStatus>;
  status(): Promise<RecorderStatus>;
  /** Apple's in-app temporary precise-location prompt; resolves whether precise location is now on. */
  requestPreciseLocation(): Promise<boolean>;
  read(sessionId: string, from: number, maxBytes: number): Promise<JournalPage>;
  deleteJournal(sessionId: string): Promise<void>;
  deleteAllJournals(): Promise<void>;
  journalSize(): Promise<number>;
  addListener(event: 'onFixes', listener: (event: FixesEvent) => void): { remove(): void };
  addListener(event: 'onStatus', listener: (event: RecorderStatus) => void): { remove(): void };
}

export const floatRecorder: NativeFloatRecorder | null =
  Platform.OS === 'ios' ? requireOptionalNativeModule<NativeFloatRecorder>('EddyFloatRecorder') : null;
