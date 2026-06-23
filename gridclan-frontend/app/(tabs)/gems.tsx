import React, { useEffect, useState } from 'react';
import {
  RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AppDispatch, RootState } from '@store/index';
import { fetchGemBalanceThunk, fetchGemHistoryThunk } from '@store/slices/gemsSlice';
import { Card, LoadingSpinner, EmptyState, Separator } from '@components/ui/index';
import { Colors, Font, Radius, Spacing } from '@theme/index';

/**
 * Gems tab — closed-loop in-game currency. Gems have no cash value and
 * cannot be withdrawn. They are earned by playing, gifted to friends, and
 * spent on revives, replays, hints, and cosmetics.
 */
export default function GemsScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { balance, history, isLoading } = useSelector((s: RootState) => s.gems);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    dispatch(fetchGemBalanceThunk());
    dispatch(fetchGemHistoryThunk(50));
  };

  useEffect(() => { load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([dispatch(fetchGemBalanceThunk()), dispatch(fetchGemHistoryThunk(50))]);
    setRefreshing(false);
  };

  if (isLoading && !balance) return <LoadingSpinner />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Balance hero */}
      <Card style={styles.hero}>
        <View style={styles.balanceRow}>
          <Ionicons name="diamond" size={28} color={Colors.primary} />
          <Text style={styles.balanceValue}>{balance?.balance ?? 0}</Text>
        </View>
        <Text style={styles.balanceLabel}>{t('gems.balance')}</Text>
        <Text style={styles.explainer}>{t('gems.explainer')}</Text>

        <View style={styles.statsRow}>
          <Stat label={t('gems.earned',   { count: balance?.lifetimeEarned   ?? 0 })} />
          <Stat label={t('gems.gifted',   { count: balance?.lifetimeGifted   ?? 0 })} />
          <Stat label={t('gems.received', { count: balance?.lifetimeReceived ?? 0 })} />
          <Stat label={t('gems.spent',    { count: balance?.lifetimeSpent    ?? 0 })} />
        </View>
      </Card>

      {/* Actions */}
      <TouchableOpacity style={styles.giftBtn} onPress={() => router.push('/gems/gift' as never)}>
        <Ionicons name="gift" size={20} color={Colors.bg} />
        <Text style={styles.giftBtnText}>{t('gems.gift')}</Text>
      </TouchableOpacity>

      {/* History */}
      <Text style={styles.sectionTitle}>{t('gems.recentActivity')}</Text>
      {history.length === 0 ? (
        <EmptyState icon="diamond-outline" title={t('gems.noActivity')} />
      ) : (
        <Card style={styles.historyCard}>
          {history.map((tx, i) => (
            <View key={i}>
              {i > 0 && <Separator />}
              <View style={styles.txRow}>
                <View style={styles.txLeft}>
                  <Text style={styles.txType}>{tx.type}</Text>
                  <Text style={styles.txDate}>{new Date(tx.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={[styles.txDelta, { color: tx.gemsDelta >= 0 ? Colors.success : Colors.error }]}>
                  {tx.gemsDelta >= 0 ? '+' : ''}{tx.gemsDelta}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

function Stat({ label }: { label: string }) {
  return <Text style={styles.stat}>{label}</Text>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content:   { padding: Spacing.lg },

  hero:        { alignItems: 'center', paddingVertical: Spacing.lg },
  balanceRow:  { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  balanceValue:{ fontSize: 40, fontWeight: Font.weight.black, color: Colors.textPrimary },
  balanceLabel:{ color: Colors.textMuted, fontSize: Font.size.sm, marginTop: 2 },
  explainer:   { color: Colors.textMuted, fontSize: Font.size.xs, textAlign: 'center', marginTop: Spacing.sm, lineHeight: 16 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.md },
  stat:     { color: Colors.textSecondary, fontSize: Font.size.xs },

  giftBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm,
    backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  giftBtnText: { color: Colors.bg, fontWeight: Font.weight.bold, fontSize: Font.size.md },

  sectionTitle: { color: Colors.textSecondary, fontSize: Font.size.sm, fontWeight: Font.weight.semi, marginTop: Spacing.xl, marginBottom: Spacing.sm },
  historyCard:  { padding: 0 },
  txRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: Spacing.md },
  txLeft:       { flex: 1 },
  txType:       { color: Colors.textPrimary, fontSize: Font.size.sm, fontWeight: Font.weight.medium },
  txDate:       { color: Colors.textMuted, fontSize: Font.size.xs, marginTop: 2 },
  txDelta:      { fontSize: Font.size.md, fontWeight: Font.weight.bold },
});
