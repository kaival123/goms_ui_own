import { describe, expect, it } from 'vitest'
import { guessMapping, readRows, similarity, type Field } from './columnMatch'

const people: Field[] = [
  { key: 'name', label: 'Name', required: true, aliases: ['full name', 'employee'] },
  { key: 'designation', label: 'Designation', required: true, aliases: ['role', 'position', 'title'] },
  { key: 'email', label: 'Email', required: false, aliases: ['e-mail', 'mail'] },
  { key: 'phone', label: 'Phone', required: false, aliases: ['mobile', 'contact number'] },
]

describe('similarity', () => {
  it('is 1 for the field name or an alias, ignoring case and punctuation', () => {
    expect(similarity('NAME', people[0])).toBe(1)
    expect(similarity('E-mail', people[2])).toBe(1)
    expect(similarity('Full  Name', people[0])).toBe(1)
  })
  it('scores near misses high and unrelated headers low', () => {
    expect(similarity('Designations', people[1])).toBeGreaterThan(0.8)
    expect(similarity('Notes', people[1])).toBeLessThan(0.5)
    expect(similarity('', people[0])).toBe(0)
  })
})

describe('guessMapping', () => {
  it('matches by header name even when the columns are reordered', () => {
    const m = guessMapping(people, ['Role', 'Mobile', 'Full name', 'Notes'])
    expect(m.name).toMatchObject({ column: 2, how: 'name' })
    expect(m.designation).toMatchObject({ column: 0, how: 'name' })
    expect(m.phone).toMatchObject({ column: 1, how: 'name' })
    expect(m.email).toEqual({ column: null, score: null, how: null })
  })
  it('leaves unmatched fields unmapped once any header matched by name', () => {
    const m = guessMapping(people, ['Name', 'Region', 'Notes'])
    expect(m.name).toMatchObject({ column: 0, how: 'name' })
    expect(m.designation.column).toBeNull()
    expect(m.email.column).toBeNull()
  })
  it('does not guess by position when no header looks like any field', () => {
    const m = guessMapping(people, ['A', 'B', 'C'])
    expect(Object.values(m).every((g) => g.column === null)).toBe(true)
  })
  it('never maps one column to two fields', () => {
    const m = guessMapping(people, ['Name', 'Name'])
    const cols = Object.values(m).map((g) => g.column).filter((c) => c !== null)
    expect(new Set(cols).size).toBe(cols.length)
  })
})

describe('readRows', () => {
  const mapping = guessMapping(people, ['Name', 'Role', 'Mail'])
  it('reads values through the mapping and flags rows missing a required field', () => {
    const rows = readRows([['Asha', 'Director', 'a@x.in'], ['', 'Clerk', 'c@x.in'], ['Ravi', '', '']], people, mapping)
    expect(rows[0]).toEqual({ values: ['Asha', 'Director', 'a@x.in', ''], missing: [] })
    expect(rows[1].missing).toEqual(['Name'])
    expect(rows[2].missing).toEqual(['Designation'])
  })
  it('treats short rows as blank for the missing columns', () => {
    expect(readRows([['Asha']], people, mapping)[0].missing).toEqual(['Designation'])
  })
})
