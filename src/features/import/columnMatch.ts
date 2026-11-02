/** Matches the columns of an uploaded file to the record fields an import reads.
 *
 *  Each field of the system record is paired with the header whose name is most similar, so a file with
 *  the columns in another order (or extra columns) still lands in the right fields. */

export interface Field {
  key: string
  label: string
  required: boolean
  hint?: string
  /** Other names a header for this field is commonly given. */
  aliases?: string[]
}

export interface Guess {
  /** Index of the file column feeding this field, or null when none is mapped. */
  column: number | null
  /** 0–1 similarity between the header and the field, when matched by name. */
  score: number | null
  how: 'name' | 'manual' | null
}

export type Mapping = Record<string, Guess>

/** Below this a header is not considered to be about the field at all. */
const MATCH_THRESHOLD = 0.62

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const next = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = next
    }
  }
  return row[b.length]
}

/** 0–1: how likely `header` is the column for `field` (1 = same name or a known alias). */
export function similarity(header: string, field: Field): number {
  const h = normalize(header)
  if (!h) return 0
  let best = 0
  for (const name of [field.label, field.key, ...(field.aliases ?? [])].map(normalize)) {
    if (!name) continue
    if (h === name) return 1
    if (name.length >= 3 && h.length >= 3 && (h.includes(name) || name.includes(h))) best = Math.max(best, 0.86)
    best = Math.max(best, 1 - distance(h, name) / Math.max(h.length, name.length))
  }
  return best
}

/** Pairs each field with its best-matching unused header. A header that matches no field is never guessed
 *  into one by position: it stays out of the import and the user can still map it by hand. */
export function guessMapping(fields: Field[], headers: string[]): Mapping {
  const mapping: Mapping = {}
  const used = new Set<number>()
  const candidates = fields.flatMap((field) => headers.map((header, column) => ({ field, column, score: similarity(header, field) })))
    .filter((c) => c.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
  for (const { field, column, score } of candidates) {
    if (mapping[field.key] || used.has(column)) continue
    mapping[field.key] = { column, score, how: 'name' }
    used.add(column)
  }
  for (const field of fields) mapping[field.key] ??= { column: null, score: null, how: null }
  return mapping
}

export interface ParsedRow {
  /** One value per field, in field order (empty when unmapped or blank). */
  values: string[]
  /** Labels of required fields this row leaves empty; a row with any is skipped by the import. */
  missing: string[]
}

export function readRows(table: string[][], fields: Field[], mapping: Mapping): ParsedRow[] {
  return table.map((cells) => {
    const values = fields.map((f) => {
      const column = mapping[f.key]?.column
      return column === null || column === undefined ? '' : (cells[column] ?? '')
    })
    const missing = fields.filter((f, i) => f.required && !values[i]).map((f) => f.label)
    return { values, missing }
  })
}
