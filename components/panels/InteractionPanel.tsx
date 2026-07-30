"use client";

import { useEffect, useRef, useState } from "react";
import type { RuntimeModalPayload } from "@/src/content/runtime-experience";
import { gameBridge, type GameInteractionDetail } from "@/src/game/bridge";

const scheduleState = { closed: "休息", prep: "備料", open: "營業" } as const;

export default function InteractionPanel({ modalPayloads }: { modalPayloads?: readonly RuntimeModalPayload[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef(false);
  const [detail, setDetail] = useState<GameInteractionDetail | null>(null);
  const payload = detail ? modalPayloads?.find((candidate) => candidate.key === detail.action.payloadKey) : undefined;

  useEffect(() => {
    const stop = gameBridge.on("goody:interaction", (next) => {
      if (openRef.current) return;
      openRef.current = true;
      setDetail(next);
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "true");
      window.requestAnimationFrame(() => closeRef.current?.focus());
    });
    return () => {
      stop();
      if (openRef.current) gameBridge.emit("goody:input", { enabled: true });
    };
  }, []);

  const close = () => {
    if (!openRef.current) return;
    openRef.current = false;
    if (dialogRef.current?.open) dialogRef.current.close();
    setDetail(null);
    gameBridge.emit("goody:input", { enabled: true });
    gameBridge.emit("goody:focus", undefined);
  };

  return (
    <dialog
      ref={dialogRef}
      className="game-dialog"
      aria-labelledby="game-dialog-title"
      aria-describedby="game-dialog-content"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="game-dialog__inner" id="game-dialog-content">
        <button ref={closeRef} type="button" className="dialog-close" onClick={close} aria-label="關閉資訊">×</button>
        <p className="dialog-kicker">{payload?.panel === "calendar" ? "CALENDAR" : "WEEKLY MENU"}</p>
        <h2 id="game-dialog-title">{payload?.title ?? "Goody 小店"}</h2>

        {payload?.panel === "calendar" && (
          <>
            <p className="dialog-timezone">{payload.schedule.timeZone}</p>
            <dl className="dialog-schedule">
              {payload.schedule.entries.map((entry) => (
                <div key={`${entry.days.join("-")}-${entry.state}`}>
                  <dt>{entry.days.join("、")}</dt>
                  <dd>
                    <strong>{scheduleState[entry.state]}</strong>
                    <span>{entry.hours ?? entry.note}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        {payload?.panel === "weekly-menu" && (
          <>
            <p className="dialog-timezone">
              販售日期 {payload.dateRange.label} · 營業時間 {payload.hours}
            </p>
            <ul className="dialog-menu">
              {payload.items.map((item) => (
                <li key={item.sku}>
                  <span className="dialog-menu__line">
                    <strong>{item.name}</strong>
                    <span className="dialog-menu__price">${item.priceTwd}</span>
                  </span>
                  {(item.soldOut || item.badges?.length || item.notes?.length || item.description) && (
                    <small className="dialog-menu__meta">
                      {item.soldOut && <em>預訂額滿</em>}
                      {item.badges?.map((badge) => <em key={badge}>{badge}</em>)}
                      {item.notes?.map((note) => <span key={note}>{note}</span>)}
                      {item.description && <span>{item.description}</span>}
                    </small>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {!payload && <p>內容暫時無法顯示。</p>}
        <button type="button" className="runtime-button" onClick={close}>回到小店</button>
      </div>
    </dialog>
  );
}
