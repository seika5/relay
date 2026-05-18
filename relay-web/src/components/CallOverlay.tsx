"use client";

import { useCall } from "@/context/CallContext";
import { FullWindowCallView } from "./FullWindowCallView";

/** Renders full-window call view when in call and user clicked to expand. */
export function CallOverlay() {
  const { inCall, callExpanded } = useCall();
  if (!inCall || !callExpanded) return null;
  return <FullWindowCallView />;
}
