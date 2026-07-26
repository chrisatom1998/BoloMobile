import type { Metadata } from "next";
import { headers } from "next/headers";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const instrumentSerif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400" });

const FALLBACK_ORIGIN = "http://localhost:3000";

function requestOrigin(host: string | null, proto: string | null): URL {
  // Forwarded headers may hold a comma-separated hop list; only the first entry is the client-facing host.
  const firstHost = host?.split(",")[0].trim() || "localhost:3000";
  const firstProto = proto?.split(",")[0].trim() || (firstHost.includes("localhost") ? "http" : "https");
  try {
    const url = new URL(`${firstProto}://${firstHost}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : new URL(FALLBACK_ORIGIN);
  } catch {
    return new URL(FALLBACK_ORIGIN);
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const incomingHeaders = await headers();
  const base = requestOrigin(
    incomingHeaders.get("x-forwarded-host") ?? incomingHeaders.get("host"),
    incomingHeaders.get("x-forwarded-proto"),
  );
  const origin = base.origin;

  return {
    metadataBase: base,
    title: "Bolo — Hindi for real moments",
    description: "Practice practical Hindi through 30 real-life scenes, Asha voice coaching, natural Hindi audio, pronunciation feedback, and offline learning.",
    icons: { icon: "/bolo-icon.png", shortcut: "/bolo-icon.png", apple: "/bolo-icon.png" },
    openGraph: {
      title: "Bolo — Hindi for real moments",
      description: "Learn Hindi by living the moment with practical scenes and optional AI coaching.",
      type: "website",
      url: origin,
      images: [{ url: `${origin}/og.png`, width: 1731, height: 909, alt: "Bolo — Hindi for real moments" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Bolo — Hindi for real moments",
      description: "Practical Hindi for the conversations that happen in real life.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${dmSans.variable} ${instrumentSerif.variable}`}>{children}</body></html>;
}
