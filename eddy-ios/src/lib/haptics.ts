import * as Haptics from 'expo-haptics';

/** Feedback must never delay or fail the action it acknowledges. */
export function selectionFeedback() {
  void Haptics.selectionAsync().catch(() => {});
}

export function successFeedback() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
