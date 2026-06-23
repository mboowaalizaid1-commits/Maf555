import * as FileSystem from "expo-file-system";
import { initLlama } from "llama.rn";
import { FABLE_5_PROMPT } from "./AgentPrompt";

// ─────────────────────────────────────────────────────────────────────────────
// ON-DEVICE INFERENCE — llama.rn wrapping the real llama.cpp engine
//
// Package: llama.rn (mybigday, MIT license)
// npm: https://www.npmjs.com/package/llama.rn
// GitHub: https://github.com/mybigday/llama.rn
//
// Supports any GGUF model from Hugging Face.
// Works with EAS Build — no Android Studio or NDK setup needed.
// CPU inference on Android: ~10-20 tokens/sec on a modern phone with a 3B Q4 model.
// That's slow for live chat but perfectly fine for background content generation.
// ─────────────────────────────────────────────────────────────────────────────

// The models directory lives in the app's private documents folder.
// Android won't let other apps read it, and it persists across updates.
const MODELS_DIR = FileSystem.documentDirectory + "models/";

// Stop tokens covering Llama 3, Qwen, Phi, Mistral, and most other GGUF models.
const STOP_WORDS = [
  "</s>", "<|end|>", "<|eot_id|>", "<|end_of_text|>",
  "<|im_end|>", "<|EOT|>", "<|END_OF_TURN_TOKEN|>",
  "<|end_of_turn|>", "<|endoftext|>",
];

// ── Model catalog ──────────────────────────────────────────────────────────
// Direct download URLs from bartowski's quantized GGUF repos on Hugging Face.
// These don't require a HF account or API token.
// Always use Q4_K_M — best quality-to-size tradeoff for mobile.
export const SUPPORTED_MODELS = [
  {
    id: "qwen2.5-0.5b",
    label: "Qwen 2.5 0.5B — Fastest (~400 MB, needs 1 GB RAM)",
    filename: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
    sizeBytes: 400_000_000,
    minRamMB: 1000,
  },
  {
    id: "llama3.2-1b",
    label: "Llama 3.2 1B — Fast (~800 MB, needs 2 GB RAM)",
    filename: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    sizeBytes: 800_000_000,
    minRamMB: 2000,
  },
  {
    id: "llama3.2-3b",
    label: "Llama 3.2 3B — Recommended (~2 GB, needs 4 GB RAM)",
    filename: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    sizeBytes: 2_000_000_000,
    minRamMB: 4000,
  },
  {
    id: "phi3.5-mini",
    label: "Phi-3.5 Mini — Best quality (~2.3 GB, needs 5 GB RAM)",
    filename: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    url: "https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf",
    sizeBytes: 2_300_000_000,
    minRamMB: 5000,
  },
] as const;

export type ModelId = typeof SUPPORTED_MODELS[number]["id"];

// ── Runtime state ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _llamaContext: any = null;
let _activeModelId: ModelId | null = null;

// ── File helpers ───────────────────────────────────────────────────────────

export async function getModelPath(filename: string): Promise<string> {
  return MODELS_DIR + filename;
}

export async function isModelDownloaded(filename: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(MODELS_DIR + filename);
    return info.exists;
  } catch {
    return false;
  }
}

// ── Download ───────────────────────────────────────────────────────────────

export async function downloadModel(
  modelId: ModelId,
  onProgress?: (progress: number, text: string) => void
): Promise<boolean> {
  const model = SUPPORTED_MODELS.find((m) => m.id === modelId);
  if (!model) throw new Error(`Unknown model id: ${modelId}`);

  try {
    // Ensure the models directory exists
    await FileSystem.makeDirectoryAsync(MODELS_DIR, { intermediates: true });

    const destPath = MODELS_DIR + model.filename;

    // If already downloaded, just load it
    const info = await FileSystem.getInfoAsync(destPath);
    if (info.exists) {
      onProgress?.(0.95, "Model already downloaded — loading…");
      return await loadModel(modelId);
    }

    onProgress?.(0, `Starting download — ${model.label}`);

    const downloadResumable = FileSystem.createDownloadResumable(
      model.url,
      destPath,
      {},
      ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
        if (totalBytesExpectedToWrite > 0) {
          const p = totalBytesWritten / totalBytesExpectedToWrite;
          const mb = Math.round(totalBytesWritten / 1_000_000);
          const totalMb = Math.round(totalBytesExpectedToWrite / 1_000_000);
          onProgress?.(p * 0.9, `Downloading… ${mb} / ${totalMb} MB`);
        }
      }
    );

    await downloadResumable.downloadAsync();
    onProgress?.(0.9, "Download complete — loading model into memory…");
    return await loadModel(modelId);
  } catch (e: any) {
    onProgress?.(0, `Failed: ${e?.message ?? "Unknown error"}`);
    return false;
  }
}

// ── Load ───────────────────────────────────────────────────────────────────

export async function loadModel(modelId: ModelId): Promise<boolean> {
  const model = SUPPORTED_MODELS.find((m) => m.id === modelId);
  if (!model) return false;

  try {
    // Release any previously loaded model first
    if (_llamaContext) {
      await _llamaContext.release();
      _llamaContext = null;
      _activeModelId = null;
    }

    const modelPath = "file://" + MODELS_DIR + model.filename;

    _llamaContext = await initLlama({
      model: modelPath,
      use_mlock: false,     // Don't pin in RAM — let Android manage memory
      n_ctx: 2048,          // Context window — sufficient for content generation
      n_batch: 512,
      n_gpu_layers: 0,      // CPU only on Android — GPU support is improving but not stable
    });

    _activeModelId = modelId;
    return true;
  } catch (e: any) {
    console.error("llama.rn loadModel failed:", e?.message);
    _llamaContext = null;
    _activeModelId = null;
    return false;
  }
}

export async function unloadModel(): Promise<void> {
  if (_llamaContext) {
    await _llamaContext.release();
    _llamaContext = null;
    _activeModelId = null;
  }
}

export function isModelLoaded(): boolean {
  return _llamaContext !== null;
}

export function getActiveModelId(): ModelId | null {
  return _activeModelId;
}

// ── Inference ──────────────────────────────────────────────────────────────

export async function generateWithLlama(
  messages: { role: string; content: string }[]
): Promise<string> {
  if (!_llamaContext) {
    throw new Error("No model loaded — call loadModel() first or use cloud inference.");
  }

  const result = await _llamaContext.completion(
    {
      messages,
      n_predict: 700,
      temperature: 0.8,
      top_k: 40,
      top_p: 0.95,
      stop: STOP_WORDS,
    }
  );

  const text = result?.text?.trim();
  if (!text) throw new Error("llama.rn returned empty output.");
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// GEMINI CLOUD API — primary free cloud fallback
// Google AI Studio free tier: 1,500 req/day, 1M tokens/min
// Get a key at aistudio.google.com — no credit card required.
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export async function generateWithGemini(
  prompt: string,
  apiKey: string,
  systemInstruction?: string
): Promise<string> {
  if (!apiKey?.trim()) {
    throw new Error("No Gemini API key configured. Add one in Settings.");
  }

  const combinedSystem = [FABLE_5_PROMPT, systemInstruction].filter(Boolean).join("\n\n");

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: combinedSystem }] },
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 900 },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  if (!apiKey.trim()) return false;
  try {
    const r = await generateWithGemini("Reply with the single word: ready", apiKey);
    return r.length > 0;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GROQ API — secondary free cloud (Llama 3.3 70B via LPU hardware)
// Free tier: 30 RPM, 1,000 req/day — console.groq.com, no credit card.
// ─────────────────────────────────────────────────────────────────────────────

export async function generateWithGroq(
  prompt: string,
  apiKey: string,
  systemInstruction?: string
): Promise<string> {
  if (!apiKey?.trim()) throw new Error("No Groq API key configured.");

  const combinedSystem = [FABLE_5_PROMPT, systemInstruction].filter(Boolean).join("\n\n");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: combinedSystem },
        { role: "user", content: prompt },
      ],
      max_tokens: 900,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned an empty response.");
  return text;
}

export async function validateGroqKey(apiKey: string): Promise<boolean> {
  if (!apiKey.trim()) return false;
  try {
    const r = await generateWithGroq("Reply with the single word: ready", apiKey);
    return r.length > 0;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANTHROPIC API — Claude Sonnet (add later when ready)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateWithClaude(
  userPrompt: string,
  anthropicApiKey: string,
  systemPrompt?: string
): Promise<string> {
  if (!anthropicApiKey?.trim()) throw new Error("No Anthropic API key configured.");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt ? `${FABLE_5_PROMPT}\n\n${systemPrompt}` : FABLE_5_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Claude returned an empty response.");
  return text;
}

export async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  if (!apiKey.trim()) return false;
  try {
    const r = await generateWithClaude("Reply with the single word: ready", apiKey);
    return r.length > 0;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART CLOUD ROUTER — tries providers in order, never hard-fails silently
// Priority: Gemini → Groq → Claude
// ─────────────────────────────────────────────────────────────────────────────

export async function callCloud(
  prompt: string,
  systemInstruction: string,
  keys: { geminiKey?: string; groqKey?: string; anthropicKey?: string }
): Promise<string> {
  const errors: string[] = [];

  if (keys.geminiKey) {
    try { return await generateWithGemini(prompt, keys.geminiKey, systemInstruction); }
    catch (e: any) { errors.push(`Gemini: ${e?.message}`); }
  }
  if (keys.groqKey) {
    try { return await generateWithGroq(prompt, keys.groqKey, systemInstruction); }
    catch (e: any) { errors.push(`Groq: ${e?.message}`); }
  }
  if (keys.anthropicKey) {
    try { return await generateWithClaude(prompt, keys.anthropicKey, systemInstruction); }
    catch (e: any) { errors.push(`Claude: ${e?.message}`); }
  }

  throw new Error(`All cloud providers failed:\n${errors.join("\n")}\n\nCheck your API keys in Settings.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// AGENT INFERENCE ROUTER
// Priority: llama.rn on-device → Gemini → Groq → Claude
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_SYSTEM: Record<string, string> = {
  social:     "You are a social media strategist. Craft platform-native posts that hook, engage, and convert.",
  youtube:    "You are a YouTube content strategist. Write video briefs that rank and retain viewers.",
  newsletter: "You are an email marketing expert. Write newsletters that subscribers look forward to.",
  affiliate:  "You are an affiliate marketing specialist. Find and frame products authentically.",
  podcast:    "You are a podcast producer. Create episode outlines that flow naturally in conversation.",
  digital:    "You are a digital product creator. Turn expertise into sellable digital assets.",
  coder:      "You are an expert software engineer. Write clean, well-commented, production-ready code. Never invent library names or API methods that don't exist.",
};

const AGENT_PROMPT: Record<string, (brand: string, niche: string, audience: string) => string> = {
  social:     (b, n, a) => `Create 3 scroll-stopping social media posts for ${b} in the ${n} niche targeting ${a}. Each post needs: hook (first line), body (value), CTA. Format as Post 1, Post 2, Post 3.`,
  youtube:    (b, n, a) => `For ${b}: write one high-value YouTube video brief. Include: viral title option, 3-sentence SEO description, thumbnail concept, 5 talking points, hook for the first 30 seconds. Target: ${a} in ${n}.`,
  newsletter: (b, n, a) => `Write a weekly email newsletter for ${b} subscribers (${a} in ${n}). Include: curiosity-gap subject line, preview text, 3 short sections with personality, and a P.S. with soft CTA.`,
  affiliate:  (b, n, a) => `For ${b} (${n} niche, targeting ${a}): recommend 3 affiliate products. For each: product name, why it genuinely helps, a natural one-paragraph review, and disclosure language.`,
  podcast:    (b, n, a) => `Create a podcast episode for ${b}. Target: ${a} in ${n}. Include: title, 60-second intro script, 4 main segments with talking points, opening hook question, listener takeaway.`,
  digital:    (b, n, a) => `Ideate a digital product for ${b} (${n}, ${a}). Include: product name and format, one-sentence transformation promise, 5 section titles, suggested price point, 3-sentence sales pitch.`,
  coder:      (b, n, a) => `You are the coding assistant for ${b}. Help with coding tasks related to their ${n} business targeting ${a}. Ask clarifying questions if the task is ambiguous.`,
};

export async function runAgentLLM(
  agentId: string,
  brandName: string,
  niche: string,
  tone: string,
  targetAudience: string,
  geminiApiKey: string
): Promise<string> {
  const system = `${AGENT_SYSTEM[agentId] ?? "You are an AI assistant."} Tone: ${tone}. Brand: ${brandName}.`;
  const promptFn = AGENT_PROMPT[agentId];
  const userPrompt = promptFn ? promptFn(brandName, niche, targetAudience) : `Generate high-quality content for ${brandName}.`;

  if (isModelLoaded()) {
    try {
      return await generateWithLlama([
        { role: "system", content: `${FABLE_5_PROMPT}\n\n${system}` },
        { role: "user", content: userPrompt },
      ]);
    } catch { /* fall through to cloud */ }
  }

  return generateWithGemini(userPrompt, geminiApiKey, system);
}

// ── Quality reviewer ───────────────────────────────────────────────────────

export async function reviewAgentOutput(
  agentId: string,
  agentOutput: string,
  brandName: string,
  niche: string,
  keys: { geminiKey?: string; groqKey?: string; anthropicKey?: string }
): Promise<{ approved: boolean; feedback: string }> {
  const hasAnyKey = keys.geminiKey || keys.groqKey || keys.anthropicKey;
  if (!hasAnyKey) return { approved: true, feedback: "" };

  const reviewPrompt = `Review this ${agentId} agent output for brand "${brandName}" (${niche} niche).

--- OUTPUT ---
${agentOutput}
--- END ---

Respond with JSON only (no markdown):
{"approved": true/false, "feedback": "one or two sentences"}

Reject if: fabricated specific facts, near-verbatim source reproduction, or genuinely low quality.`;

  try {
    const raw = await callCloud(reviewPrompt, "You are a strict content quality reviewer. Respond only with valid JSON.", keys);
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return { approved: Boolean(parsed.approved), feedback: String(parsed.feedback ?? "") };
  } catch {
    return { approved: true, feedback: "" };
  }
}

// ── Main router with review ────────────────────────────────────────────────

export async function runAgentLLMWithReview(
  agentId: string,
  brandName: string,
  niche: string,
  tone: string,
  targetAudience: string,
  geminiApiKey: string,
  groqApiKey: string,
  anthropicApiKey: string
): Promise<{ output: string; reviewFeedback: string; reviewApproved: boolean }> {
  const keys = { geminiKey: geminiApiKey, groqKey: groqApiKey, anthropicKey: anthropicApiKey };
  const system = `${AGENT_SYSTEM[agentId] ?? "You are an AI assistant."} Tone: ${tone}. Brand: ${brandName}.`;
  const promptFn = AGENT_PROMPT[agentId];
  const userPrompt = promptFn ? promptFn(brandName, niche, targetAudience) : `Generate content for ${brandName}.`;

  let output: string;

  if (agentId === "coder") {
    // Coder: Groq first (fastest for code) → Gemini → Claude
    try {
      output = await callCloud(userPrompt, system, { groqKey: groqApiKey, anthropicKey: anthropicApiKey });
    } catch {
      output = await callCloud(userPrompt, system, { geminiKey: geminiApiKey });
    }
  } else if (isModelLoaded()) {
    // On-device first
    try {
      output = await generateWithLlama([
        { role: "system", content: `${FABLE_5_PROMPT}\n\n${system}` },
        { role: "user", content: userPrompt },
      ]);
      const { approved, feedback } = await reviewAgentOutput(agentId, output, brandName, niche, keys);
      return { output, reviewFeedback: feedback, reviewApproved: approved };
    } catch {
      output = await callCloud(userPrompt, system, keys);
    }
  } else {
    output = await callCloud(userPrompt, system, keys);
  }

  const { approved, feedback } = agentId !== "coder"
    ? await reviewAgentOutput(agentId, output, brandName, niche, keys)
    : { approved: true, feedback: "" };

  return { output, reviewFeedback: feedback, reviewApproved: approved };
}
