import type { Metadata } from "next";
import { headers } from "next/headers";
import GameBoundary from "@/components/game/GameBoundary";

function getRequestOrigin(requestHeaders: Headers) {
  const forwardedHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const forwardedProto = requestHeaders.get("x-forwarded-proto") ?? (forwardedHost.startsWith("localhost") ? "http" : "https");
  return `${forwardedProto}://${forwardedHost}`;
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const origin = getRequestOrigin(requestHeaders);
  const title = "Goody Pâtisserie｜古迪法式甜點";
  const description = "台北巷弄裡的法式甜點小店。慢慢做、好好吃，來看看今天店裡的甜點日常。";

  return {
    metadataBase: new URL(origin),
    title,
    description,
    openGraph: { title, description, type: "website", url: origin, images: [{ url: "/og.png", width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
  };
}

export default function Home() {
  return <GameBoundary />;
}
