// Avatar colour palette for team members. Stored as a key on the member so it
// stays stable across renders; resolved to concrete colours here.

export interface MemberColor {
  key: string;
  bg: string;
  ink: string;
}

export const MEMBER_COLORS: MemberColor[] = [
  { key: "violet", bg: "#6d5efc", ink: "#ffffff" },
  { key: "blue", bg: "#3b82f6", ink: "#ffffff" },
  { key: "emerald", bg: "#10b981", ink: "#ffffff" },
  { key: "amber", bg: "#f59e0b", ink: "#1b1b21" },
  { key: "rose", bg: "#f43f5e", ink: "#ffffff" },
  { key: "pink", bg: "#ec4899", ink: "#ffffff" },
  { key: "teal", bg: "#14b8a6", ink: "#ffffff" },
  { key: "indigo", bg: "#8b5cf6", ink: "#ffffff" },
];

export function colorForKey(key: string): MemberColor {
  return MEMBER_COLORS.find((c) => c.key === key) ?? MEMBER_COLORS[0];
}

/** Deterministically pick the next colour, cycling through the palette. */
export function nextMemberColorKey(usedKeys: string[]): string {
  for (const color of MEMBER_COLORS) {
    if (!usedKeys.includes(color.key)) return color.key;
  }
  return MEMBER_COLORS[usedKeys.length % MEMBER_COLORS.length].key;
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
