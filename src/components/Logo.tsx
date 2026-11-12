import { cn } from "@/lib/utils";

/** The institution's logo (public/logo.png) — works at any base path and offline. */
export const Logo = ({ className }: { className?: string }) => (
  <img
    src={`${import.meta.env.BASE_URL}logo.png`}
    alt="מגדל אור"
    className={cn("rounded-xl bg-white object-contain p-0.5 shadow-soft border border-border shrink-0", className)}
  />
);
