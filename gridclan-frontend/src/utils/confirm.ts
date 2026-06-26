import { Alert, Platform } from 'react-native';

/**
 * Cross-platform confirmation dialog.
 *
 * On native we use Alert.alert with Cancel/Confirm buttons. On web,
 * React Native Web's Alert.alert does NOT render action buttons (the
 * onPress callbacks never fire), which silently broke confirm-gated actions
 * like Log out and Delete account — so on web we fall back to window.confirm.
 *
 * Returns true if the user confirmed, false otherwise.
 */
export function confirm(opts: {
  title:         string;
  message?:      string;
  confirmLabel:  string;
  cancelLabel:   string;
  destructive?:  boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel, cancelLabel, destructive } = opts;

  if (Platform.OS === 'web') {
    const text = message ? `${title}\n\n${message}` : title;
    const ok = typeof window !== 'undefined' && typeof window.confirm === 'function'
      ? window.confirm(text)
      : true;
    return Promise.resolve(ok);
  }

  return new Promise(resolve => {
    Alert.alert(title, message, [
      { text: cancelLabel,  style: 'cancel',                              onPress: () => resolve(false) },
      { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}
