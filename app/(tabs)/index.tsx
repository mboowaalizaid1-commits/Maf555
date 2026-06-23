import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { AntColonyCanvas } from "@/components/AntColonyCanvas";

export default function ColonyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, runAgent } = useApp();

  const enabledAgents = useMemo(
    () => state.agents.filter((a) => a.enabled),
    [state.agents]
  );

  const activeCount = useMemo(
    () => state.agents.filter((a) => a.status !== "IDLE").length,
    [state.agents]
  );

  const completedToday = useMemo(() => {
    const dayAgo = Date.now() - 86400000;
    return state.tasks.filter(
      (t) => t.status === "completed" && (t.completedAt ?? 0) > dayAgo
    ).length;
  }, [state.tasks]);

  const pendingApprovals = useMemo(
    () => state.tasks.filter((t) => t.status === "awaiting_approval").length,
    [state.tasks]
  );

  const colonyHeight = 340;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) },
        ]}
      >
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
            {state.brand.businessName}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Colony</Text>
        </View>
        <View style={styles.headerRight}>
          {pendingApprovals > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>
                {pendingApprovals}
              </Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
        <View style={styles.colonyWrapper}>
          <AntColonyCanvas agents={state.agents} tasks={state.tasks} height={colonyHeight} />
          <View style={[styles.statsOverlay, { backgroundColor: colors.background + "DD" }]}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.primary }]}>{activeCount}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Active</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.primary }]}>{enabledAgents.length}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Agents</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: colors.primary }]}>{completedToday}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Today</Text>
            </View>
            {pendingApprovals > 0 && (
              <>
                <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: colors.accent }]}>{pendingApprovals}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Review</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View style={styles.body}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Active Agents</Text>

          {enabledAgents.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: colors.card }]}>
              <Feather name="layers" size={28} color={colors.mutedForeground} />
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                No agents enabled. Go to the Agents tab to activate some.
              </Text>
            </View>
          ) : (
            <View style={styles.agentRow}>
              {enabledAgents.map((agent) => {
                const isActive = agent.status !== "IDLE";
                return (
                  <TouchableOpacity
                    key={agent.id}
                    style={[
                      styles.agentPill,
                      {
                        backgroundColor: isActive ? agent.color + "22" : colors.card,
                        borderColor: isActive ? agent.color + "66" : colors.border,
                      },
                    ]}
                    onPress={() => {
                      if (!isActive) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        runAgent(agent.id);
                      }
                    }}
                  >
                    <View style={[styles.agentDot, { backgroundColor: agent.color }]} />
                    <Text style={[styles.agentPillName, { color: isActive ? agent.color : colors.foreground }]}>
                      {agent.name.replace(" Agent", "")}
                    </Text>
                    {isActive && (
                      <Feather name="activity" size={11} color={agent.color} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {state.tasks.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>
                Recent Activity
              </Text>
              {state.tasks.slice(0, 5).map((task) => (
                <View
                  key={task.id}
                  style={[styles.taskRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View
                    style={[
                      styles.taskIndicator,
                      {
                        backgroundColor:
                          task.status === "completed"
                            ? colors.success
                            : task.status === "awaiting_approval"
                            ? colors.primary
                            : task.status === "failed"
                            ? colors.destructive
                            : colors.accent,
                      },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskTitle, { color: colors.foreground }]}>{task.title}</Text>
                    <Text style={[styles.taskSub, { color: colors.mutedForeground }]}>
                      {task.status === "awaiting_approval" ? "Awaiting your approval" : task.status}
                    </Text>
                  </View>
                  <Text style={[styles.taskTime, { color: colors.mutedForeground }]}>
                    {task.completedAt ? formatMini(task.completedAt) : "Running"}
                  </Text>
                </View>
              ))}
            </>
          )}

          <View style={{ height: insets.bottom + 100 }} />
        </View>
      </ScrollView>
    </View>
  );
}

function formatMini(ts: number) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  greeting: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.5 },
  headerTitle: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold" },
  colonyWrapper: { position: "relative" },
  statsOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  statItem: { alignItems: "center", paddingHorizontal: 16 },
  statNum: { fontSize: 20, fontWeight: "700", fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  statDivider: { width: 1, height: 28 },
  body: { paddingHorizontal: 20, paddingTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  agentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  agentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  agentDot: { width: 7, height: 7, borderRadius: 4 },
  agentPillName: { fontSize: 13, fontFamily: "Inter_500Medium" },
  emptyState: {
    alignItems: "center",
    padding: 28,
    borderRadius: 14,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  taskIndicator: { width: 6, height: 6, borderRadius: 3 },
  taskTitle: { fontSize: 13, fontFamily: "Inter_500Medium" },
  taskSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  taskTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
