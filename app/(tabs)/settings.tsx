import React, { useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import {
  SUPPORTED_MODELS,
  ModelId,
  downloadModel,
  unloadModel,
  isModelLoaded,
  getActiveModelId,
  isModelDownloaded,
  validateGeminiKey,
  validateGroqKey,
  validateAnthropicKey,
} from "@/services/LLMService";
import {
  testTwitterConnection,
  testInstagramConnection,
  testYouTubeConnection,
  testGumroadConnection,
  testMailchimpConnection,
  ConnectionResult,
} from "@/services/ApiService";

type Status = "idle" | "checking" | "ok" | "error";

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { state, updateApiKeys } = useApp();

  // ── On-device model ──────────────────────────────────────────────
  const [activeModel, setActiveModel] = useState<ModelId | null>(getActiveModelId());
  const [downloadingId, setDownloadingId] = useState<ModelId | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadText, setDownloadText] = useState("");

  async function handleDownload(modelId: ModelId) {
    setDownloadingId(modelId);
    setDownloadProgress(0);
    const ok = await downloadModel(modelId, (p, text) => {
      setDownloadProgress(p);
      setDownloadText(text);
    });
    setDownloadingId(null);
    setActiveModel(ok ? getActiveModelId() : null);
  }

  async function handleUnload() {
    await unloadModel();
    setActiveModel(null);
  }

  // ── Gemini key ────────────────────────────────────────────────────
  const [geminiKey, setGeminiKey] = useState(state.apiKeys.geminiKey ?? "");
  const [geminiStatus, setGeminiStatus] = useState<Status>("idle");

  async function handleGeminiSave() {
    setGeminiStatus("checking");
    const ok = await validateGeminiKey(geminiKey.trim());
    setGeminiStatus(ok ? "ok" : "error");
    if (ok) updateApiKeys({ geminiKey: geminiKey.trim() });
  }

  // ── Anthropic (Claude) key ────────────────────────────────────────────────
  const [anthropicKey, setAnthropicKey] = useState(state.apiKeys.anthropicKey ?? "");
  const [anthropicStatus, setAnthropicStatus] = useState<Status>("idle");

  async function handleAnthropicSave() {
    setAnthropicStatus("checking");
    const ok = await validateAnthropicKey(anthropicKey.trim());
    setAnthropicStatus(ok ? "ok" : "error");
    if (ok) updateApiKeys({ anthropicKey: anthropicKey.trim() });
  }

  // ── Groq key ──────────────────────────────────────────────────────────────
  const [groqKey, setGroqKey] = useState(state.apiKeys.groqKey ?? "");
  const [groqStatus, setGroqStatus] = useState<Status>("idle");

  async function handleGroqSave() {
    setGroqStatus("checking");
    const ok = await validateGroqKey(groqKey.trim());
    setGroqStatus(ok ? "ok" : "error");
    if (ok) updateApiKeys({ groqKey: groqKey.trim() });
  }

  // ── Connected accounts ────────────────────────────────────────────
  type AccountKey = "twitterKey" | "instagramToken" | "youtubeKey" | "gumroadKey" | "emailKey";
  const ACCOUNTS: { key: AccountKey; label: string; placeholder: string; test: (v: string) => Promise<ConnectionResult> }[] = [
    { key: "twitterKey", label: "Twitter / X", placeholder: "Bearer token", test: testTwitterConnection },
    { key: "instagramToken", label: "Instagram", placeholder: "Access token", test: testInstagramConnection },
    { key: "youtubeKey", label: "YouTube", placeholder: "API key", test: testYouTubeConnection },
    { key: "gumroadKey", label: "Gumroad", placeholder: "Access token", test: testGumroadConnection },
    { key: "emailKey", label: "Mailchimp", placeholder: "API key", test: testMailchimpConnection },
  ];

  const [accountValues, setAccountValues] = useState<Record<AccountKey, string>>({
    twitterKey: state.apiKeys.twitterKey ?? "",
    instagramToken: state.apiKeys.instagramToken ?? "",
    youtubeKey: state.apiKeys.youtubeKey ?? "",
    gumroadKey: state.apiKeys.gumroadKey ?? "",
    emailKey: state.apiKeys.emailKey ?? "",
  });
  const [accountStatus, setAccountStatus] = useState<Record<AccountKey, Status>>({
    twitterKey: "idle",
    instagramToken: "idle",
    youtubeKey: "idle",
    gumroadKey: "idle",
    emailKey: "idle",
  });

  async function handleAccountSave(account: typeof ACCOUNTS[number]) {
    setAccountStatus((s) => ({ ...s, [account.key]: "checking" }));
    const result = await account.test(accountValues[account.key].trim());
    setAccountStatus((s) => ({ ...s, [account.key]: result.connected ? "ok" : "error" }));
    if (result.connected) updateApiKeys({ [account.key]: accountValues[account.key].trim() });
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + (Platform.OS === "web" ? 67 : 8),
        paddingBottom: insets.bottom + 110,
        paddingHorizontal: 20,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>

      {/* ── On-device model ───────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>ON-DEVICE MODEL</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Downloads any GGUF model directly to your phone and runs it fully offline via llama.cpp.
          No API key needed once downloaded — zero cost, zero limits, zero internet required.
          Needs a native build (EAS Build), not Expo Go. Runs on CPU: expect ~10–15 tokens/sec on a modern Android.
        </Text>
        {SUPPORTED_MODELS.map((m) => {
          const isActive = activeModel === m.id;
          const isDownloading = downloadingId === m.id;
          return (
            <View key={m.id} style={[styles.modelRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modelLabel, { color: colors.foreground }]}>{m.label}</Text>
                {isDownloading && (
                  <View style={{ marginTop: 6 }}>
                    <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { backgroundColor: colors.primary, width: `${Math.round(downloadProgress * 100)}%` },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: colors.mutedForeground }]}>{downloadText}</Text>
                  </View>
                )}
              </View>
              {isActive ? (
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: colors.destructive + "22", borderColor: colors.destructive + "44" }]}
                  onPress={handleUnload}
                >
                  <Text style={[styles.smallBtnText, { color: colors.destructive }]}>Unload</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary + "44" }]}
                  disabled={isDownloading}
                  onPress={() => handleDownload(m.id)}
                >
                  <Text style={[styles.smallBtnText, { color: colors.primary }]}>
                    {isDownloading ? "…" : "Use this"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
        <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 10 }]}>
          {isModelLoaded()
            ? `On-device model active — agents will use it first, falling back to cloud only if it fails.`
            : "No model loaded — agents are using Gemini and Groq cloud APIs."}
        </Text>
      </View>

      {/* ── Gemini ─────────────────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CLOUD FALLBACK (GEMINI)</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.input, flex: 1 }]}
            value={geminiKey}
            onChangeText={(v) => { setGeminiKey(v); setGeminiStatus("idle"); }}
            placeholder="AIzaSy…"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <StatusButton status={geminiStatus} colors={colors} onPress={handleGeminiSave} />
        </View>
      </View>

      {/* ── Groq — free, fast, no credit card ──────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>GROQ (FREE — CODER AGENT + FALLBACK)</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Llama 3.3 70B via Groq's free LPU hardware — blazing fast, no credit card needed.
          Powers the Coder agent and backs up Gemini if its daily quota runs out.
          Get a free key at console.groq.com in about 30 seconds.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.input, flex: 1 }]}
            value={groqKey}
            onChangeText={(v) => { setGroqKey(v); setGroqStatus("idle"); }}
            placeholder="gsk_…"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <StatusButton status={groqStatus} colors={colors} onPress={handleGroqSave} />
        </View>
      </View>

      {/* ── Claude (Anthropic) — add later ─────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CLAUDE / ANTHROPIC (COMING LATER)</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.note, { color: colors.mutedForeground }]}>
          Claude Sonnet will power the Coder agent and quality reviewer at a higher capability level.
          Not needed now — Groq + Gemini cover everything for free.
          When you're ready: get a key at console.anthropic.com (new accounts get $5 free credit).
        </Text>
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { color: colors.foreground, borderColor: colors.input, flex: 1 }]}
            value={anthropicKey}
            onChangeText={(v) => { setAnthropicKey(v); setAnthropicStatus("idle"); }}
            placeholder="sk-ant-… (optional for now)"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <StatusButton status={anthropicStatus} colors={colors} onPress={handleAnthropicSave} />
        </View>
      </View>

      {/* ── Connected accounts ─────────────────────────────────────── */}
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>CONNECTED ACCOUNTS</Text>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {ACCOUNTS.map((account, i) => (
          <View key={account.key} style={[styles.accountRow, i > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
            <Text style={[styles.modelLabel, { color: colors.foreground, marginBottom: 6 }]}>{account.label}</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { color: colors.foreground, borderColor: colors.input, flex: 1 }]}
                value={accountValues[account.key]}
                onChangeText={(v) => {
                  setAccountValues((s) => ({ ...s, [account.key]: v }));
                  setAccountStatus((s) => ({ ...s, [account.key]: "idle" }));
                }}
                placeholder={account.placeholder}
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <StatusButton
                status={accountStatus[account.key]}
                colors={colors}
                onPress={() => handleAccountSave(account)}
              />
            </View>
          </View>
        ))}
        <Text style={[styles.note, { color: colors.mutedForeground, marginTop: 12 }]}>
          Only Twitter/X is wired to auto-publish on approval right now. Mailchimp and Gumroad
          need a list ID and price field respectively before auto-publish can be added safely —
          guessing those from generated text risks a wrong real-world send or listing.
        </Text>
      </View>
    </ScrollView>
  );
}

function StatusButton({
  status,
  colors,
  onPress,
}: {
  status: Status;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const icon = status === "ok" ? "check" : status === "error" ? "x" : status === "checking" ? "loader" : "send";
  const color = status === "ok" ? colors.success : status === "error" ? colors.destructive : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.testBtn, { backgroundColor: color + "22", borderColor: color + "44" }]}
      onPress={onPress}
      disabled={status === "checking"}
    >
      <Feather name={icon as any} size={16} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 26, fontWeight: "700", fontFamily: "Inter_700Bold", marginBottom: 18 },
  sectionLabel: { fontSize: 11, fontWeight: "700", fontFamily: "Inter_700Bold", letterSpacing: 0.6, marginBottom: 8, marginTop: 18 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  note: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  modelRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "transparent" },
  modelLabel: { fontSize: 14, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  smallBtnText: { fontSize: 12, fontWeight: "600", fontFamily: "Inter_600SemiBold" },
  progressTrack: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },
  progressText: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  testBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  accountRow: { paddingVertical: 10 },
});
