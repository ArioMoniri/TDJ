"use client";
import { X } from "lucide-react";
import { useBooth } from "@/lib/booth/store";

/** Status banners (round7-booth.md §1.1): sticky under the header, never toasts that vanish. */
export function Banners() {
  const banners = useBooth((s) => s.banners);
  const dismiss = useBooth((s) => s.dismissBanner);
  if (!banners.length) return null;
  return (
    <div className="booth-banners" data-testid="booth-banners" aria-live="polite">
      {banners.map((b) => (
        <div key={b.key} className="booth-banner" role="status" data-key={b.key}>
          <span className="min-w-0 flex-1">{b.text}</span>
          {b.action && (
            <button type="button" className="btn-plain font-semibold" onClick={b.action.run}>
              {b.action.label}
            </button>
          )}
          <button
            type="button"
            className="icon-btn icon-btn-bare -my-2"
            aria-label="Dismiss"
            onClick={() => dismiss(b.key)}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  );
}
