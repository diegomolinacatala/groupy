// Remembers the last cloud project opened on this device so the homepage can
// offer a way back — the join code is the only handle a student has.

const KEY = "groupy:cloud:last";

export interface LastCloudProject {
  code: string;
  title: string;
}

export function parseLastCloudProject(
  raw: string | null,
): LastCloudProject | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "code" in parsed &&
      "title" in parsed &&
      typeof parsed.code === "string" &&
      typeof parsed.title === "string"
    ) {
      return { code: parsed.code, title: parsed.title };
    }
  } catch {
    // fall through
  }
  return null;
}

export function readLastCloudProjectRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveLastCloudProject(info: LastCloudProject): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(info));
  } catch {
    // Private mode / storage full: the shortcut just won't appear.
  }
}
