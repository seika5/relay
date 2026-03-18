import type { Metadata } from "next";
import { IdentityProvider } from "@/context/IdentityContext";
import { CallProvider } from "@/context/CallContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Relay",
  description: "E2EE messaging and voice/video for a closed circle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <IdentityProvider>
          <CallProvider>
            {children}
          </CallProvider>
        </IdentityProvider>
      </body>
    </html>
  );
}
