import { useSyncExternalStore } from "react";
import { getConsent, setConsent, subscribeConsent, type ConsentState } from "./consent";

export function useConsent(): [ConsentState, (next: "accepted" | "declined") => void] {
  const state = useSyncExternalStore(subscribeConsent, getConsent, () => "unset" as ConsentState);
  return [state, setConsent];
}
