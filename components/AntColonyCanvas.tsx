import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { AgentState, Task } from "@/context/AppContext";

// ─────────────────────────────────────────────────────────────────────────────
// Hive View — free-roaming swarm, not a fixed ant-farm diagram.
//
// Agent dots wander, orbit, and "nibble" at floating task nodes (glowing food
// chunks sized/positioned deterministically from each task's id), leave fading
// trails, carry a small fragment home while delivering, and burst into spark
// particles when a task completes — per the original Hive View spec.
//
// This pass adds visual detail on top of that same structure: tripod-gait
// curved legs, mandibles, a glossy per-agent body gradient, a richer
// multi-layer node glow with flicker, and a textured cave background
// (static rocks + drifting dust + a vignette) — written blind, not visually
// previewed, so treat it as a strong first pass to look at on a real device
// and adjust from there, not a guaranteed-perfect result.
//
// Cross-agent "merge while collaborating" is intentionally not implemented:
// the current Task model only supports a single agentId per task, so there's
// no real collaboration event to animate yet. Add it once tasks can list
// multiple contributing agents.
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVE_TASK_STATUSES = new Set(["pending", "running", "awaiting_approval"]);
const MAX_VISIBLE_NODES = 6;
const TRANSIT_FRAMES = 18; // ~600ms at 33ms/frame — matches the MOVING/DELIVERING window in AppContext
const TRAIL_LENGTH = 6;
const BURST_FRAMES = 26; // ~860ms particle-burst lifetime

function hash01(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function easeOutCubic(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function lightenHex(hex: string, amt: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amt);
  const lg = Math.round(g + (255 - g) * amt);
  const lb = Math.round(b + (255 - b) * amt);
  const toHex = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${toHex(lr)}${toHex(lg)}${toHex(lb)}`;
}

// A lumpy, irregular rock/pebble silhouette for background texture.
function rockPath(cx: number, cy: number, baseR: number, seed: string): string {
  const points = 7;
  let d = "";
  for (let i = 0; i <= points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const jitter = 0.6 + hash01(`${seed}-${i}`) * 0.55;
    const px = cx + Math.cos(ang) * baseR * jitter;
    const py = cy + Math.sin(ang) * baseR * jitter * 0.8;
    d += i === 0 ? `M ${px} ${py} ` : `L ${px} ${py} `;
  }
  return d + "Z";
}

interface TaskNode {
  task: Task;
  x: number;
  y: number;
  size: number;
}

interface Burst {
  taskId: string;
  x: number;
  y: number;
  color: string;
  startFrame: number;
}

interface Props {
  agents: AgentState[];
  tasks: Task[];
  height?: number;
}

// Leg geometry in ant-local space (before translate/rotate). side: 1 = top
// edge in local space, -1 = bottom edge. group alternates for tripod gait.
const LEGS = [
  { side: 1 as const, ax: -6.5, ay: -4, tx: -12.5, ty: -9.5, group: 0 },
  { side: 1 as const, ax: -2, ay: -4.2, tx: -4.5, ty: -10.5, group: 1 },
  { side: 1 as const, ax: 2.5, ay: -3.8, tx: 5.8, ty: -9.5, group: 0 },
  { side: -1 as const, ax: -6.5, ay: 4, tx: -12.5, ty: 9.5, group: 1 },
  { side: -1 as const, ax: -2, ay: 4.2, tx: -4.5, ty: 10.5, group: 0 },
  { side: -1 as const, ax: 2.5, ay: 3.8, tx: 5.8, ty: 9.5, group: 1 },
];

export function AntColonyCanvas({ agents, tasks, height }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const canvasWidth = screenWidth;
  const canvasHeight = height ?? screenWidth * 1.05;

  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      frameRef.current += 1;
      setFrame(frameRef.current);
    }, 33);
    return () => clearInterval(id);
  }, []);

  const statusRef = useRef<Record<string, { status: AgentState["status"]; changedAtFrame: number }>>({});
  const trailRef = useRef<Record<string, { x: number; y: number }[]>>({});
  const nodeCacheRef = useRef<Record<string, { x: number; y: number; size: number }>>({});
  const prevTaskStatusRef = useRef<Record<string, Task["status"]>>({});
  const [bursts, setBursts] = useState<Burst[]>([]);

  const enabledAgents = useMemo(() => agents.filter((a) => a.enabled), [agents]);

  const margin = { x: canvasWidth * 0.13, yTop: canvasHeight * 0.1, yBottom: canvasHeight * 0.66 };

  const activeNodes = useMemo<TaskNode[]>(() => {
    const active = tasks.filter((t) => ACTIVE_TASK_STATUSES.has(t.status)).slice(0, MAX_VISIBLE_NODES);
    return active.map((task) => {
      const x = margin.x + hash01(task.id) * (canvasWidth - margin.x * 2);
      const y = margin.yTop + hash01(task.id + "#y") * (margin.yBottom - margin.yTop);
      const size = 20 + hash01(task.id + "#size") * 14;
      return { task, x, y, size };
    });
  }, [tasks, canvasWidth, canvasHeight]);

  activeNodes.forEach((n) => {
    nodeCacheRef.current[n.task.id] = { x: n.x, y: n.y, size: n.size };
  });

  useEffect(() => {
    const next: Burst[] = [];
    for (const t of tasks) {
      const prev = prevTaskStatusRef.current[t.id];
      const justFinished =
        (t.status === "completed" || t.status === "failed") &&
        prev !== undefined &&
        prev !== t.status &&
        (prev === "pending" || prev === "running" || prev === "awaiting_approval");
      if (justFinished) {
        const cached = nodeCacheRef.current[t.id];
        if (cached) {
          const agentColor = agents.find((a) => a.id === t.agentId)?.color ?? "#F59E0B";
          next.push({
            taskId: t.id,
            x: cached.x,
            y: cached.y,
            color: t.status === "failed" ? "#EF4444" : agentColor,
            startFrame: frameRef.current,
          });
        }
      }
      prevTaskStatusRef.current[t.id] = t.status;
    }
    if (next.length) {
      setBursts((b) => [...b, ...next]);
      next.forEach((b) => delete nodeCacheRef.current[b.taskId]);
    }
  }, [tasks, agents]);

  useEffect(() => {
    if (!bursts.length) return;
    setBursts((b) => b.filter((burst) => frame - burst.startFrame < BURST_FRAMES));
  }, [frame]);

  const idleAnchor = (index: number, count: number) => {
    const usable = canvasWidth - margin.x * 2;
    const x = margin.x + ((index + 0.5) / Math.max(count, 1)) * usable;
    const y = canvasHeight * 0.86;
    return { x, y };
  };

  const agentRender = useMemo(() => {
    const f = frameRef.current;
    return enabledAgents.map((agent, idx) => {
      const tracked = statusRef.current[agent.id];
      if (!tracked || tracked.status !== agent.status) {
        statusRef.current[agent.id] = { status: agent.status, changedAtFrame: f };
      }
      const framesSinceChange = f - statusRef.current[agent.id].changedAtFrame;
      const anchor = idleAnchor(idx, enabledAgents.length);

      const assignedTask =
        activeNodes.find((n) => n.task.agentId === agent.id && n.task.status === "running") ??
        activeNodes.find((n) => n.task.agentId === agent.id);

      let x = anchor.x;
      let y = anchor.y;
      let fragment: { x: number; y: number } | null = null;
      let opacity = 1;

      if (agent.status === "IDLE" || !assignedTask) {
        const phase = hash01(agent.id) * 100;
        x = anchor.x + Math.sin(f * 0.025 + phase) * 6;
        y = anchor.y + Math.cos(f * 0.035 + phase) * 4;
        opacity = 0.45 + Math.sin(f * 0.05 + phase) * 0.15;
      } else if (agent.status === "MOVING") {
        const t = easeOutCubic(Math.min(1, framesSinceChange / TRANSIT_FRAMES));
        x = lerp(anchor.x, assignedTask.x, t);
        y = lerp(anchor.y, assignedTask.y, t);
      } else if (agent.status === "WORKING") {
        const orbitR = assignedTask.size * 1.7 + 12;
        const orbitRad = f * 0.09 + hash01(agent.id) * Math.PI * 2;
        x = assignedTask.x + Math.cos(orbitRad) * orbitR + Math.sin(f * 0.7) * 2.2;
        y = assignedTask.y + Math.sin(orbitRad) * orbitR + Math.cos(f * 0.9) * 2.2;
      } else if (agent.status === "DELIVERING") {
        const t = easeOutCubic(Math.min(1, framesSinceChange / TRANSIT_FRAMES));
        x = lerp(assignedTask.x, anchor.x, t);
        y = lerp(assignedTask.y, anchor.y, t);
        const fragT = Math.max(0, t - 0.18);
        fragment = { x: lerp(assignedTask.x, anchor.x, fragT), y: lerp(assignedTask.y, anchor.y, fragT) };
      }

      const angleDeg =
        agent.status === "IDLE" || !assignedTask
          ? hash01(agent.id + "rest") * 360 + Math.sin(f * 0.015 + hash01(agent.id) * 10) * 6
          : (() => {
              const hist = trailRef.current[agent.id];
              if (!hist || !hist.length) return 0;
              const prev = hist[0];
              return Math.atan2(y - prev.y, x - prev.x) * (180 / Math.PI);
            })();

      const hist = trailRef.current[agent.id] ?? [];
      trailRef.current[agent.id] = [{ x, y }, ...hist].slice(0, TRAIL_LENGTH);

      return { agent, x, y, angleDeg, opacity, fragment, trail: trailRef.current[agent.id] };
    });
  }, [frame, enabledAgents, activeNodes]);

  // Static background texture — generated once, not recomputed per frame.
  const rocks = useMemo(
    () =>
      Array.from({ length: 13 }).map((_, i) => ({
        cx: hash01(`rock${i}`) * canvasWidth,
        cy: hash01(`rock${i}y`) * canvasHeight,
        r: 10 + hash01(`rock${i}r`) * 26,
        seed: `rockshape${i}`,
        dark: hash01(`rock${i}tone`) > 0.5,
      })),
    [canvasWidth, canvasHeight]
  );

  const dust = useMemo(
    () =>
      Array.from({ length: 48 }).map((_, i) => ({
        x0: hash01(`d${i}`) * canvasWidth,
        y0: hash01(`d${i}y`) * canvasHeight,
        r: 0.5 + hash01(`d${i}r`) * 1.3,
        o: 0.03 + hash01(`d${i}o`) * 0.09,
        speed: 0.15 + hash01(`d${i}s`) * 0.3,
        phase: hash01(`d${i}p`) * Math.PI * 2,
      })),
    [canvasWidth, canvasHeight]
  );

  return (
    <View style={[styles.container, { width: canvasWidth, height: canvasHeight }]}>
      <Svg width={canvasWidth} height={canvasHeight}>
        <Defs>
          <RadialGradient id="caveBg" cx="50%" cy="42%" r="75%">
            <Stop offset="0" stopColor="#1C140B" stopOpacity="1" />
            <Stop offset="1" stopColor="#080503" stopOpacity="1" />
          </RadialGradient>
          <RadialGradient id="vignette" cx="50%" cy="50%" r="68%">
            <Stop offset="0" stopColor="#000000" stopOpacity="0" />
            <Stop offset="0.75" stopColor="#000000" stopOpacity="0" />
            <Stop offset="1" stopColor="#000000" stopOpacity="0.55" />
          </RadialGradient>
          <RadialGradient id="nodeGlowOuter" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FDE68A" stopOpacity="0.5" />
            <Stop offset="1" stopColor="#D97706" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="nodeGlow" cx="42%" cy="38%" r="60%">
            <Stop offset="0" stopColor="#FFFBEB" stopOpacity="0.98" />
            <Stop offset="0.5" stopColor="#FCD34D" stopOpacity="0.96" />
            <Stop offset="1" stopColor="#C2670A" stopOpacity="0.9" />
          </RadialGradient>
          {enabledAgents.map((a) => (
            <RadialGradient key={`grad-${a.id}`} id={`antBody-${a.id}`} cx="40%" cy="35%" r="65%">
              <Stop offset="0" stopColor={lightenHex(a.color, 0.55)} stopOpacity="1" />
              <Stop offset="1" stopColor={a.color} stopOpacity="1" />
            </RadialGradient>
          ))}
        </Defs>

        <Rect width={canvasWidth} height={canvasHeight} fill="url(#caveBg)" />

        {rocks.map((r, i) => (
          <Path key={`rock-${i}`} d={rockPath(r.cx, r.cy, r.r, r.seed)} fill={r.dark ? "#150F08" : "#2A1D10"} opacity={r.dark ? 0.5 : 0.32} />
        ))}

        {dust.map((d, i) => {
          const dx = d.x0 + Math.sin(frame * 0.004 * d.speed + d.phase) * 14;
          const dy = d.y0 + Math.cos(frame * 0.003 * d.speed + d.phase) * 10;
          return <Circle key={`dust-${i}`} cx={dx} cy={dy} r={d.r} fill="#FFE9C2" opacity={d.o} />;
        })}

        {/* Task nodes — warm bioluminescent food chunks */}
        {activeNodes.map(({ task, x, y, size }) => {
          const pulse = 1 + Math.sin(frame * 0.06 + hash01(task.id) * 10) * 0.06;
          const flicker = 1 + Math.sin(frame * 0.21 + hash01(task.id + "f") * 8) * 0.035;
          const isAwaiting = task.status === "awaiting_approval";
          return (
            <G key={task.id}>
              <Circle cx={x} cy={y} r={size * 2.6 * pulse} fill="url(#nodeGlowOuter)" opacity={0.6} />
              <Circle cx={x} cy={y} r={size * 1.35 * pulse * flicker} fill="url(#nodeGlow)" opacity={0.95} />
              <Circle cx={x - size * 0.18} cy={y - size * 0.22} r={size * 0.32} fill="#FFFDF5" opacity={0.55 * flicker} />
              {isAwaiting && (
                <Circle
                  cx={x}
                  cy={y}
                  r={size * 1.55 + Math.sin(frame * 0.12) * 3}
                  stroke="#FBBF24"
                  strokeWidth={1.4}
                  fill="none"
                  opacity={0.55}
                />
              )}
            </G>
          );
        })}

        {/* Trails */}
        {agentRender.map(({ agent, trail }) =>
          trail.slice(1).map((pt, i) => (
            <Circle
              key={`trail-${agent.id}-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={Math.max(0.4, 2.6 - i * 0.4)}
              fill={agent.color}
              opacity={(1 - i / TRAIL_LENGTH) * 0.22}
            />
          ))
        )}

        {/* Carried fragments while delivering */}
        {agentRender.map(({ agent, fragment }) =>
          fragment ? (
            <Circle key={`frag-${agent.id}`} cx={fragment.x} cy={fragment.y} r={3.4} fill="#FEF3C7" opacity={0.9} />
          ) : null
        )}

        {/* Agents — detailed insect rendering, free-roaming */}
        {agentRender.map(({ agent, x, y, angleDeg, opacity }) => {
          const c = agent.color;
          const fillId = `url(#antBody-${agent.id})`;
          const isActive = agent.status !== "IDLE";
          const walkSpeed = agent.status === "WORKING" ? 0.55 : agent.status === "IDLE" ? 0.12 : 0.4;

          return (
            <G key={agent.id} opacity={opacity}>
              <Ellipse cx={x} cy={y} rx={isActive ? 19 : 10} ry={isActive ? 10 : 5.5} fill={c} opacity={0.06} />
              {isActive && <Ellipse cx={x} cy={y} rx={13} ry={7} fill={c} opacity={0.12} />}

              <G transform={`translate(${x}, ${y}) rotate(${angleDeg})`}>
                {/* Legs — tripod gait, curved at the knee */}
                {LEGS.map((leg, li) => {
                  const lift = isActive
                    ? Math.sin(frame * walkSpeed + leg.group * Math.PI) * (isActive ? 1.6 : 0)
                    : Math.sin(frame * 0.05 + li) * 0.3;
                  const tx = leg.tx + lift * 0.4;
                  const ty = leg.ty + lift * leg.side;
                  const kx = leg.ax + (tx - leg.ax) * 0.45;
                  const ky = leg.ay + (ty - leg.ay) * 0.45 + leg.side * 1.6;
                  return (
                    <Path
                      key={li}
                      d={`M ${leg.ax} ${leg.ay} Q ${kx} ${ky} ${tx} ${ty}`}
                      stroke={c}
                      strokeWidth={1}
                      strokeLinecap="round"
                      fill="none"
                      opacity={0.65}
                    />
                  );
                })}

                {/* Body — abdomen, thorax, head, with a glossy highlight */}
                <Ellipse cx={-5.2} cy={0} rx={8} ry={4.4} fill={fillId} />
                <Ellipse cx={-7.2} cy={-1.4} rx={2.4} ry={1.1} fill="#FFFFFF" opacity={0.2} />
                <Circle cx={2} cy={0} r={1.8} fill={fillId} opacity={0.95} />
                <Ellipse cx={9} cy={0} rx={3.9} ry={3.3} fill={fillId} />
                <Circle cx={10.6} cy={-1.7} r={1.1} fill="#0A0806" opacity={0.85} />
                <Circle cx={10.6} cy={1.7} r={1.1} fill="#0A0806" opacity={0.85} />

                {/* Mandibles */}
                <Path d={`M 11.2 -1 L 14.2 -2.3`} stroke={c} strokeWidth={0.9} strokeLinecap="round" opacity={0.7} />
                <Path d={`M 11.2 1 L 14.2 2.3`} stroke={c} strokeWidth={0.9} strokeLinecap="round" opacity={0.7} />

                {/* Antennae */}
                <Path d={`M 11.5 -2 Q 15 -7 17.5 -9`} stroke={c} strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.7} />
                <Path d={`M 12 1.5 Q 15.5 -2 18 -4`} stroke={c} strokeWidth={0.9} strokeLinecap="round" fill="none" opacity={0.7} />
              </G>
            </G>
          );
        })}

        {/* Particle bursts on task completion */}
        {bursts.map((burst) => {
          const age = frame - burst.startFrame;
          const t = Math.min(1, age / BURST_FRAMES);
          const particles = 8;
          return (
            <G key={`${burst.taskId}-${burst.startFrame}`}>
              {Array.from({ length: particles }).map((_, i) => {
                const ang = (i / particles) * Math.PI * 2;
                const dist = easeOutCubic(t) * 30;
                const px = burst.x + Math.cos(ang) * dist;
                const py = burst.y + Math.sin(ang) * dist;
                return (
                  <Circle key={i} cx={px} cy={py} r={Math.max(0.5, 2.5 * (1 - t))} fill={burst.color} opacity={1 - t} />
                );
              })}
            </G>
          );
        })}

        <Rect width={canvasWidth} height={canvasHeight} fill="url(#vignette)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden" },
});
