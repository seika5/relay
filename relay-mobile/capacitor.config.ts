import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.relay.e2emessenger",
  appName: "Relay",
  // Static export from relay-web/ lands in relay-web/out/
  webDir: "../relay-web/out",
  ios: {
    // Minimum deployment target aligns with Web Push + modern WebKit (iOS 16.4+)
    deploymentTarget: "16.4",
  },
};

export default config;
