import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.gennetten.pwvinsights',
  appName: 'PWV Insights',
  webDir: 'dist',
  server: {
    // Point to the live backend for API calls
    url: undefined, // Uses bundled web assets; API calls go to production
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
    },
  },
};

export default config;
