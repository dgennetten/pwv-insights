/**
 * Geolocation tracking abstraction for web and Capacitor.
 * 
 * - Web: Uses navigator.geolocation with Screen Wake Lock
 * - Capacitor: Uses @capacitor-community/background-geolocation with foreground service
 */

import { Capacitor } from '@capacitor/core';

// Re-export standard types for convenience
export interface GeolocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

export interface GeolocationPositionError {
  code: number;
  message: string;
}

export type PositionCallback = (position: GeolocationPosition) => void;
export type ErrorCallback = (error: GeolocationPositionError) => void;

export interface WatchOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  altitudeAccuracy?: number;
  bearing?: number;
  speed?: number;
  time: number;
}

interface LocationError {
  code: string;
}

interface BackgroundGeolocationPlugin {
  addWatcher: (options: Record<string, unknown>, callback: (location: LocationData | null, error: LocationError | null) => void) => Promise<string>;
  removeWatcher: (options: { id: string }) => Promise<void>;
}

let BackgroundGeolocation: BackgroundGeolocationPlugin | null = null;

// Lazy-load the plugin only on native platforms
async function getBackgroundGeolocation(): Promise<BackgroundGeolocationPlugin | null> {
  if (Capacitor.isNativePlatform() && !BackgroundGeolocation) {
    const module = await import('@capacitor-community/background-geolocation');
    // The plugin exports everything including BackgroundGeolocation at the top level
    BackgroundGeolocation = (module as BackgroundGeolocationPlugin & { BackgroundGeolocation?: BackgroundGeolocationPlugin }).BackgroundGeolocation || (module as unknown as BackgroundGeolocationPlugin);
  }
  return BackgroundGeolocation;
}

/**
 * Check if geolocation is available on this platform.
 */
export function isGeolocationAvailable(): boolean {
  if (Capacitor.isNativePlatform()) {
    return true; // BackgroundGeolocation plugin is always available on native
  }
  return 'geolocation' in navigator;
}

/**
 * Start watching the user's position.
 * Returns a watch ID that can be passed to clearWatch().
 */
export async function watchPosition(
  successCallback: PositionCallback,
  errorCallback?: ErrorCallback,
  options?: WatchOptions
): Promise<number | string> {
  if (Capacitor.isNativePlatform()) {
    const bg = await getBackgroundGeolocation();
    if (!bg) {
      throw new Error('BackgroundGeolocation plugin not available');
    }

    // Add the watcher
    const watcherId: string = await bg.addWatcher(
      {
        backgroundMessage: 'Recording GPS track',
        backgroundTitle: 'PWV Patrol Tracking',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0, // Report all positions
      },
      (location: LocationData | null, error: LocationError | null) => {
        if (error) {
          if (error.code === 'NOT_AUTHORIZED') {
            errorCallback?.({
              code: 1, // PERMISSION_DENIED
              message: 'Location permission denied',
            });
          }
          return;
        }

        if (!location) return;

        // Convert to standard format
        successCallback({
          coords: {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy ?? null,
            altitude: location.altitude ?? null,
            altitudeAccuracy: location.altitudeAccuracy ?? null,
            heading: location.bearing ?? null,
            speed: location.speed ?? null,
          },
          timestamp: location.time,
        });
      }
    );

    return watcherId;
  } else {
    // Web platform: use navigator.geolocation
    if (!navigator.geolocation) {
      throw new Error('Geolocation not available');
    }

    return navigator.geolocation.watchPosition(
      (pos) => {
        successCallback({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
            altitude: pos.coords.altitude ?? null,
            altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
            heading: pos.coords.heading ?? null,
            speed: pos.coords.speed ?? null,
          },
          timestamp: pos.timestamp,
        });
      },
      errorCallback,
      options
    );
  }
}

/**
 * Stop watching the user's position.
 */
export async function clearWatch(watchId: number | string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const bg = await getBackgroundGeolocation();
    if (bg) {
      await bg.removeWatcher({ id: watchId as string });
    }
  } else {
    if (navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId as number);
    }
  }
}

/**
 * Get the current position (one-time request).
 */
export async function getCurrentPosition(
  options?: WatchOptions
): Promise<GeolocationPosition> {
  if (Capacitor.isNativePlatform()) {
    // On native, use watchPosition and stop it after first result
    return new Promise<GeolocationPosition>((resolve, reject) => {
      let watchId: number | string | null = null;
      let resolved = false;
      
      void watchPosition(
        (position) => {
          if (!resolved) {
            resolved = true;
            if (watchId !== null) {
              void clearWatch(watchId);
            }
            resolve(position);
          }
        },
        (error) => {
          if (!resolved) {
            resolved = true;
            if (watchId !== null) {
              void clearWatch(watchId);
            }
            reject(error);
          }
        },
        options
      ).then(id => {
        watchId = id;
      }).catch(reject);
    });
  } else {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not available'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
              altitude: pos.coords.altitude ?? null,
              altitudeAccuracy: pos.coords.altitudeAccuracy ?? null,
              heading: pos.coords.heading ?? null,
              speed: pos.coords.speed ?? null,
            },
            timestamp: pos.timestamp,
          });
        },
        reject,
        options
      );
    });
  }
}
