import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { runAgentLLMWithReview } from "@/services/LLMService";
import { postTweet } from "@/services/ApiService";

export type AgentStatus = "IDLE" | "WORKING" | "MOVING" | "DELIVERING";

export interface AgentState {
  id: string;
  name: string;
  description: string;
  color: string;
  chamberId: string;
  status: AgentStatus;
  progress: number;
  enabled: boolean;
  lastRun: number | null;
  taskCount: number;
}

export interface Task {
  id: string;
  agentId: string;
  agentName: string;
  type: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  scheduledAt: number;
  completedAt: number | null;
  result: string | null;
  requiresApproval: boolean;
  reviewFeedback: string | null;   // Claude's review comment, shown in the approval card
  reviewApproved: boolean | null;  // null = not reviewed, true/false = Claude's verdict
}

export interface BrandDNA {
  businessName: string;
  niche: string;
  tone: "professional" | "friendly" | "casual" | "bold";
  targetAudience: string;
}

export interface ApiKeys {
  geminiKey: string;
  groqKey: string;       // Groq free tier — Llama 3.3 70B, console.groq.com
  anthropicKey: string;  // Claude Sonnet — reserved for later, console.anthropic.com
  youtubeKey: string;
  twitterKey: string;
  instagramToken: string;
  emailKey: string;
  gumroadKey: string;
}

interface AppState {
  loading: boolean;
  onboardingComplete: boolean;
  brand: BrandDNA;
  agents: AgentState[];
  tasks: Task[];
  apiKeys: Partial<ApiKeys>;
}

interface AppContextType {
  state: AppState;
  completeOnboarding: (brand: BrandDNA, keys: Partial<ApiKeys>, enabledAgents: string[]) => Promise<void>;
  runAgent: (agentId: string) => Promise<void>;
  approveTask: (taskId: string) => void;
  rejectTask: (taskId: string) => void;
  updateAgentEnabled: (agentId: string, enabled: boolean) => void;
  updateApiKeys: (keys: Partial<ApiKeys>) => void;
  resetOnboarding: () => Promise<void>;
}

export const DEFAULT_AGENTS: AgentState[] = [
  {
    id: "social",
    name: "Social Agent",
    description: "Crafts & schedules social media posts across platforms",
    color: "#EC4899",
    chamberId: "workshop1",
    status: "IDLE",
    progress: 0,
    enabled: true,
    lastRun: null,
    taskCount: 0,
  },
  {
    id: "youtube",
    name: "YouTube Agent",
    description: "Generates video titles, descriptions & scripts",
    color: "#EF4444",
    chamberId: "workshop2",
    status: "IDLE",
    progress: 0,
    enabled: true,
    lastRun: null,
    taskCount: 0,
  },
  {
    id: "newsletter",
    name: "Newsletter Agent",
    description: "Writes email newsletters and sequences",
    color: "#3B82F6",
    chamberId: "nursery",
    status: "IDLE",
    progress: 0,
    enabled: true,
    lastRun: null,
    taskCount: 0,
  },
  {
    id: "affiliate",
    name: "Affiliate Agent",
    description: "Finds products and creates affiliate content",
    color: "#10B981",
    chamberId: "foodStore",
    status: "IDLE",
    progress: 0,
    enabled: true,
    lastRun: null,
    taskCount: 0,
  },
  {
    id: "podcast",
    name: "Podcast Agent",
    description: "Researches topics and writes episode outlines",
    color: "#A855F7",
    chamberId: "exit1",
    status: "IDLE",
    progress: 0,
    enabled: false,
    lastRun: null,
    taskCount: 0,
  },
  {
    id: "digital",
    name: "Products Agent",
    description: "Creates digital product descriptions & sales copy",
    color: "#F59E0B",
    chamberId: "exit2",
    status: "IDLE",
    progress: 0,
    enabled: false,
    lastRun: null,
    taskCount: 0,
  },
  {
    id: "coder",
    name: "Coder Agent",
    description: "Writes, reviews, and debugs code using Claude Sonnet via Anthropic API",
    color: "#22D3EE",
    chamberId: "workshop3",
    status: "IDLE",
    progress: 0,
    enabled: false,
    lastRun: null,
    taskCount: 0,
  },
];

const DEFAULT_BRAND: BrandDNA = {
  businessName: "My Business",
  niche: "Online Business",
  tone: "professional",
  targetAudience: "Entrepreneurs",
};

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  ONBOARDING: "app:onboarding_complete",
  BRAND: "app:brand",
  AGENTS: "app:agents",
  TASKS: "app:tasks",
  API_KEYS: "app:api_keys",
};

function makeId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>({
    loading: true,
    onboardingComplete: false,
    brand: DEFAULT_BRAND,
    agents: DEFAULT_AGENTS,
    tasks: [],
    apiKeys: {},
  });

  const saveQueue = useRef<Partial<AppState>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((partial: Partial<AppState>) => {
    saveQueue.current = { ...saveQueue.current, ...partial };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const q = saveQueue.current;
      saveQueue.current = {};
      if (q.onboardingComplete !== undefined) {
        await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, JSON.stringify(q.onboardingComplete));
      }
      if (q.brand) await AsyncStorage.setItem(STORAGE_KEYS.BRAND, JSON.stringify(q.brand));
      if (q.agents) await AsyncStorage.setItem(STORAGE_KEYS.AGENTS, JSON.stringify(q.agents));
      if (q.tasks) await AsyncStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(q.tasks));
      if (q.apiKeys) await AsyncStorage.setItem(STORAGE_KEYS.API_KEYS, JSON.stringify(q.apiKeys));
    }, 300);
  }, []);

  useEffect(() => {
    async function loadState() {
      try {
        const [onboarding, brand, agents, tasks, keys] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
          AsyncStorage.getItem(STORAGE_KEYS.BRAND),
          AsyncStorage.getItem(STORAGE_KEYS.AGENTS),
          AsyncStorage.getItem(STORAGE_KEYS.TASKS),
          AsyncStorage.getItem(STORAGE_KEYS.API_KEYS),
        ]);
        setState((prev) => ({
          ...prev,
          loading: false,
          onboardingComplete: onboarding ? JSON.parse(onboarding) : false,
          brand: brand ? JSON.parse(brand) : DEFAULT_BRAND,
          agents: agents ? JSON.parse(agents) : DEFAULT_AGENTS,
          tasks: tasks ? JSON.parse(tasks) : [],
          apiKeys: keys ? JSON.parse(keys) : {},
        }));
      } catch {
        setState((prev) => ({ ...prev, loading: false }));
      }
    }
    loadState();
  }, []);

  const completeOnboarding = useCallback(
    async (brand: BrandDNA, keys: Partial<ApiKeys>, enabledAgents: string[]) => {
      const updatedAgents = DEFAULT_AGENTS.map((a) => ({
        ...a,
        enabled: enabledAgents.includes(a.id),
      }));
      const newState = {
        onboardingComplete: true,
        brand,
        agents: updatedAgents,
        apiKeys: keys,
      };
      setState((prev) => ({ ...prev, ...newState }));
      scheduleSave(newState);
    },
    [scheduleSave]
  );

  const runAgent = useCallback(
    async (agentId: string) => {
      setState((prev) => {
        const agents = prev.agents.map((a) =>
          a.id === agentId ? { ...a, status: "MOVING" as AgentStatus, progress: 0 } : a
        );
        return { ...prev, agents };
      });

      const agentDef = DEFAULT_AGENTS.find((a) => a.id === agentId);
      const taskId = makeId();
      const newTask: Task = {
        id: taskId,
        agentId,
        agentName: agentDef?.name ?? agentId,
        type: agentId,
        title: `${agentDef?.name ?? agentId} run`,
        status: "running",
        scheduledAt: Date.now(),
        completedAt: null,
        result: null,
        requiresApproval: true,
        reviewFeedback: null,
        reviewApproved: null,
      };

      setState((prev) => {
        const tasks = [newTask, ...prev.tasks];
        scheduleSave({ tasks });
        return { ...prev, tasks };
      });

      // Brief travel-out animation before work actually starts.
      await new Promise((r) => setTimeout(r, 600));
      setState((prev) => {
        const agents = prev.agents.map((a) =>
          a.id === agentId ? { ...a, status: "WORKING" as AgentStatus, progress: 0 } : a
        );
        return { ...prev, agents };
      });

      const progressInterval = setInterval(() => {
        setState((prev) => {
          const agents = prev.agents.map((a) => {
            if (a.id !== agentId) return a;
            const next = Math.min(a.progress + 9, 90);
            return { ...a, progress: next, status: "WORKING" as AgentStatus };
          });
          return { ...prev, agents };
        });
      }, 500);

      let resultContent: string;
      let reviewFeedback: string = "";
      let reviewApproved: boolean = true;
      let failed = false;

      try {
        const { output, reviewFeedback: rf, reviewApproved: ra } = await runAgentLLMWithReview(
          agentId,
          state.brand.businessName,
          state.brand.niche,
          state.brand.tone,
          state.brand.targetAudience,
          state.apiKeys.geminiKey ?? "",
          state.apiKeys.groqKey ?? "",
          state.apiKeys.anthropicKey ?? ""
        );
        resultContent = output;
        reviewFeedback = rf;
        reviewApproved = ra;
      } catch (e: any) {
        failed = true;
        resultContent =
          e?.message ??
          "Generation failed — check your API keys in Settings, or set up on-device inference.";
      } finally {
        clearInterval(progressInterval);
      }

      if (!failed) {
        setState((prev) => {
          const agents = prev.agents.map((a) =>
            a.id === agentId ? { ...a, status: "DELIVERING" as AgentStatus, progress: 100 } : a
          );
          return { ...prev, agents };
        });
        await new Promise((r) => setTimeout(r, 600));
      }

      setState((prev) => {
        const agents = prev.agents.map((a) =>
          a.id === agentId
            ? {
                ...a,
                status: "IDLE" as AgentStatus,
                progress: 0,
                lastRun: Date.now(),
                taskCount: failed ? a.taskCount : a.taskCount + 1,
              }
            : a
        );
        const tasks = prev.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: (failed ? "failed" : "awaiting_approval") as Task["status"],
                completedAt: Date.now(),
                result: resultContent,
                reviewFeedback: reviewFeedback || null,
                reviewApproved: failed ? null : reviewApproved,
              }
            : t
        );
        scheduleSave({ agents, tasks });
        return { ...prev, agents, tasks };
      });
    },
    [scheduleSave, state.brand, state.apiKeys.geminiKey, state.apiKeys.groqKey, state.apiKeys.anthropicKey]
  );

  // "Approve & Publish" only auto-publishes where a real, safe integration
  // exists today. Social → Twitter is wired because the content is plain
  // text and the API call is unambiguous. Newsletter (Mailchimp) and Digital
  // (Gumroad) are deliberately NOT auto-published here: doing so would mean
  // guessing a Mailchimp list ID or a Gumroad price by regex-parsing freeform
  // LLM text, which risks silently creating a real, wrong product listing or
  // email send. Those need real structured fields in Settings first — see
  // the TODO there. YouTube/Affiliate/Podcast have no publish target at all
  // in this build (no video/blog pipeline yet), so they're correctly never
  // auto-published.
  const approveTask = useCallback(
    async (taskId: string) => {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;

      let publishError: string | null = null;

      if (task.agentId === "social" && state.apiKeys.twitterKey && task.result) {
        try {
          const firstPost = task.result.split(/Post\s*2/i)[0].replace(/Post\s*1\s*:?/i, "").trim();
          const text = firstPost.length > 0 ? firstPost.slice(0, 280) : task.result.slice(0, 280);
          await postTweet(text, state.apiKeys.twitterKey);
        } catch (e: any) {
          publishError = e?.message ?? "Failed to post to Twitter/X.";
        }
      }

      setState((prev) => {
        const tasks = prev.tasks.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status: (publishError ? "failed" : "completed") as Task["status"],
                result: publishError ? `${t.result ?? ""}\n\n⚠️ Publish failed: ${publishError}` : t.result,
              }
            : t
        );
        scheduleSave({ tasks });
        return { ...prev, tasks };
      });
    },
    [scheduleSave, state.tasks, state.apiKeys.twitterKey]
  );

  const rejectTask = useCallback(
    (taskId: string) => {
      setState((prev) => {
        const tasks = prev.tasks.map((t) =>
          t.id === taskId ? { ...t, status: "failed" as const } : t
        );
        scheduleSave({ tasks });
        return { ...prev, tasks };
      });
    },
    [scheduleSave]
  );

  const updateAgentEnabled = useCallback(
    (agentId: string, enabled: boolean) => {
      setState((prev) => {
        const agents = prev.agents.map((a) =>
          a.id === agentId ? { ...a, enabled } : a
        );
        scheduleSave({ agents });
        return { ...prev, agents };
      });
    },
    [scheduleSave]
  );

  const updateApiKeys = useCallback(
    (keys: Partial<ApiKeys>) => {
      setState((prev) => {
        const apiKeys = { ...prev.apiKeys, ...keys };
        scheduleSave({ apiKeys });
        return { ...prev, apiKeys };
      });
    },
    [scheduleSave]
  );

  const resetOnboarding = useCallback(async () => {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    setState({
      loading: false,
      onboardingComplete: false,
      brand: DEFAULT_BRAND,
      agents: DEFAULT_AGENTS,
      tasks: [],
      apiKeys: {},
    });
  }, []);

  return (
    <AppContext.Provider
      value={{
        state,
        completeOnboarding,
        runAgent,
        approveTask,
        rejectTask,
        updateAgentEnabled,
        updateApiKeys,
        resetOnboarding,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
