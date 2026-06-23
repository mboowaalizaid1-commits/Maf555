import React, { useMemo } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";

const INTERVAL_MS = 30 * 60 * 1000;

export default function CalendarScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state } = useApp();

  const schedule = useMemo(() => {
    const now = Date.now();
    const items: { agentId: string; agentName: string; color: string; nextRun: number }[] = [];
    state.agents
      .filter((a) => a.enabled)
      .forEach((agent) => {
        const lastRun = agent.lastRun ?? now - INTERVAL_MS * 0.5;
        const nextRun = lastRun + INTERVAL_MS;
        items.push({ agentId: agent.id, agentName: agent.name, color: agent.color, nextRun });
      });
    return items.sort((a, b) => a.nextRun - b.nextRun);
  }, [state.agents]);

  const history = useMemo(
    () =>
      state.tasks
        .filter((t) => t.status === "completed" || t.status === "failed")
        .slice(0, 20)
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    [state.tasks]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8) },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Schedule</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 100) },
        ]}
      >
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Upcoming Runs</Text>

        {schedule.length === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Feather name="calendar" size={24} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No agents scheduled. Enable agents in the Agents tab.
            </Text>
          </View>
        ) : (
          schedule.map((item) => (
            <View
              key={item.agentId}
              style={[styles.scheduleRow, { backgroundColor: colors.card, borderColor: item.color + "33" }]}
            >
              <View style={[styles.colorBar, { backgroundColor: item.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.agentName, { color: colors.foreground }]}>{item.agentName}</Text>
                <Text style={[styles.nextRunLabel, { color: colors.mutedForeground }]}>
                  {formatNextRun(item.nextRun)}
                </Text>
              </View>
              <View style={[styles.intervalBadge, { backgroundColor: item.color + "22" }]}>
                <Feather name="refresh-cw" size={10} color={item.color} />
                <Text style={[styles.intervalText, { color: item.color }]}>30 min</Text>
              </View>
            </View>
          ))
        )}

        {history.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground, marginTop: 28 }]}>
              History
            </Text>
            {history.map((task) => (
              <View
                key={task.id}
                style={[styles.historyRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        task.status === "completed" ? colors.success : colors.destructive,
                    },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyTitle, { color: colors.foreground }]}>{task.title}</Text>
                  <Text style={[styles.historyTime, { color: colors.mutedForeground }]}>
                    {task.completedAt ? formatDateTime(task.completedAt) : "—"}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.historyStatus,
                    { color: task.status === "completed" ? colors.success : colors.destructive },
                  ]}
                >
                  {task.status === "completed" ? "Done" : "Failed"}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function formatNextRun(ts: number): string {
  const now = Date.now();
  const diff = ts - now;
  if (diff < 0) return "Overdue — runs soon";
  const mins = Math.ceil(diff / 60000);
  if (mins < 60) return `In ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `In ${hrs}h ${mins % 60}m`;
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold" },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 12 },
  empty: {
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
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 8,
    padding: 14,
    gap: 12,
  },
  colorBar: { width: 3, height: 36, borderRadius: 2 },
  agentName: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  nextRunLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  intervalBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  intervalText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  historyTitle: { fontSize: 13, fontFamily: "Inter_500Medium" },
  historyTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  historyStatus: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
