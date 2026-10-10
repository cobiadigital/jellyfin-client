import type { CapacitorConfig } from '@capacitor/cli';

// Fire TV wrapper: the built web app (dist/) is bundled into an Android WebView.
// The page origin is https://localhost, so the Jellyfin server must be HTTPS and allow that origin via CORS.
const config: CapacitorConfig = {
  appId: 'app.cobia.jellyfin',
  appName: 'Jellyfin Music',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
