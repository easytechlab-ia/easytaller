import { useRef } from "react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Optional dot color (defaults to brand accent). */
  showMark?: boolean;
  /** Optional tenant logo (base64). When set, it replaces the wordmark. */
  logoUrl?: string | null;
}

const LONG_PRESS_MS = 1000;

/**
 * EasyTaller logo — EasyTech icon + "EasyTaller" wordmark in the logo's two
 * blues (League Spartan 700). Long-press opens the demo control panel.
 */
export function Logo({ className, logoUrl }: LogoProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = () => {
    clear();
    timer.current = setTimeout(() => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("easytaller:open-panel"));
      }
    }, LONG_PRESS_MS);
  };

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="Logo del taller"
        onPointerDown={start}
        onPointerUp={clear}
        onPointerLeave={clear}
        onPointerCancel={clear}
        className={cn("h-7 w-auto max-w-[140px] object-contain select-none", className)}
      />
    );
  }

  return (
    <span
      onPointerDown={start}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      aria-label="EasyTaller"
      className={cn(
        "inline-flex items-center gap-1.5 text-base text-foreground select-none",
        className,
      )}
    >
      <img
        src="/brand/easytech-icon.svg"
        alt=""
        aria-hidden="true"
        draggable={false}
        className="h-[1.6em] w-[1.6em] shrink-0"
      />
      <span className="font-display text-[1.35em] font-bold leading-none tracking-tight">
        <span className="text-brand">Easy</span>
        <span className="text-brand-sky">Taller</span>
      </span>
    </span>
  );
}
