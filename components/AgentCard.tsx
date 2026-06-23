import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { AgentState } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  agent: AgentState;
  onRun: (agentId: string) => void;
  onToggle: (agentId: string, enabled: boolean) => void;
  running?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  IDLE: "Ready",
  WORKING: "Working",
  MOVING: "Moving",
  DELIVERING: "Delivering",
};

export function AgentCard({ agent, onRun, onToggle, running }: Props) {
  const colors = useColors();

  function handleRun() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRun(agent.id);
  }

  function handleToggle() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle(agent.id, !agent.enabled);
  }

  const isActive = agent.status !== "IDLE";
  const lastRunLabel = agent.lastRun
    ? formatRelative(agent.lastRun)
    : "Never run";

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: agent.enabled ? agent.color + "44" : colors.border,
          borderWidth: 1,
          opacity: agent.enabled ? 1 : 0.6,
        },
      ]}
    >
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: agent.color }]} />
        <View style={styles.titleBlock}>
          <Text style={[styles.name, { color: colors.foreground }]}>{agent.name}</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>{agent.description}</Text>
        </View>
        <TouchableOpacity onPress={handleToggle} style={styles.toggleBtn}>
          <View
            style={[
              styles.toggleTrack,
              {
                backgroundColor: agent.enabled ? agent.color : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.toggleThumb,
                {
                  backgroundColor: colors.card,
                  transform: [{ translateX: agent.enabled ? 16 : 2 }],
                },
              ]}
            />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Feather name="check-circle" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>
              {agent.taskCount} tasks
            </Text>
          </View>
          <View style={styles.stat}>
            <Feather name="clock" size={12} color={colors.mutedForeground} />
            <Text style={[styles.statText, { color: colors.mutedForeground }]}>
              {lastRunLabel}
            </Text>
          </View>
          {isActive && (
            <View style={[styles.statusBadge, { backgroundColor: agent.color + "22" }]}>
              <View style={[styles.statusDot, { backgroundColor: agent.color }]} />
              <Text style={[styles.statusText, { color: agent.color }]}>
                {STATUS_LABELS[agent.status]}
              </Text>
            </View>
          )}
        </View>
        {agent.enabled && (
          <TouchableOpacity
            onPress={handleRun}
            disabled={isActive || running}
            style={[
              styles.runBtn,
              {
                backgroundColor: isActive ? colors.muted : agent.color,
                opacity: isActive ? 0.5 : 1,
              },
            ]}
          >
            {isActive ? (
              <ActivityIndicator size="small" color={agent.color} />
            ) : (
              <>
                <Feather name="play" size={12} color={colors.card} />
                <Text style={[styles.runText, { color: colors.card }]}>Run</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>

      {isActive && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: agent.color, width: `${agent.progress}%` },
            ]}
          />
        </View>
      )}
    </View>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  desc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  toggleBtn: { padding: 2 },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    position: "absolute",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },
  stat: { flexDirection: "row", alignItems: "center", gap: 4 },
  statText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 60,
    justifyContent: "center",
  },
  runText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "Inter_600SemiBold",
  },
  progressBar: {
    height: 3,
    backgroundColor: "#2D1F0E",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
});
