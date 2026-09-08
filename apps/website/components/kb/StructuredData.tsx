import type { JsonLdDocument } from '@/lib/content/structured-data'

interface StructuredDataProps {
  data: JsonLdDocument
}

/**
 * One `application/ld+json` block, holding the `@graph` the builder produced.
 *
 * A browser never executes a script of this type and never draws it, so nothing
 * about the page's look or behaviour changes; Google and the AI crawlers read it on
 * purpose. Exactly one per page, because a second block is a second set of
 * statements that can contradict the first, and because every node the page has to
 * say anything about already fits in one graph.
 *
 * ## Why the `<` escape
 *
 * The contents of a `<script>` are raw text: the parser ends the element at the
 * first `</script` it sees, wherever that is. A title carrying `</script` would
 * therefore close the block early and spill JSON into the document — and nothing
 * would report it, because a malformed structured-data block produces no error, only
 * silence. Escaping every `<` as `\u003c` makes that impossible; JSON parsers read
 * the escape as the character, so the data a crawler gets is unchanged.
 *
 * No content authors a `<` today. This costs one `replace` per page and removes the
 * question.
 */
export default function StructuredData({ data }: StructuredDataProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
