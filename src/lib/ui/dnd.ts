"use client";

import {
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

/**
 * Touch screens need a short press-and-hold before a drag starts: an instant
 * drag would steal every swipe that begins on a task, and the page could never
 * scroll on a phone. A quick swipe scrolls; a ~0.2s hold picks the task up.
 */
const TOUCH_HOLD_MS = 200;
/** Finger jitter allowed during the hold before it counts as a scroll. */
const TOUCH_TOLERANCE_PX = 8;

/**
 * Shared drag sensors for every dnd-kit surface: mouse drags start after a
 * small movement (so a click still opens the task), touch drags after a hold.
 * Draggables pair with the `.drag-item` class (globals.css), which keeps native
 * scrolling and blocks the iOS long-press callout / text selection.
 */
export function useDragSensors(mouseDistance = 6) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: mouseDistance } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_HOLD_MS,
        tolerance: TOUCH_TOLERANCE_PX,
      },
    }),
  );
}
