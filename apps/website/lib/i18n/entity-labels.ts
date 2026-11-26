import 'server-only'
import {
  entityLabelCases as registryCases,
  entityLabels as registryLabels,
  entityLabelVariant as registryVariant,
  entityLabelVariants as registryVariants,
  validateEntityLabelRegistry,
  type EntityLabelRegistry,
  type EntityLabels,
} from '@youproof.org/content-model'
import registryData from './entity-labels.json'
import { LOCALES } from './config'

export { KB_ENTITY_TYPES, KEBAB_CASE, validateEntityLabelRegistry } from '@youproof.org/content-model'
export type {
  EntityLabelLocale,
  EntityLabelRegistry,
  EntityLabelType,
  EntityLabelVariant,
  KbEntityType,
} from '@youproof.org/content-model'

const REGISTRY = registryData as EntityLabelRegistry

const registryErrors = validateEntityLabelRegistry(REGISTRY, LOCALES)
if (registryErrors.length > 0) {
  throw new Error(`lib/i18n/entity-labels.json is invalid:\n  ${registryErrors.join('\n  ')}`)
}

/** The case keys a locale's display templates may name in `base` and `suffix`. */
export function entityLabelCases(locale: string): readonly string[] {
  return registryCases(REGISTRY, locale)
}

/** The variant keys an entity of `type` may name in its `label`. */
export function entityLabelVariants(locale: string, type: string): readonly string[] {
  return registryVariants(REGISTRY, locale, type)
}

/** The variant an entity of `type` uses: the one it names, or the type's default. */
export function entityLabelVariant(locale: string, type: string, variant?: string): string {
  return registryVariant(REGISTRY, locale, type, variant)
}

export function entityLabels(locale: string, type: string, variant?: string): EntityLabels {
  return registryLabels(REGISTRY, locale, type, variant)
}
