import React from 'react';
import {
  ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { reportError } from '@services/errorReporter';
import { Colors, Font, Radius, Spacing } from '@theme/index';

interface Props {
  children: React.ReactNode;
  screenName?: string;
}

interface State {
  hasError:  boolean;
  errorMsg:  string;
  errorId:   string | null;
}

/**
 * Catches synchronous render errors anywhere in the subtree.
 * Reports to the backend then shows a recovery screen.
 * Unhandled JS errors and promise rejections are caught by
 * installGlobalErrorHandlers() in errorReporter.ts.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMsg: '', errorId: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, errorMsg: error?.message ?? 'Unknown render error' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const id = Math.random().toString(36).slice(2, 10).toUpperCase();
    this.setState({ errorId: id });

    reportError({
      errorType:     'RENDER_ERROR',
      errorMessage:  error?.message ?? 'Unknown render error',
      stackTrace:    error?.stack,
      componentName: info.componentStack?.split('\n')[1]?.trim(),
      screenName:    this.props.screenName,
      extra:         { errorId: id, componentStack: info.componentStack },
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, errorMsg: '', errorId: null });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.icon}>⚡</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.subtitle}>
          The app hit an unexpected error. This has been automatically reported.
        </Text>

        {this.state.errorId && (
          <View style={styles.idBox}>
            <Text style={styles.idLabel}>Error ID</Text>
            <Text style={styles.idValue}>{this.state.errorId}</Text>
          </View>
        )}

        <TouchableOpacity style={styles.retryBtn} onPress={this.handleRetry}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          If this keeps happening, restart the app or contact support.
        </Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: Spacing.xl, paddingTop: Spacing.xxl,
  },
  icon:     { fontSize: 56, marginBottom: Spacing.md },
  title:    {
    color: Colors.textPrimary, fontSize: Font.size.xl,
    fontWeight: Font.weight.bold, textAlign: 'center', marginBottom: Spacing.sm,
  },
  subtitle: {
    color: Colors.textMuted, fontSize: Font.size.md,
    textAlign: 'center', lineHeight: 22, marginBottom: Spacing.xl,
  },
  idBox: {
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, alignItems: 'center', marginBottom: Spacing.xl,
    borderWidth: 1, borderColor: Colors.border, width: '100%',
  },
  idLabel: { color: Colors.textMuted, fontSize: Font.size.xs, marginBottom: 4 },
  idValue: { color: Colors.textSecondary, fontSize: Font.size.sm, fontFamily: 'monospace' },
  retryBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.md,
  },
  retryText: { color: Colors.textPrimary, fontWeight: Font.weight.bold, fontSize: Font.size.md },
  note:      { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center' },
});
