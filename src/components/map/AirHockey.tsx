"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { LiveDrag, LiveRoom } from "@/lib/data/cloud/live";
import type { Project } from "@/lib/data/types";
import { colorForKey } from "@/lib/utils/colors";
import { cn } from "@/lib/utils/cn";

// ── The map's air-hockey easter egg ──────────────────────────────────────────
//
// When TWO members each hold a task on the same block's corkboard and stand
// still for 3s, the board turns into a neon air-hockey table. The two held
// tasks are the paddles (each player keeps dragging theirs to move it); a ball,
// divider, bounds and goals appear. The ball speeds up the longer a rally runs.
// First goal wins and earns a session point (shown discreetly). Win or Esc (or
// simply releasing your task) ends it and the board returns to normal.
//
// Sync: paddles and the trigger ride the existing live layer (each player's
// active drag broadcasts its position; "standing still" = no drag message for
// 3s). Only the BALL + start/end are new — simulated by ONE deterministic host
// (the smaller tabId) and broadcast over the "game" channel. Physics run in a
// fixed 2:1 VIRTUAL FIELD, letterboxed into each device's board, so the game
// plays identically regardless of screen size or aspect ratio.

// Virtual field (a 2:1 air-hockey table). All physics live here.
const FIELD_W = 200;
const FIELD_H = 100;
const BALL_R = 3.2;
const PADDLE_R = 8;
// Goal opening = the centre third of each end wall.
const GOAL_MIN = 0.34;
const GOAL_MAX = 0.66;

const START_SPEED = 62; // field units / second
const MIN_SPEED = 46;
const MAX_SPEED = 200;
/** Ball keeps creeping faster while in play — "faster the more we play". */
const GLOBAL_RAMP = 0.03; // per second
/** Extra kick per paddle hit, on top of the creep. */
const HIT_ACCEL = 1.06;
const HIT_BONUS = 6;
/** How much of the paddle's own motion transfers to the ball on a hit. */
const PADDLE_TRANSFER = 0.4;

/** Hold-still window that arms the game. */
const HOLD_MS = 3000;
/** Position change (fraction / field units) that counts as "moved". */
const STILL_EPS = 0.004;
/** No paddle heartbeat for this long during play ⇒ the other player left. */
const REMOTE_TIMEOUT_MS = 1600;

// Win tally is EPHEMERAL but survives block/view switches within the session —
// module scope, not component state.
const sessionTally = new Map<string, number>();

interface Vec {
  x: number;
  y: number;
}

interface Ball extends Vec {
  vx: number;
  vy: number;
}

type Phase = "idle" | "playing" | "ending";

interface Game {
  gameId: string;
  isHost: boolean;
  /** The OTHER player (from this client's point of view). */
  remoteMemberId: string;
  remoteTabId: string;
  /** Absolute goal assignment (who defends which end). */
  leftMemberId: string;
  rightMemberId: string;
  ball: Ball;
  // Previous paddle positions, for velocity (host physics only).
  localPrev: Vec | null;
  remotePrev: Vec | null;
}

export interface AirHockeyLayerProps {
  room: LiveRoom;
  blockId: string;
  boardSize: { w: number; h: number };
  project: Project;
  /** Peer drags by taskId (from useLiveHot) — drives the trigger. */
  drags: ReadonlyMap<string, LiveDrag>;
  /**
   * The local player's held-task pointer as a fraction (0–1) of the FULL board,
   * or null when they aren't holding a task on this block. Supplied by the
   * corkboard (which reconstructs the pointer through the dnd capture).
   */
  localPaddle: { fx: number; fy: number } | null;
  reducedMotion: boolean;
  /** Fires true when a game starts, false when it dissolves. */
  onActiveChange: (active: boolean) => void;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

interface Geom {
  bw: number;
  bh: number;
  offX: number;
  offY: number;
  scale: number;
}

/** Full-board fraction (0–1) ⇒ clamped virtual-field coordinates. */
function toField(fx: number, fy: number, g: Geom): Vec {
  return {
    x: clamp((fx * g.bw - g.offX) / g.scale, PADDLE_R, FIELD_W - PADDLE_R),
    y: clamp((fy * g.bh - g.offY) / g.scale, PADDLE_R, FIELD_H - PADDLE_R),
  };
}

function setSpeed(b: Ball, target: number) {
  const s = Math.hypot(b.vx, b.vy);
  const t = clamp(target, MIN_SPEED, MAX_SPEED);
  if (s > 1e-4) {
    const f = t / s;
    b.vx *= f;
    b.vy *= f;
  } else {
    b.vx = t;
    b.vy = 0;
  }
}

export function AirHockeyLayer({
  room,
  blockId,
  boardSize,
  project,
  drags,
  localPaddle,
  reducedMotion,
  onActiveChange,
}: AirHockeyLayerProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [game, setGame] = useState<Pick<
    Game,
    "gameId" | "isHost" | "leftMemberId" | "rightMemberId" | "remoteMemberId"
  > | null>(null);
  const [ball, setBall] = useState<Vec | null>(null);
  const [remotePaddle, setRemotePaddle] = useState<Vec | null>(null);
  const [winner, setWinner] = useState<string | null | undefined>(undefined);
  const [tally, setTally] = useState<Map<string, number>>(
    () => new Map(sessionTally),
  );

  // Latest values for the loops/interval (which read outside the render cycle).
  const phaseRef = useRef<Phase>("idle");
  const gameRef = useRef<Game | null>(null);
  const localPaddleRef = useRef(localPaddle);
  const dragsRef = useRef(drags);
  const remotePaddleRef = useRef<Vec | null>(null);
  const lastRemotePaddleTsRef = useRef(0);
  // Local stillness tracking (events stop while still, so we track transitions).
  const lastLocalMoveTsRef = useRef(0);
  const lastLocalPosRef = useRef<{ fx: number; fy: number } | null>(null);

  // ── letterbox: virtual field ⇒ this board's pixels ────────────────────────
  const field = useMemo(() => {
    const scale = Math.min(boardSize.w / FIELD_W, boardSize.h / FIELD_H);
    const w = FIELD_W * scale;
    const h = FIELD_H * scale;
    return { scale, w, h, offX: (boardSize.w - w) / 2, offY: (boardSize.h - h) / 2 };
  }, [boardSize.w, boardSize.h]);

  const geom: Geom = {
    bw: boardSize.w,
    bh: boardSize.h,
    offX: field.offX,
    offY: field.offY,
    scale: field.scale,
  };

  const toPx = (fx: number, fy: number): Vec => ({
    x: field.offX + fx * field.scale,
    y: field.offY + fy * field.scale,
  });

  // Local paddle in field coords for THIS render (pure — no refs at render time).
  const localPaddleField = localPaddle
    ? toField(localPaddle.fx, localPaddle.fy, geom)
    : null;

  // Live geometry for the loops/interval (which run outside the render cycle
  // and would otherwise close over a stale `field` after a board resize).
  const geomRef = useRef(geom);
  useEffect(() => {
    geomRef.current = geom;
  });

  // Mirror the latest props into refs the interval/loop read, and keep the
  // local-stillness clock (events stop while a player is still, so we detect
  // stillness by the last time the paddle actually MOVED).
  useEffect(() => {
    localPaddleRef.current = localPaddle;
    if (localPaddle) {
      const prev = lastLocalPosRef.current;
      if (
        !prev ||
        Math.abs(prev.fx - localPaddle.fx) > STILL_EPS ||
        Math.abs(prev.fy - localPaddle.fy) > STILL_EPS
      ) {
        lastLocalPosRef.current = { fx: localPaddle.fx, fy: localPaddle.fy };
        lastLocalMoveTsRef.current = Date.now();
      }
    } else {
      lastLocalPosRef.current = null;
    }
  }, [localPaddle]);

  useEffect(() => {
    dragsRef.current = drags;
  }, [drags]);

  // Announce active state to the corkboard/map (fade overlay, suppress drops).
  useEffect(() => {
    onActiveChange(phase !== "idle");
  }, [phase, onActiveChange]);

  // ── game lifecycle helpers ────────────────────────────────────────────────

  const finishGame = (winnerMemberId: string | null, broadcast: boolean) => {
    const g = gameRef.current;
    if (!g || phaseRef.current !== "playing") return;
    if (broadcast) {
      room.sendGame({
        type: "end",
        gameId: g.gameId,
        winnerMemberId: winnerMemberId ?? null,
      });
    }
    if (winnerMemberId) {
      sessionTally.set(winnerMemberId, (sessionTally.get(winnerMemberId) ?? 0) + 1);
      setTally(new Map(sessionTally));
    }
    setWinner(winnerMemberId ?? null);
    phaseRef.current = "ending";
    setPhase("ending");
    window.setTimeout(
      () => {
        gameRef.current = null;
        setGame(null);
        setBall(null);
        setRemotePaddle(null);
        remotePaddleRef.current = null;
        setWinner(undefined);
        phaseRef.current = "idle";
        setPhase("idle");
      },
      winnerMemberId ? 1700 : 550,
    );
  };

  const beginGame = (g: Game) => {
    gameRef.current = g;
    lastRemotePaddleTsRef.current = Date.now();
    setGame({
      gameId: g.gameId,
      isHost: g.isHost,
      leftMemberId: g.leftMemberId,
      rightMemberId: g.rightMemberId,
      remoteMemberId: g.remoteMemberId,
    });
    setBall({ x: g.ball.x, y: g.ball.y });
    setRemotePaddle(remotePaddleRef.current);
    phaseRef.current = "playing";
    setPhase("playing");
  };

  const startAsHost = (remoteMemberId: string, remoteTabId: string) => {
    const lf = localPaddleRef.current
      ? toField(localPaddleRef.current.fx, localPaddleRef.current.fy, geomRef.current)
      : { x: FIELD_W * 0.25, y: FIELD_H / 2 };
    const hostLeft = lf.x < FIELD_W / 2;
    const leftMemberId = hostLeft ? room.memberId : remoteMemberId;
    const rightMemberId = hostLeft ? remoteMemberId : room.memberId;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const angle = Math.random() * 0.7 - 0.35;
    const ball: Ball = {
      x: FIELD_W / 2,
      y: FIELD_H / 2,
      vx: dir * START_SPEED * Math.cos(angle),
      vy: START_SPEED * Math.sin(angle),
    };
    // The host hasn't heard the peer's paddle yet — seed it at their end centre.
    remotePaddleRef.current = {
      x: hostLeft ? FIELD_W * 0.85 : FIELD_W * 0.15,
      y: FIELD_H / 2,
    };
    beginGame({
      gameId: `${Date.now()}-${room.tabId}`,
      isHost: true,
      remoteMemberId,
      remoteTabId,
      leftMemberId,
      rightMemberId,
      ball,
      localPrev: null,
      remotePrev: null,
    });
    room.sendGame({
      type: "start",
      gameId: gameRef.current!.gameId,
      leftMemberId,
      rightMemberId,
      ballx: ball.x,
      bally: ball.y,
    });
  };

  // ── incoming game messages ────────────────────────────────────────────────
  useEffect(() => {
    const off = room.subscribeGame((p) => {
      const type = p.type;
      const g = gameRef.current;
      if (type === "start") {
        if (phaseRef.current !== "idle") return;
        const hostMemberId = String(p.memberId);
        const hostTabId = String(p.tabId);
        remotePaddleRef.current = null;
        beginGame({
          gameId: String(p.gameId),
          isHost: false,
          remoteMemberId: hostMemberId,
          remoteTabId: hostTabId,
          leftMemberId: String(p.leftMemberId),
          rightMemberId: String(p.rightMemberId),
          ball: { x: Number(p.ballx), y: Number(p.bally), vx: 0, vy: 0 },
          localPrev: null,
          remotePrev: null,
        });
        return;
      }
      if (!g || p.gameId !== g.gameId) return;
      if (type === "ball") {
        if (!g.isHost) {
          g.ball.x = Number(p.x);
          g.ball.y = Number(p.y);
          setBall({ x: g.ball.x, y: g.ball.y });
        }
      } else if (type === "paddle") {
        if (p.memberId === g.remoteMemberId) {
          const pos = { x: Number(p.x), y: Number(p.y) };
          remotePaddleRef.current = pos;
          lastRemotePaddleTsRef.current = Date.now();
          setRemotePaddle(pos);
        }
      } else if (type === "end") {
        finishGame(
          typeof p.winnerMemberId === "string" ? p.winnerMemberId : null,
          false,
        );
      }
    });
    return off;
    // room is stable for the life of the dashboard; helpers close over refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  // ── trigger detector: poll while idle (events stop when still) ─────────────
  useEffect(() => {
    const id = window.setInterval(() => {
      if (phaseRef.current !== "idle") return;
      const now = Date.now();
      // Local player holding a task here and still for HOLD_MS?
      if (!localPaddleRef.current) return;
      if (now - lastLocalMoveTsRef.current < HOLD_MS) return;
      // A peer holding a task on THIS block and still for HOLD_MS?
      let peer: LiveDrag | null = null;
      for (const d of dragsRef.current.values()) {
        if (
          d.active &&
          d.blockId === blockId &&
          d.memberId !== room.memberId &&
          now - d.ts >= HOLD_MS
        ) {
          peer = d;
          break;
        }
      }
      if (!peer) return;
      // Exactly one host: the smaller tabId elects itself and kicks off.
      if (room.tabId < peer.tabId) startAsHost(peer.memberId, peer.tabId);
    }, 250);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, blockId]);

  // ── main loop while playing: broadcast paddle, host steps the ball ─────────
  useEffect(() => {
    if (phase !== "playing") return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const g = gameRef.current;
      if (!g) return;
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;

      // Bail: local player let go, or the peer went silent.
      if (!localPaddleRef.current) return finishGame(null, true);
      if (Date.now() - lastRemotePaddleTsRef.current > REMOTE_TIMEOUT_MS) {
        return finishGame(null, true);
      }

      const lf = localPaddleRef.current
        ? toField(
            localPaddleRef.current.fx,
            localPaddleRef.current.fy,
            geomRef.current,
          )
        : null;
      if (lf) {
        room.sendGame({ type: "paddle", gameId: g.gameId, x: lf.x, y: lf.y });
      }

      if (g.isHost) {
        const winnerMemberId = stepPhysics(g, dt, lf, remotePaddleRef.current);
        setBall({ x: g.ball.x, y: g.ball.y });
        room.sendGame({ type: "ball", gameId: g.gameId, x: g.ball.x, y: g.ball.y });
        if (winnerMemberId !== null) return finishGame(winnerMemberId, true);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Esc bails ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finishGame(null, true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "idle" || !game) return null;

  // ── render ────────────────────────────────────────────────────────────────
  const paddleRpx = PADDLE_R * field.scale;
  const ballRpx = BALL_R * field.scale;
  const localMember = project.members.find((m) => m.id === room.memberId);
  const remoteMember = project.members.find((m) => m.id === game.remoteMemberId);
  const leftMember = project.members.find((m) => m.id === game.leftMemberId);
  const rightMember = project.members.find((m) => m.id === game.rightMemberId);
  const localColor = localMember ? colorForKey(localMember.colorKey).bg : "#5b54c9";
  const remoteColor = remoteMember ? colorForKey(remoteMember.colorKey).bg : "#c25462";
  const leftColor = leftMember ? colorForKey(leftMember.colorKey).bg : "#5b54c9";
  const rightColor = rightMember ? colorForKey(rightMember.colorKey).bg : "#c25462";

  const centerX = field.offX + field.w / 2;
  const goalTop = field.offY + FIELD_H * GOAL_MIN * field.scale;
  const goalH = FIELD_H * (GOAL_MAX - GOAL_MIN) * field.scale;

  const tallyRow = [leftMember, rightMember].filter(Boolean);

  return (
    <div
      className="air-hockey absolute inset-0 z-[60] overflow-hidden rounded-2xl"
      style={{
        background:
          "radial-gradient(120% 100% at 50% 0%, #14131c 0%, #0b0a10 60%, #070609 100%)",
      }}
    >
      {/* Table bounds */}
      <div
        className={cn("absolute rounded-xl", !reducedMotion && "air-glow-pulse")}
        style={{
          left: field.offX,
          top: field.offY,
          width: field.w,
          height: field.h,
          border: "2px solid rgba(120,220,255,0.55)",
          boxShadow:
            "0 0 12px rgba(120,220,255,0.35), inset 0 0 22px rgba(120,220,255,0.12)",
        }}
      />
      {/* Centre divider + circle */}
      <div
        className="absolute"
        style={{
          left: centerX - 1,
          top: field.offY,
          width: 2,
          height: field.h,
          background: "rgba(120,220,255,0.5)",
          boxShadow: "0 0 8px rgba(120,220,255,0.5)",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          left: centerX - field.h * 0.16,
          top: field.offY + field.h / 2 - field.h * 0.16,
          width: field.h * 0.32,
          height: field.h * 0.32,
          border: "2px solid rgba(120,220,255,0.35)",
        }}
      />
      {/* Goals */}
      <Goal x={field.offX - 3} top={goalTop} height={goalH} color={leftColor} reducedMotion={reducedMotion} />
      <Goal x={field.offX + field.w - 3} top={goalTop} height={goalH} color={rightColor} reducedMotion={reducedMotion} />

      {/* Paddles */}
      {localPaddleField && (
        <Paddle
          pos={toPx(localPaddleField.x, localPaddleField.y)}
          r={paddleRpx}
          color={localColor}
        />
      )}
      {remotePaddle && (
        <Paddle
          pos={toPx(remotePaddle.x, remotePaddle.y)}
          r={paddleRpx}
          color={remoteColor}
        />
      )}

      {/* Ball */}
      {ball && (
        <div
          className={cn(!reducedMotion && "air-ball")}
          style={{
            position: "absolute",
            left: toPx(ball.x, ball.y).x - ballRpx,
            top: toPx(ball.x, ball.y).y - ballRpx,
            width: ballRpx * 2,
            height: ballRpx * 2,
            borderRadius: "9999px",
            background: "radial-gradient(circle at 35% 30%, #ffffff, #a8ecff 70%)",
            boxShadow:
              "0 0 10px rgba(168,236,255,0.9), 0 0 22px rgba(120,220,255,0.6)",
            // Guest lerps between the ~25/s host updates.
            transition: game.isHost ? "none" : "left 60ms linear, top 60ms linear",
          }}
        />
      )}

      {/* Discrete session tally */}
      {tallyRow.length > 0 && (
        <div className="absolute right-2 top-2 flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80 backdrop-blur-sm">
          {tallyRow.map((m, i) => (
            <span key={m!.id} className="flex items-center gap-1">
              {i > 0 && <span className="text-white/30">·</span>}
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: colorForKey(m!.colorKey).bg }}
              />
              <span className="tabular-nums">{tally.get(m!.id) ?? 0}</span>
            </span>
          ))}
        </div>
      )}

      {/* Win / cancel flourish */}
      {phase === "ending" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={cn(
              "rounded-2xl px-6 py-4 text-center",
              !reducedMotion && "air-win-pop",
            )}
            style={{
              background: "rgba(10,9,16,0.7)",
              border: "1px solid rgba(120,220,255,0.4)",
              boxShadow: "0 0 30px rgba(120,220,255,0.35)",
            }}
          >
            {winner ? (
              <>
                <p className="type-overline text-white/60">Gol</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {firstName(
                    project.members.find((m) => m.id === winner)?.name ?? "Alguien",
                  )}{" "}
                  gana 🏒
                </p>
              </>
            ) : (
              <p className="text-sm font-medium text-white/70">Partida cancelada</p>
            )}
          </div>
        </div>
      )}

      {/* Faint hint */}
      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-medium tracking-wide text-white/30">
        Air hockey · Esc para salir
      </p>
    </div>
  );
}

/** Advances the ball one frame; returns the scorer's memberId, or null. */
function stepPhysics(
  g: Game,
  dt: number,
  localPad: Vec | null,
  remotePad: Vec | null,
): string | null {
  const b = g.ball;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // Gentle constant acceleration while the rally runs.
  setSpeed(b, Math.hypot(b.vx, b.vy) * (1 + GLOBAL_RAMP * dt));

  // Top / bottom walls.
  if (b.y < BALL_R) {
    b.y = BALL_R;
    b.vy = Math.abs(b.vy);
  } else if (b.y > FIELD_H - BALL_R) {
    b.y = FIELD_H - BALL_R;
    b.vy = -Math.abs(b.vy);
  }

  // Paddle collisions (both paddles, with velocity transfer + a speed kick).
  const pads: Array<{ pos: Vec; prevKey: "localPrev" | "remotePrev" }> = [];
  if (localPad) pads.push({ pos: localPad, prevKey: "localPrev" });
  if (remotePad) pads.push({ pos: remotePad, prevKey: "remotePrev" });
  for (const pad of pads) {
    const prev = g[pad.prevKey];
    let pvx = 0;
    let pvy = 0;
    if (prev && dt > 0) {
      pvx = (pad.pos.x - prev.x) / dt;
      pvy = (pad.pos.y - prev.y) / dt;
    }
    g[pad.prevKey] = { x: pad.pos.x, y: pad.pos.y };

    const dx = b.x - pad.pos.x;
    const dy = b.y - pad.pos.y;
    const min = BALL_R + PADDLE_R;
    const dist = Math.hypot(dx, dy);
    if (dist > 0 && dist < min) {
      const nx = dx / dist;
      const ny = dy / dist;
      b.x = pad.pos.x + nx * min;
      b.y = pad.pos.y + ny * min;
      const vdotn = b.vx * nx + b.vy * ny;
      if (vdotn < 0) {
        b.vx -= 2 * vdotn * nx;
        b.vy -= 2 * vdotn * ny;
      }
      b.vx += pvx * PADDLE_TRANSFER;
      b.vy += pvy * PADDLE_TRANSFER;
      setSpeed(b, Math.hypot(b.vx, b.vy) * HIT_ACCEL + HIT_BONUS);
    }
  }

  // End walls: a centre-gap goal, otherwise a bounce.
  const inGap = b.y > FIELD_H * GOAL_MIN && b.y < FIELD_H * GOAL_MAX;
  if (b.x < BALL_R) {
    if (inGap) return g.rightMemberId; // scored into the LEFT goal
    b.x = BALL_R;
    b.vx = Math.abs(b.vx);
  } else if (b.x > FIELD_W - BALL_R) {
    if (inGap) return g.leftMemberId; // scored into the RIGHT goal
    b.x = FIELD_W - BALL_R;
    b.vx = -Math.abs(b.vx);
  }
  return null;
}

function Paddle({ pos, r, color }: { pos: Vec; r: number; color: string }) {
  return (
    <div
      className="pointer-events-none absolute rounded-full"
      style={{
        left: pos.x - r,
        top: pos.y - r,
        width: r * 2,
        height: r * 2,
        background: `radial-gradient(circle at 40% 35%, ${color}, ${color}cc 60%, ${color}77)`,
        border: `2px solid ${color}`,
        boxShadow: `0 0 12px ${color}, 0 0 26px ${color}aa, inset 0 0 8px rgba(255,255,255,0.35)`,
        transition: "left 60ms linear, top 60ms linear",
      }}
    />
  );
}

function Goal({
  x,
  top,
  height,
  color,
  reducedMotion,
}: {
  x: number;
  top: number;
  height: number;
  color: string;
  reducedMotion: boolean;
}) {
  return (
    <div
      className={cn("absolute rounded-full", !reducedMotion && "air-glow-pulse")}
      style={
        {
          left: x,
          top,
          width: 6,
          height,
          background: color,
          boxShadow: `0 0 12px ${color}, 0 0 24px ${color}`,
        } as CSSProperties
      }
    />
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
