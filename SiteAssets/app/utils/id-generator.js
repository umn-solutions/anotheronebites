/**
 * Generates a structured identifier in the format: PREFIX_NNNN_ddmmyyyy
 * @param {'PROJ' | 'PROP' | 'PROG'} prefix
 * @param {string} [startDateISO] - ISO date string (yyyy-mm-dd), defaults to today
 * @returns {string}
 */
export function generateStructuredId(prefix, startDateISO) {
  const date = startDateISO ? new Date(startDateISO) : new Date()
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  const random = Math.floor(Math.random() * 9000) + 1000
  return `${prefix}_${random}_${dd}${mm}${yyyy}`
}
