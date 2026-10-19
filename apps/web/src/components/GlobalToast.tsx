"use client";
import { useGlobalToast } from "@/lib/toast";
import { Toast } from "./Toast";

export function GlobalToast() {
  const { toast, dismiss } = useGlobalToast();
  return <Toast toast={toast} onDismiss={dismiss} />;
}
