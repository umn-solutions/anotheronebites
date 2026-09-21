/**
 * Dynamic inline styles for SPARC components.
 *
 * SPARC's HTMDElementProps only supports `id`, `class`, and `containerSelector`
 * -- there is NO `style` prop, and HTMDElement has no pre-render style setter.
 * A `style: '...'` passed to a Container is silently dropped. The only way to
 * apply a data-driven inline style (bar widths, ramp colours, CSS custom
 * properties) is via the jQuery `.instance` once the element is mounted.
 *
 * This helper defers the application to the next macrotask, by which point the
 * route's returned tree (or a re-rendered subtree) has been rendered and
 * `.instance` is available. Supports standard properties and custom properties
 * (e.g. `--marker-color`) via the native CSSStyleDeclaration.setProperty.
 *
 * @template T
 * @param {T} component - a SPARC component (Container, Text, ...)
 * @param {Record<string, string>} styles - CSS property/value pairs
 * @returns {T} the same component, for inline use
 */
export function styleAfterRender(component, styles) {
  // Some targets live in lazily-rendered tabs, so the element may not be mounted
  // on the first tick. Retry on a short backoff before giving up.
  const apply = (remaining) => {
    const el = component && component.instance && component.instance[0]
    if (el) {
      for (const key in styles) el.style.setProperty(key, styles[key])
      return
    }
    if (remaining > 0) setTimeout(() => apply(remaining - 1), 60)
  }
  setTimeout(() => apply(20), 0)
  return component
}
