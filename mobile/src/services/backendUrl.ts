/**
 * backendUrl - resolves the backend base URL for web and Expo clients.
 */
import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

/**
 * Pull the dev server host from Expo when no env var is set.
 */
function getExpoHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0]?.trim();
    if (host) return host;
  }

  const scriptUrl = NativeModules.SourceCode?.getConstants?.().scriptURL as string | undefined;
  const match = scriptUrl?.match(/^[a-z]+:\/\/([^/:]+)/i);
  return match?.[1] ?? null;
}

/**
 * Build the backend base URL without hardcoding a machine IP in source.
 */
export function getBackendUrl(): string {
  const configured = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  if (configured) return configured;

  if (Platform.OS === "web") return "http://localhost:3001";

  const host = getExpoHost();
  return host ? `http://${host}:3001` : "http://localhost:3001";
}

export const BACKEND_URL = getBackendUrl();
