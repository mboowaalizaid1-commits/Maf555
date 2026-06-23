import React from "react";
import { FlatList, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { AgentCard } from "@/components/AgentCard";

export default function AgentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, runAgent, updateAgentEnabled } = useApp();

  const totalTasks = state.agents.reduce((sum, a) => sum + a.taskCount, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Agents</Text>
        <View style={[styles.badge, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
            {state.agents.filter((a) => a.enabled).length} / {state.agents.length} active
          </Text>
        </View>
      </View>

      {totalTasks > 0 && (
        <View style={[styles.summaryRow, { paddingHorizontal: 20, marginBottom: 4 }]}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryNum, { color: colors.primary }]}>{totalTasks}</Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Total tasks</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryNum, { color: colors.accent }]}>
              {state.tasks.filter((t) => t.status === "awaiting_approval").length}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Need review</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryNum, { color: colors.success }]}>
              {state.tasks.filter((t) => t.status === "completed").length}
            </Text>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Completed</Text>
          </View>
        </View>
      )}

      <FlatList
        data={state.agents}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => (
          <AgentCard
            agent={item}
            onRun={runAgent}
            onToggle={updateAgentEnabled}
            running={item.status !== "IDLE"}
          />
        )}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No agents configured
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  summaryCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 12,
  },
  summaryNum: { fontSize: 22, fontWeight: "700", fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  list: { paddingHorizontal: 20, paddingTop: 8 },
  empty: { padding: 24, borderRadius: 14, alignItems: "center" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
