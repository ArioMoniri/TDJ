"use client";
import { useEffect } from "react";
import { toast as showToast, useGlobalToast } from "@/lib/toast";
import { Toast } from "./Toast";

export function GlobalToast() {
  const { toast, dismiss } = useGlobalToast();
  // (the e2e raises a toast of a given length on any page: e2e/prelisten-toast.spec.ts, as `__tdjBooth` for the Booth)
  useEffect(() => {
    (window as unknown as { __tdjToast?: typeof showToast }).__tdjToast = showToast;
  }, []);
  return <Toast toast={toast} onDismiss={dismiss} />;
}
