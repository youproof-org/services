import data from '@/.generated/consent-policy.json'
import type { PolicyPage } from './pages'

/**
 * Typed access to the generated consent-policy data.
 *
 * The JSON is written by scripts/gen-cookie-policy-version.mjs from the content
 * repo's page front matter (`cookie-policy-version`, plus `locale`/`slug`/`title`
 * for the banner's links). It is GENERATED, gitignored, and never committed —
 * .generated/ exists precisely so build artifacts do not sit in the tree
 * pretending to be source. Every entry point that needs it runs the generator
 * first: `predev`, `prebuild`, and the `typecheck` script.
 *
 * With no content checkout the generator still writes a valid file with version
 * 0. That is the "content not present in this build" state, and ConsentGate
 * renders nothing at all in it — which is what keeps production inert until the
 * rewritten cookie policy is promoted to stable/released.
 */

export const cookiePolicyVersion: number = data.cookiePolicyVersion

export const policyPages: readonly PolicyPage[] = data.pages

/** Whether this build has the content it needs to ask for consent at all. */
export const isConsentConfigured: boolean = cookiePolicyVersion >= 1 && policyPages.length > 0
