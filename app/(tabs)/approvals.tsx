import React, { useMemo } from "react";
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

export default function ApprovalsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, approveTask, rejectTask } = useApp();

  const pending = useMemo(
    () => state.tasks.filter((t) => t.status === "awaiting_approval"),
    [state.tasks]
  );

  function handleApprove(id: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    approveTask(id);
  }

  function handleReject(id: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    rejectTask(id);
  }

  const agentColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    state.agents.forEach((a) => { map[a.id] = a.color; });
    return map;
  }, [state.agents]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Approvals</Text>
        {pending.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeNum, { color: colors.primaryForeground }]}>{pending.length}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={pending}
        keyExtractor={(t) => t.id}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.card }]}>
              <Feather name="check-circle" size={36} color={colors.mutedForeground} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>All clear</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No content waiting for review. Run an agent to generate new content.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const agentColor = agentColorMap[item.agentId] ?? colors.primary;
          return (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: agentColor + "33" },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.agentDot, { backgroundColor: agentColor }]} />
                <Text style={[styles.agentName, { color: agentColor }]}>{item.agentName}</Text>
                <Text style={[styles.cardTime, { color: colors.mutedForeground }]}>
                  {item.completedAt ? formatTime(item.completedAt) : ""}
                </Text>
              </View>

              <Text style={[styles.cardTitle, { color: colors.foreground }]}>{item.title}</Text>

              {item.result && (
                <View style={[styles.resultBox, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.resultText, { color: colors.foreground }]} numberOfLines={6}>
                    {item.result}
                  </Text>
                </View>
              )}

              {/* Claude's quality review verdict — shown when an Anthropic key is configured */}
              {item.reviewFeedback ? (
                <View style={[styles.reviewBox, {
                  backgroundColor: item.reviewApproved ? colors.success + "14" : colors.destructive + "14",
                  borderColor: item.reviewApproved ? colors.success + "44" : colors.destructive + "44",
                }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <Feather
                      name={item.reviewApproved ? "check-circle" : "alert-circle"}
                      size={13}
                      color={item.reviewApproved ? colors.success : colors.destructive}
                    />
                    <Text style={{ fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold",
                      color: item.reviewApproved ? colors.success : colors.destructive }}>
                      Claude review — {item.reviewApproved ? "looks good" : "flagged"}
                    </Text>
                  </View>
                  <Text style={[styles.resultText, { color: colors.mutedForeground }]}>
                    {item.reviewFeedback}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "44" }]}
                  onPress={() => handleReject(item.id)}
                >
                  <Feather name="x" size={16} color={colors.destructive} />
                  <Text style={[styles.actionText, { color: colors.destructive }]}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: colors.success + "22", borderColor: colors.success + "44", flex: 1.5 }]}
                  onPress={() => handleApprove(item.id)}
                >
                  <Feather name="check" size={16} color={colors.success} />
                  <Text style={[styles.actionText, { color: colors.success }]}>
                    {item.agentId === "social" && state.apiKeys.twitterKey ? "Approve & Post" : "Approve"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function formatTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeNum: { fontSize: 12, fontWeight: "700", fontFamily: "Inter_700Bold" },
  list: { paddingHorizontal: 20, paddingTop: 4 },
  emptyWrap: { alignItems: "center", paddingTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "700", fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, textAlign: "center", fontFamily: "Inter_400Regular", lineHeight: 20 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
    gap: 12,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  agentDot: { width: 8, height: 8, borderRadius: 4 },
  agentName: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold", flex: 1 },
  cardTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  cardTitle: { fontSize: 15, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  resultBox: { borderRadius: 10, padding: 12 },
  reviewBox: { borderRadius: 10, padding: 10, borderWidth: 1, marginTop: 2 },
  resultText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  actions: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionText: { fontSize: 13, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
});
