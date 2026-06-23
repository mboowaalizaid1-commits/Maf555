import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useApp } from "@/context/AppContext";
import { validateGeminiKey } from "@/services/LLMService";
import {
  testTwitterConnection,
  testInstagramConnection,
  testYouTubeConnection,
  testGumroadConnection,
  testMailchimpConnection,
} from "@/services/ApiService";

const TOTAL_STEPS = 6;

type ConnStatus = "pending" | "checking" | "ok" | "fail" | "none";

interface ConnState {
  gemini: ConnStatus;
  youtube: ConnStatus;
  twitter: ConnStatus;
  instagram: ConnStatus;
  email: ConnStatus;
  gumroad: ConnStatus;
}

const AGENT_DEFS = [
  { id: "social", name: "Social Agent", icon: "share-2", description: "Posts across platforms" },
  { id: "youtube", name: "YouTube Agent", icon: "youtube", description: "Video content" },
  { id: "newsletter", name: "Newsletter Agent", icon: "mail", description: "Email campaigns" },
  { id: "affiliate", name: "Affiliate Agent", icon: "link", description: "Affiliate content" },
  { id: "podcast", name: "Podcast Agent", icon: "mic", description: "Episode outlines" },
  { id: "digital", name: "Products Agent", icon: "package", description: "Digital products" },
] as const;

const AGENT_COLORS: Record<string, string> = {
  social: "#EC4899",
  youtube: "#EF4444",
  newsletter: "#3B82F6",
  affiliate: "#10B981",
  podcast: "#A855F7",
  digital: "#F59E0B",
};

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useApp();

  const [step, setStep] = useState(0);
  const [businessName, setBusinessName] = useState("");
  const [niche, setNiche] = useState("");
  const [tone, setTone] = useState<"professional" | "friendly" | "casual" | "bold">("professional");
  const [targetAudience, setTargetAudience] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiValidating, setGeminiValidating] = useState(false);
  const [geminiValid, setGeminiValid] = useState<boolean | null>(null);
  const [youtubeKey, setYoutubeKey] = useState("");
  const [twitterKey, setTwitterKey] = useState("");
  const [instagramToken, setInstagramToken] = useState("");
  const [emailKey, setEmailKey] = useState("");
  const [gumroadKey, setGumroadKey] = useState("");
  const [enabledAgents, setEnabledAgents] = useState<string[]>(["social", "youtube", "newsletter", "affiliate"]);
  const [launching, setLaunching] = useState(false);
  const [connState, setConnState] = useState<ConnState>({
    gemini: "pending",
    youtube: "none",
    twitter: "none",
    instagram: "none",
    email: "none",
    gumroad: "none",
  });

  async function runConnectionChecks() {
    const captured = {
      gemini: geminiKey.trim(),
      youtube: youtubeKey.trim(),
      twitter: twitterKey.trim(),
      instagram: instagramToken.trim(),
      email: emailKey.trim(),
      gumroad: gumroadKey.trim(),
    };

    setConnState({
      gemini: "checking",
      youtube: captured.youtube ? "checking" : "none",
      twitter: captured.twitter ? "checking" : "none",
      instagram: captured.instagram ? "checking" : "none",
      email: captured.email ? "checking" : "none",
      gumroad: captured.gumroad ? "checking" : "none",
    });

    // Gemini is required — test it first
    let geminiOk = false;
    if (captured.gemini) {
      geminiOk = await validateGeminiKey(captured.gemini);
    }
    setConnState((prev) => ({ ...prev, gemini: geminiOk ? "ok" : "fail" }));

    // Optional APIs in parallel (best-effort, don't block)
    const results = await Promise.allSettled([
      captured.youtube ? testYouTubeConnection(captured.youtube) : Promise.resolve(null),
      captured.twitter ? testTwitterConnection(captured.twitter) : Promise.resolve(null),
      captured.instagram ? testInstagramConnection(captured.instagram) : Promise.resolve(null),
      captured.email ? testMailchimpConnection(captured.email) : Promise.resolve(null),
      captured.gumroad ? testGumroadConnection(captured.gumroad) : Promise.resolve(null),
    ]);

    const resolve = (r: PromiseSettledResult<any>, hasKey: boolean): ConnStatus => {
      if (!hasKey) return "none";
      if (r.status === "fulfilled" && r.value?.connected) return "ok";
      return "fail";
    };

    setConnState((prev) => ({
      ...prev,
      youtube: resolve(results[0], !!captured.youtube),
      twitter: resolve(results[1], !!captured.twitter),
      instagram: resolve(results[2], !!captured.instagram),
      email: resolve(results[3], !!captured.email),
      gumroad: resolve(results[4], !!captured.gumroad),
    }));
  }

  function handleContinue() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 4) {
      setStep(5);
      runConnectionChecks();
    } else {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }
  }

  function prevStep() {
    if (step === 0) return;
    setStep((s) => s - 1);
  }

  async function handleValidateGemini() {
    if (!geminiKey.trim()) return;
    setGeminiValidating(true);
    setGeminiValid(null);
    try {
      const valid = await validateGeminiKey(geminiKey.trim());
      setGeminiValid(valid);
      if (valid) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setGeminiValid(false);
    } finally {
      setGeminiValidating(false);
    }
  }

  function toggleAgent(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEnabledAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  async function handleLaunch() {
    setLaunching(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await completeOnboarding(
      {
        businessName: businessName || "My Business",
        niche: niche || "Online Business",
        tone,
        targetAudience: targetAudience || "Entrepreneurs",
      },
      { geminiKey: geminiKey.trim(), youtubeKey, twitterKey, instagramToken, emailKey, gumroadKey },
      enabledAgents
    );
    router.replace("/(tabs)");
  }

  const canLaunch = step !== 5 || connState.gemini === "ok";
  const progress = (step / (TOTAL_STEPS - 1)) * 100;
  const isChecking = connState.gemini === "checking" || connState.youtube === "checking";

  // ─── styles ───────────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: insets.top + (Platform.OS === "web" ? 20 : 0),
    },
    progressTrack: {
      height: 2,
      backgroundColor: colors.border,
      marginHorizontal: 24,
      marginTop: 16,
      borderRadius: 1,
    },
    progressFill: { height: 2, backgroundColor: colors.primary, borderRadius: 1, width: `${progress}%` },
    content: { flex: 1, paddingHorizontal: 24, paddingTop: 28 },
    title: { fontSize: 28, fontWeight: "700", color: colors.foreground, fontFamily: "Inter_700Bold", marginBottom: 8, lineHeight: 34 },
    subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: "Inter_400Regular", marginBottom: 28, lineHeight: 20 },
    label: { fontSize: 13, color: colors.mutedForeground, fontFamily: "Inter_500Medium", marginBottom: 6, marginTop: 14 },
    input: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13, color: colors.foreground, fontSize: 15, fontFamily: "Inter_400Regular" },
    toneRow: { flexDirection: "row", gap: 6, marginTop: 6 },
    toneBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1 },
    toneTxt: { fontSize: 11, fontFamily: "Inter_500Medium" },
    keyRow: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "center" },
    keyInput: { flex: 1 },
    testBtn: { paddingHorizontal: 14, paddingVertical: 13, backgroundColor: colors.secondary, borderRadius: 12, minWidth: 52, alignItems: "center", justifyContent: "center" },
    testTxt: { fontSize: 13, color: colors.primary, fontFamily: "Inter_600SemiBold" },
    agentGrid: { gap: 9 },
    agentRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: 13, padding: 13, gap: 12, borderWidth: 1 },
    agentIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    agentMeta: { flex: 1 },
    agentName: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_600SemiBold" },
    agentDesc: { fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular" },
    footer: { paddingHorizontal: 24, paddingBottom: insets.bottom + 16, paddingTop: 12, flexDirection: "row", gap: 10 },
    backBtn: { width: 50, height: 54, borderRadius: 14, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    nextBtn: { flex: 1, height: 54, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    nextBtnDisabled: { backgroundColor: colors.muted },
    nextTxt: { fontSize: 16, fontWeight: "700", color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    bulletRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
    bulletDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
    bulletText: { fontSize: 14, color: colors.foreground, fontFamily: "Inter_400Regular", flex: 1 },
    welcomeIcon: { width: 76, height: 76, borderRadius: 22, backgroundColor: colors.primary + "22", alignItems: "center", justifyContent: "center", marginBottom: 20 },
    infoBox: { backgroundColor: colors.primary + "11", borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: "row", gap: 8, alignItems: "flex-start" },
    infoText: { color: colors.primary, fontSize: 12, flex: 1, fontFamily: "Inter_400Regular", lineHeight: 17 },
    connRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    connLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
    connDot: { width: 8, height: 8, borderRadius: 4 },
    connNote: { fontSize: 11, fontFamily: "Inter_400Regular" },
    requiredBadge: { fontSize: 10, color: colors.primary, fontFamily: "Inter_600SemiBold", backgroundColor: colors.primary + "22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    retryBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.destructive + "22", borderRadius: 8, borderWidth: 1, borderColor: colors.destructive + "44" },
    retryTxt: { fontSize: 11, color: colors.destructive, fontFamily: "Inter_600SemiBold" },
    warningBox: { backgroundColor: colors.destructive + "11", borderRadius: 10, padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12 },
    successBox: { backgroundColor: colors.success + "11", borderRadius: 10, padding: 12, flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12 },
  });

  function ConnRow({ label, status, required }: { label: string; status: ConnStatus; required?: boolean }) {
    const dotColor =
      status === "ok" ? colors.success :
      status === "fail" ? colors.destructive :
      status === "checking" ? colors.primary :
      status === "none" ? colors.muted :
      colors.muted;

    const note =
      status === "ok" ? "Connected" :
      status === "fail" ? "Failed" :
      status === "checking" ? "Checking…" :
      status === "none" ? "Not configured" :
      "—";

    return (
      <View style={s.connRow}>
        {status === "checking" ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ width: 16 }} />
        ) : (
          <Feather
            name={status === "ok" ? "check-circle" : status === "fail" ? "x-circle" : "circle"}
            size={16}
            color={dotColor}
          />
        )}
        <Text style={[s.connLabel, { color: status === "none" ? colors.mutedForeground : colors.foreground }]}>
          {label}
        </Text>
        {required && <Text style={s.requiredBadge}>Required</Text>}
        <Text style={[s.connNote, { color: dotColor }]}>{note}</Text>
      </View>
    );
  }

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <View style={{ flex: 1 }}>
            <View style={s.welcomeIcon}>
              <Feather name="layers" size={34} color={colors.primary} />
            </View>
            <Text style={s.title}>Your Personal{"\n"}AI Workforce</Text>
            <Text style={s.subtitle}>Six autonomous AI agents grow your online presence while you sleep.</Text>
            {[
              "Live ant colony shows your agents working in real time",
              "Powered by Gemini — runs on your own API key",
              "Approve or reject every piece of content before it publishes",
              "Connect your real accounts to enable auto-publishing",
            ].map((b) => (
              <View key={b} style={s.bulletRow}>
                <View style={s.bulletDot} />
                <Text style={s.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        );

      case 1:
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={s.title}>Brand DNA</Text>
            <Text style={s.subtitle}>Tell your agents about your business.</Text>
            <Text style={s.label}>Business Name</Text>
            <TextInput style={s.input} value={businessName} onChangeText={setBusinessName} placeholder="e.g. The Content Lab" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Niche</Text>
            <TextInput style={s.input} value={niche} onChangeText={setNiche} placeholder="e.g. Digital Marketing, Fitness, Finance" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Target Audience</Text>
            <TextInput style={s.input} value={targetAudience} onChangeText={setTargetAudience} placeholder="e.g. Solopreneurs aged 25-40" placeholderTextColor={colors.mutedForeground} />
            <Text style={s.label}>Tone of Voice</Text>
            <View style={s.toneRow}>
              {(["professional", "friendly", "casual", "bold"] as const).map((t) => (
                <TouchableOpacity key={t} style={[s.toneBtn, { backgroundColor: tone === t ? colors.primary + "22" : colors.card, borderColor: tone === t ? colors.primary : colors.border }]} onPress={() => setTone(t)}>
                  <Text style={[s.toneTxt, { color: tone === t ? colors.primary : colors.mutedForeground }]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        );

      case 2:
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={s.title}>Connect Accounts</Text>
            <Text style={s.subtitle}>Optional — add API keys to enable real publishing.</Text>
            {[
              { key: "youtubeKey", label: "YouTube Data API v3 Key", value: youtubeKey, set: setYoutubeKey, ph: "AIzaSy…" },
              { key: "twitterKey", label: "X / Twitter Bearer Token", value: twitterKey, set: setTwitterKey, ph: "AAAA…" },
              { key: "instagramToken", label: "Instagram Graph Access Token", value: instagramToken, set: setInstagramToken, ph: "EAA…" },
              { key: "emailKey", label: "Mailchimp API Key", value: emailKey, set: setEmailKey, ph: "abc123-us1" },
              { key: "gumroadKey", label: "Gumroad Access Token", value: gumroadKey, set: setGumroadKey, ph: "your-token" },
            ].map((item) => (
              <View key={item.key}>
                <Text style={s.label}>{item.label}</Text>
                <TextInput style={[s.input]} value={item.value} onChangeText={item.set} placeholder={item.ph} placeholderTextColor={colors.mutedForeground} secureTextEntry autoCapitalize="none" autoCorrect={false} />
              </View>
            ))}
          </ScrollView>
        );

      case 3:
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={s.title}>AI Engine</Text>
            <Text style={s.subtitle}>Your agents think with Gemini 2.0 Flash. On-device Llama requires a native build.</Text>
            <View style={s.infoBox}>
              <Feather name="info" size={13} color={colors.primary} style={{ marginTop: 1 }} />
              <Text style={s.infoText}>Get a free key at aistudio.google.com — generous free tier, no credit card needed.</Text>
            </View>
            <Text style={s.label}>Gemini API Key <Text style={{ color: colors.destructive }}>*required</Text></Text>
            <View style={s.keyRow}>
              <TextInput style={[s.input, s.keyInput]} value={geminiKey} onChangeText={(v) => { setGeminiKey(v); setGeminiValid(null); }} placeholder="AIzaSy…" placeholderTextColor={colors.mutedForeground} secureTextEntry autoCapitalize="none" autoCorrect={false} />
              <TouchableOpacity style={[s.testBtn, { backgroundColor: geminiValid === true ? colors.success + "22" : colors.secondary }]} onPress={handleValidateGemini} disabled={geminiValidating || !geminiKey.trim()}>
                {geminiValidating ? (<ActivityIndicator size="small" color={colors.primary} />)
                  : geminiValid === true ? (<Feather name="check" size={18} color={colors.success} />)
                  : geminiValid === false ? (<Feather name="x" size={18} color={colors.destructive} />)
                  : (<Text style={s.testTxt}>Test</Text>)}
              </TouchableOpacity>
            </View>
            {geminiValid === true && <Text style={{ color: colors.success, fontSize: 12, marginTop: 6, fontFamily: "Inter_500Medium" }}>Key verified — agents are ready to think.</Text>}
            {geminiValid === false && <Text style={{ color: colors.destructive, fontSize: 12, marginTop: 6, fontFamily: "Inter_400Regular" }}>Invalid key or request failed. Check and retry.</Text>}

            <View style={[s.infoBox, { marginTop: 20 }]}>
              <Feather name="cpu" size={13} color={colors.mutedForeground} style={{ marginTop: 1 }} />
              <Text style={[s.infoText, { color: colors.mutedForeground }]}>On-device inference (Llama 3.2, Qwen 2.5, or Phi-3.5) is wired in but requires a native Android/iOS build — manage it in Settings once you have one installed. The Gemini key powers the app right now.</Text>
            </View>
          </ScrollView>
        );

      case 4:
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={s.title}>Build Your Colony</Text>
            <Text style={s.subtitle}>Choose which agents to activate. Toggle anytime later.</Text>
            <View style={s.agentGrid}>
              {AGENT_DEFS.map((def) => {
                const isEnabled = enabledAgents.includes(def.id);
                const color = AGENT_COLORS[def.id] ?? colors.primary;
                return (
                  <TouchableOpacity key={def.id} style={[s.agentRow, { borderColor: isEnabled ? color + "44" : colors.border, backgroundColor: isEnabled ? color + "0A" : colors.card }]} onPress={() => toggleAgent(def.id)}>
                    <View style={[s.agentIcon, { backgroundColor: isEnabled ? color + "22" : colors.secondary }]}>
                      <Feather name={def.icon as any} size={17} color={isEnabled ? color : colors.mutedForeground} />
                    </View>
                    <View style={s.agentMeta}>
                      <Text style={[s.agentName, { color: isEnabled ? colors.foreground : colors.mutedForeground }]}>{def.name}</Text>
                      <Text style={s.agentDesc}>{def.description}</Text>
                    </View>
                    <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: isEnabled ? color : "transparent", borderWidth: 2, borderColor: isEnabled ? color : colors.border, alignItems: "center", justifyContent: "center" }}>
                      {isEnabled && <Feather name="check" size={12} color={colors.card} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        );

      case 5:
        return (
          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
            <Text style={s.title}>System Check</Text>
            <Text style={s.subtitle}>Verifying all connections before your colony launches.</Text>

            <View style={{ backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
              <ConnRow label="Gemini AI Engine" status={connState.gemini} required />
              <ConnRow label="YouTube API" status={connState.youtube} />
              <ConnRow label="X / Twitter" status={connState.twitter} />
              <ConnRow label="Instagram" status={connState.instagram} />
              <ConnRow label="Email (Mailchimp)" status={connState.email} />
              <ConnRow label="Gumroad" status={connState.gumroad} />
            </View>

            {connState.gemini === "ok" && (
              <View style={s.successBox}>
                <Feather name="check-circle" size={14} color={colors.success} style={{ marginTop: 1 }} />
                <Text style={{ color: colors.success, fontSize: 13, flex: 1, fontFamily: "Inter_500Medium", lineHeight: 18 }}>
                  AI Engine connected. Your colony is ready to launch.{"\n"}
                  <Text style={{ fontWeight: "normal", opacity: 0.8 }}>
                    {enabledAgents.length} agent{enabledAgents.length !== 1 ? "s" : ""} will activate on launch.
                  </Text>
                </Text>
              </View>
            )}

            {connState.gemini === "fail" && !isChecking && (
              <View style={s.warningBox}>
                <Feather name="alert-circle" size={14} color={colors.destructive} style={{ marginTop: 1 }} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={{ color: colors.destructive, fontSize: 13, fontFamily: "Inter_500Medium", lineHeight: 18 }}>
                    Gemini AI Engine failed. Your agents need it to work.
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity style={s.retryBtn} onPress={() => setStep(3)}>
                      <Text style={s.retryTxt}>Update Key</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.retryBtn, { borderColor: colors.primary + "44", backgroundColor: colors.primary + "11" }]} onPress={runConnectionChecks}>
                      <Text style={[s.retryTxt, { color: colors.primary }]}>Retry</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        );

      default:
        return null;
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.progressTrack}>
        <View style={s.progressFill} />
      </View>
      <View style={s.content}>{renderStep()}</View>
      <View style={s.footer}>
        {step > 0 && (
          <TouchableOpacity style={s.backBtn} onPress={prevStep}>
            <Feather name="arrow-left" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.nextBtn, (!canLaunch || launching) && s.nextBtnDisabled]}
          onPress={step === TOTAL_STEPS - 1 ? handleLaunch : handleContinue}
          disabled={!canLaunch || launching || isChecking}
        >
          {launching || isChecking ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={s.nextTxt}>
              {step === TOTAL_STEPS - 1
                ? canLaunch
                  ? "Launch Colony"
                  : "Checking connections…"
                : step === 0
                ? "Get Started"
                : "Continue"}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
