import buildinfoJson from "./buildinfo.json";

/**
 * Build metadata inlined by esbuild from buildinfo.json (generated at deploy
 * time by scripts/gen-buildinfo.mjs). `contentSha` is the youproof-org/content
 * commit whose privacy policy a subscriber accepts — snapshotted onto each new
 * subscription. Empty in the committed stub / local builds without a content SHA.
 */
export interface BuildInfo {
  contentSha: string;
  generatedAt: string;
}

export const buildinfo: BuildInfo = buildinfoJson;
