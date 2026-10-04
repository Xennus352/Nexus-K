// Parses a gateway's stored JSON config. Never throws: a half-written config
// row must not take the whole deposit page down.

export function readConfig(config: string | null | undefined): Record<string, string> {
  try {
    const parsed = JSON.parse(config ?? "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch {
    /* treat malformed JSON as an empty config */
  }
  return {};
}

export function writeConfig(config: Record<string, string>): string {
  return JSON.stringify(config);
}

/** Parses a JSON array column, returning `[]` when absent or malformed. */
export function readArray<T>(raw: string | null | undefined): T[] {
  try {
    const parsed = JSON.parse(raw ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}