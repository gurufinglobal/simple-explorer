"use client";
import NextLink from "next/link";
import { forwardRef, useSyncExternalStore, type ComponentProps } from "react";
import { withChain } from "@/lib/chain-selection";

function subscribe(update: () => void) {
  window.addEventListener("explorer:chain-changed", update);
  window.addEventListener("popstate", update);
  return () => {
    window.removeEventListener("explorer:chain-changed", update);
    window.removeEventListener("popstate", update);
  };
}
/** Explicit historical links retain their context; server HTML waits for client chain hydration. */
const ChainLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof NextLink>>(function ChainLink({ href, ...props }, ref) {
  const target = useSyncExternalStore(subscribe, () => {
    try { return typeof href === "string" && href.startsWith("/") && !href.startsWith("//") ? withChain(href) : href; }
    catch { return href; } // Invalid configuration is shown by the route boundary.
  }, () => href);
  return <NextLink ref={ref} href={target} {...props} />;
});
export default ChainLink;
