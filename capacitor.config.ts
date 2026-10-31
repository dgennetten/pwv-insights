import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.gennetten.pwvinsights',
  appName: 'PWV Insights',
  webDir: 'dist',
  server: {
    // Uses bundled web assets; API calls go to production
    androidScheme: 'https', // Default scheme; origin will be https://localhost
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
    },
  },
};

export default config;
