import type { Metadata } from "next";
import "./globals.css";
import { AirCompassProvider } from "@/components/AirCompassProvider";
import { Shell } from "@/components/Shell";

export const metadata: Metadata = {
  title: "AirCompass — Urban Air Quality Assistant",
  description: "GenAI-powered household air quality assistant with physics-based exposure modelling.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AirCompassProvider>
          <Shell>{children}</Shell>
        </AirCompassProvider>
      </body>
    </html>
  );
}
