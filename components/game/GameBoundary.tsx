"use client";

/* Phaser loads only inside client effect. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeExperience } from "@/src/content/runtime-experience";
import { validateRuntimeExperience } from "@/src/domain/experience";
import { gameBridge, type MoveDirection } from "@/src/game/bridge";
import { createRuntimeExperienceScene } from "@/src/game/scene";
import InteractionPanel from "@/components/panels/InteractionPanel";

type BoundaryState = "loading" | "starting" | "ready" | "error";

function viewportSize(element: HTMLElement) {
  const viewport = window.visualViewport;
  const bounds = element.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(viewport?.width || window.innerWidth || bounds.width)),
    height: Math.max(1, Math.round(viewport?.height || window.innerHeight || bounds.height)),
  };
}

function TouchControls() {
  const send = (direction: MoveDirection, pressed: boolean) => gameBridge.emit("goody:move", { direction, pressed });
  const control = (direction: MoveDirection, label: string, glyph: string) => (
    <button
      className={`touch-control touch-control--${direction}`}
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        send(direction, true);
      }}
      onPointerUp={() => send(direction, false)}
      onPointerCancel={() => send(direction, false)}
      onLostPointerCapture={() => send(direction, false)}
    >
      {glyph}
    </button>
  );

  return (
    <div className="touch-controls" aria-label="觸控移動">
      {control("up", "向上移動", "↑")}
      {control("left", "向左移動", "←")}
      {control("down", "向下移動", "↓")}
      {control("right", "向右移動", "→")}
    </div>
  );
}

export default function GameBoundary() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<any>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [state, setState] = useState<BoundaryState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [experience, setExperience] = useState<RuntimeExperience | null>(null);
  const [paused, setPaused] = useState(false);

  const boot = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setState("loading");
    setError(null);
    try {
      const response = await fetch("/api/runtime/bootstrap", {
        signal: controller.signal,
        cache: "no-store",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`bootstrap ${response.status}`);
      const validation = validateRuntimeExperience(await response.json());
      if (!validation.valid || !validation.value) throw new Error("invalid RuntimeExperience v2");
      setExperience(validation.value);
      setState("starting");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setExperience(null);
      setError(cause instanceof Error ? cause.message : "無法載入小店資料");
      setState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void boot();
    const refresh = () => void boot();
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      requestRef.current?.abort();
    };
  }, [boot]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!experience || !mount) return;
    let disposed = false;
    let resizeCleanup = () => {};
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const start = async () => {
      try {
        const phaserModule = await import("phaser");
        if (disposed) return;
        const Phaser = (phaserModule as any).default ?? phaserModule;
        const probe = document.createElement("canvas");
        if (!probe.getContext("webgl2") && !probe.getContext("webgl")) {
          throw new Error("此裝置不支援 WebGL，無法顯示 Goody 小店");
        }
        const initial = viewportSize(mount);
        const game = new Phaser.Game({
          type: Phaser.WEBGL,
          width: initial.width,
          height: initial.height,
          parent: mount,
          backgroundColor: "#19353a",
          pixelArt: true,
          roundPixels: true,
          antialias: false,
          render: { antialias: false, roundPixels: true },
          scale: {
            mode: Phaser.Scale.RESIZE,
            width: initial.width,
            height: initial.height,
          },
          scene: createRuntimeExperienceScene(gameBridge, experience, { reducedMotion }),
        });
        gameRef.current = game;

        let lastWidth = initial.width;
        let lastHeight = initial.height;
        let resizeFrame = 0;
        const applyResize = () => {
          resizeFrame = 0;
          if (disposed) return;
          const next = viewportSize(mount);
          if (next.width === lastWidth && next.height === lastHeight) return;
          lastWidth = next.width;
          lastHeight = next.height;
          game.scale.resize(next.width, next.height);
          game.renderer.resize(next.width, next.height);
        };
        const resize = () => {
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(applyResize);
        };
        const observer = new ResizeObserver(resize);
        observer.observe(mount);
        window.addEventListener("resize", resize, { passive: true });
        window.visualViewport?.addEventListener("resize", resize, { passive: true });
        resizeCleanup = () => {
          if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
          observer.disconnect();
          window.removeEventListener("resize", resize);
          window.visualViewport?.removeEventListener("resize", resize);
        };
        setState("ready");
      } catch (cause) {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "Phaser 啟動失敗");
          setState("error");
        }
      }
    };
    void start();

    return () => {
      disposed = true;
      resizeCleanup();
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [experience]);

  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      setPaused(hidden);
      gameRef.current?.scene?.getScenes(true).forEach((currentScene: any) =>
        hidden ? currentScene.scene.pause() : currentScene.scene.resume(),
      );
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => gameBridge.on("goody:focus", () => {
    window.requestAnimationFrame(() => mountRef.current?.focus());
  }), []);

  return (
    <main className="runtime-experience" data-runtime-state={state}>
      <section className="game-stage" aria-labelledby="game-title" aria-describedby="game-description">
        <div
          ref={mountRef}
          className={`phaser-mount${state === "ready" ? "" : " phaser-mount--hidden"}`}
          tabIndex={0}
          role="application"
          aria-label="Goody 像素小店遊戲畫面"
        />

        <header className="runtime-brand">
          <span className="runtime-brand__mark" aria-hidden="true">G</span>
          <div>
            <h1 id="game-title">Goody Pâtisserie</h1>
            <p>古迪法式甜點</p>
          </div>
        </header>
        <p id="game-description" className="visually-hidden">Goody 甜點店全螢幕像素場景。可用 WASD、方向鍵或觸控按鈕移動，走近互動物件後按 E。</p>
        <p className="game-hint"><kbd>WASD</kbd> / <kbd>方向鍵</kbd> 移動 · <kbd>E</kbd> 互動</p>
        <TouchControls />

        {(state === "loading" || state === "starting") && (
          <div className="game-loading" role="status" aria-live="polite">
            <span className="pixel-spinner" aria-hidden="true" />
            <p>{state === "loading" ? "正在取得店裡資料…" : "正在佈置 Goody 小店…"}</p>
          </div>
        )}
        {state === "error" && (
          <div className="game-error" role="alert">
            <p>小店暫時沒有回應。</p>
            <small>{error}</small>
            <button type="button" className="runtime-button" onClick={() => void boot()}>再試一次</button>
          </div>
        )}
        {paused && <p className="game-paused" role="status">已暫停</p>}
      </section>
      <InteractionPanel modalPayloads={experience?.modalPayloads} />
    </main>
  );
}
