/**
 * API base URL configuration for web and Capacitor environments.
 * 
 * - Web (dev): proxied via Vite to localhost:3001
 * - Web (prod): relative URLs to the same origin (pwv-insights.gennetten.org)
 * - Capacitor (Android): absolute URLs to production backend
 * 
 * Android origin is https://localhost (Capacitor's default androidScheme).
 * The PHP backend already sends Access-Control-Allow-Origin: * for all endpoints.
 */

import { Capacitor } from '@capacitor/core';

export const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://pwv-insights.gennetten.org'
  : '';

/**
 * Constructs a full API URL, handling both relative and absolute paths.
 */
export function apiUrl(path: string): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
