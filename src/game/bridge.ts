import type { RuntimeInteraction } from "../content/runtime-experience";

export type MoveDirection = "up" | "down" | "left" | "right";

export type GameInteractionDetail = {
  interactionId: string;
  targetId?: string;
  action: RuntimeInteraction["action"];
};

type GameEventMap = {
  "goody:interaction": GameInteractionDetail;
  "goody:move": { direction: MoveDirection; pressed: boolean };
  "goody:input": { enabled: boolean };
  "goody:focus": undefined;
};

/** Discrete React/Phaser seam. Frame state never crosses this bridge. */
export class GameBridge {
  private readonly target = new EventTarget();
  private inputEnabled = true;

  emit<K extends keyof GameEventMap>(type: K, detail: GameEventMap[K]) {
    if (type === "goody:input") this.inputEnabled = (detail as GameEventMap["goody:input"]).enabled;
    this.target.dispatchEvent(new CustomEvent(type, { detail }));
  }

  isInputEnabled() {
    return this.inputEnabled;
  }

  on<K extends keyof GameEventMap>(type: K, listener: (detail: GameEventMap[K]) => void) {
    const handler = (event: Event) => listener((event as CustomEvent<GameEventMap[K]>).detail);
    this.target.addEventListener(type, handler);
    return () => this.target.removeEventListener(type, handler);
  }
}

export const gameBridge = new GameBridge();
