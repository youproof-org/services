/**
 * The word for each KB entity type, per locale, and its inflected forms. An entity
 * names one of its type's variants (a theorem can be a `lemma`), or gets the
 * type's `default`. Variant keys are language-independent; each locale declares
 * the case keys it inflects for, and every variant in that locale defines exactly
 * those, so a display template's case is valid for any target in the locale.
 *
 * The registry is data (the website's lib/i18n/entity-labels.json); everything here
 * takes it parsed, so a reader can load it from wherever it lives.
 */

export const KB_ENTITY_TYPES = ['definition', 'theorem', 'proof', 'remark'] as const
export type KbEntityType = (typeof KB_ENTITY_TYPES)[number]

export const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export interface InflectedForm {
  base: string
  suffix?: string
}

export interface EntityLabels {
  canonical: string
  cases?: Record<string, InflectedForm>
}

export interface EntityLabelVariant {
  canonical: string
  cases: Record<string, InflectedForm>
}

export interface EntityLabelType {
  default: string
  variants: Record<string, EntityLabelVariant>
}

export type EntityLabelLocale = { cases: string[] } & Record<KbEntityType, EntityLabelType>

export type EntityLabelRegistry = Record<string, EntityLabelLocale>

export function validateEntityLabelRegistry(registry: EntityLabelRegistry, locales: readonly string[]): string[] {
  const errors: string[] = []
  for (const locale of locales) {
    if (!Object.prototype.hasOwnProperty.call(registry, locale)) {
      errors.push(`locale '${locale}' has no entity labels`)
    }
  }
  for (const [locale, entry] of Object.entries(registry)) {
    if (!locales.includes(locale)) errors.push(`'${locale}' is not a configured locale`)
    const declared = entry.cases ?? []
    if (!Array.isArray(entry.cases)) errors.push(`${locale}: 'cases' must list the locale's case keys`)
    for (const key of declared) {
      if (!KEBAB_CASE.test(key)) errors.push(`${locale}: case key '${key}' is not kebab-case`)
    }
    if (new Set(declared).size !== declared.length) errors.push(`${locale}: 'cases' lists a key twice`)
    for (const type of KB_ENTITY_TYPES) {
      const labelType = entry[type]
      if (!labelType) {
        errors.push(`${locale}.${type}: missing`)
        continue
      }
      const variants = labelType.variants ?? {}
      if (!Object.prototype.hasOwnProperty.call(variants, labelType.default)) {
        errors.push(`${locale}.${type}: default '${labelType.default}' is not one of its variants`)
      }
      for (const [name, variant] of Object.entries(variants)) {
        const where = `${locale}.${type}.${name}`
        if (!KEBAB_CASE.test(name)) errors.push(`${where}: variant key is not kebab-case`)
        if (!variant.canonical) errors.push(`${where}: no canonical word`)
        else if (variant.canonical !== variant.canonical.toLowerCase()) {
          errors.push(`${where}: canonical '${variant.canonical}' is not lowercase`)
        }
        const defined = Object.keys(variant.cases ?? {})
        for (const key of declared) {
          if (!defined.includes(key)) errors.push(`${where}: missing case '${key}'`)
        }
        for (const key of defined) {
          if (!declared.includes(key)) errors.push(`${where}: case '${key}' is not declared for '${locale}'`)
          else if (!variant.cases[key].base) errors.push(`${where}: case '${key}' has no base`)
        }
      }
    }
  }
  return errors
}

function localeEntry(registry: EntityLabelRegistry, locale: string): EntityLabelLocale {
  const entry = registry[locale]
  if (!entry) throw new Error(`No entity labels for locale '${locale}'`)
  return entry
}

function labelType(registry: EntityLabelRegistry, locale: string, type: string): EntityLabelType {
  const entry = localeEntry(registry, locale)
  if (!(KB_ENTITY_TYPES as readonly string[]).includes(type)) {
    throw new Error(`'${type}' is not a KB entity type`)
  }
  return entry[type as KbEntityType]
}

/** The case keys a locale's display templates may name in `base` and `suffix`. */
export function entityLabelCases(registry: EntityLabelRegistry, locale: string): readonly string[] {
  return localeEntry(registry, locale).cases
}

/** The variant keys an entity of `type` may name in its `label`. */
export function entityLabelVariants(registry: EntityLabelRegistry, locale: string, type: string): readonly string[] {
  return Object.keys(labelType(registry, locale, type).variants)
}

/** The variant an entity of `type` uses: the one it names, or the type's default. */
export function entityLabelVariant(registry: EntityLabelRegistry, locale: string, type: string, variant?: string): string {
  return variant ?? labelType(registry, locale, type).default
}

export function entityLabels(registry: EntityLabelRegistry, locale: string, type: string, variant?: string): EntityLabels {
  const t = labelType(registry, locale, type)
  const name = entityLabelVariant(registry, locale, type, variant)
  const found = Object.prototype.hasOwnProperty.call(t.variants, name) ? t.variants[name] : undefined
  if (!found) {
    throw new Error(
      `'${name}' is not a ${type} label in '${locale}'. Known: ${Object.keys(t.variants).join(', ')}`,
    )
  }
  return { canonical: found.canonical, cases: found.cases }
}
