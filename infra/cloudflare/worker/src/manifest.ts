import manifestJson from "./manifest.json";
import type { Manifest } from "./types";

/**
 * Validate the shape of the bundled manifest at import time. Because the
 * manifest is bundled into the Worker, this runs once when the module is first
 * evaluated. esbuild inlines `manifest.json`, so a structurally broken manifest
 * surfaces here at build/startup rather than silently misbehaving at runtime.
 *
 * Note: `pnpm run validate-manifest` performs the authoritative JSON-Schema
 * validation (against `manifest.schema.json`) in CI before deploy. This runtime
 * check is a lightweight backstop, not a replacement for it.
 */
function validate(raw: unknown): Manifest {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("manifest.json: root must be an object");
  }
  const m = raw as Record<string, unknown>;

  if (typeof m.version !== "number") {
    throw new Error("manifest.json: 'version' must be a number");
  }
  if (typeof m.updatedAt !== "string") {
    throw new Error("manifest.json: 'updatedAt' must be a string");
  }
  if (typeof m.entries !== "object" || m.entries === null) {
    throw new Error("manifest.json: 'entries' must be an object");
  }

  for (const [key, value] of Object.entries(m.entries as Record<string, unknown>)) {
    if (typeof value !== "string") {
      throw new Error(`manifest.json: entry '${key}' must map to a string`);
    }
    if (!key.startsWith("/") || !value.startsWith("/")) {
      throw new Error(`manifest.json: entry '${key}' -> '${value}' must use leading-slash paths`);
    }
  }

  return m as unknown as Manifest;
}

const manifest: Manifest = validate(manifestJson);

/**
 * Look up a normalized request path in the migration manifest.
 *
 * @param path A path already normalized by `normalizePath` (leading slash, no
 *   trailing slash except root). Returns the new `.org` path if the path has
 *   been migrated, or `null` if not.
 */
export function lookup(path: string): string | null {
  return Object.prototype.hasOwnProperty.call(manifest.entries, path)
    ? manifest.entries[path]
    : null;
}

export { manifest };
