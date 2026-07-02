// Avatar colour palette for team members. Stored as a key on the member so it
// stays stable across renders; resolved to concrete colours here.

export interface MemberColor {
  key: string;
  bg: string;
  ink: string;
}

// Muted, editorial palette — keys are stable (persisted on members),
// only the resolved colours changed with the redesign.
export const MEMBER_COLORS: MemberColor[] = [
  { key: "violet", bg: "#5b54c9", ink: "#ffffff" },
  { key: "blue", bg: "#3e6fb4", ink: "#ffffff" },
  { key: "emerald", bg: "#348566", ink: "#ffffff" },
  { key: "amber", bg: "#c08a2d", ink: "#ffffff" },
  { key: "rose", bg: "#c25462", ink: "#ffffff" },
  { key: "pink", bg: "#b95792", ink: "#ffffff" },
  { key: "teal", bg: "#35948c", ink: "#ffffff" },
  { key: "indigo", bg: "#7263c9", ink: "#ffffff" },
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
