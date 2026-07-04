"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

interface PopoverProps {
  trigger: (state: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  /**
   * Render the panel in a body portal with fixed positioning. Needed inside
   * scroll/overflow-clipped containers (e.g. the task modal) where an
   * absolutely-positioned panel would be cut off at the container edges.
   */
  portal?: boolean;
  className?: string;
}

const GAP = 8;
const MARGIN = 12;

/** Self-managed anchored popover with outside-click / Escape dismissal. */
export function Popover({
  trigger,
  children,
  align = "start",
  portal = false,
  className,
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<CSSProperties | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Fixed-position math for the portal path: anchor under the trigger, clamp
  // to the viewport, flip above when there's more room up top.
  useLayoutEffect(() => {
    if (!open || !portal) return;
    const place = () => {
      const anchor = ref.current?.getBoundingClientRect();
      if (!anchor) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const style: CSSProperties = { position: "fixed" };
      const below = vh - anchor.bottom - GAP;
      const above = anchor.top - GAP;
      if (below < 220 && above > below) {
        style.bottom = vh - anchor.top + GAP;
        style.maxHeight = Math.max(above - MARGIN, 140);
      } else {
        style.top = anchor.bottom + GAP;
        style.maxHeight = Math.max(below - MARGIN, 140);
      }
      if (align === "end") {
        style.right = Math.max(vw - anchor.right, MARGIN);
      } else {
        style.left = Math.max(anchor.left, MARGIN);
      }
      setCoords(style);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, portal, align]);

  const panel = open && (
    <motion.div
      ref={panelRef}
      initial={{ opacity: 0, y: -4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
      style={portal ? coords ?? { position: "fixed", opacity: 0 } : undefined}
      className={cn(
        "z-50 overflow-y-auto rounded-xl border border-line bg-surface p-1.5 shadow-pop",
        portal ? "" : "absolute mt-2",
        !portal && (align === "end" ? "right-0" : "left-0"),
        className,
      )}
    >
      {children(() => setOpen(false))}
    </motion.div>
  );

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {portal ? (
        typeof document !== "undefined" &&
        createPortal(<AnimatePresence>{panel}</AnimatePresence>, document.body)
      ) : (
        <AnimatePresence>{panel}</AnimatePresence>
      )}
    </div>
  );
}
