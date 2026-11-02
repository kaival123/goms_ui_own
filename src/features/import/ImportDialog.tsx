import { NO_PERMISSION_TITLE, useAllowed } from '@/lib/permissions'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field as FormField } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { Icon } from '@/components/ui/Icon'
import { Tabs } from '@/components/ui/Tabs'
import { DraftNotice } from '@/components/ui/DraftNotice'
import { useToast } from '@/components/ui/Toast'
import { useEmployeeMutations, useNodeMutations, useOrgRoots, usePostingNodes, useStates } from '@/lib/api'
import { useFormDraft } from '@/lib/useFormDraft'
import { downloadCsv, toCsv } from '@/lib/csv'
import { childTypesOf } from '@/lib/node-types'
import { workbookToCsv } from './workbookToCsv'
import { guessMapping, readRows, type Field, type Mapping } from './columnMatch'
import { ImportSteps, ImportWizard, type WizardPhase } from './ImportWizard'
import type { ImportChildRow, ImportEmployeeRow } from '@/data/repository'

const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls'] as const

/** `File.arrayBuffer()` is missing from jsdom's `Blob` (works fine in a real
 *  browser, but silently routes test code into its own catch branch) — use
 *  `FileReader` instead, matching `SessionImportWizard.tsx`'s own helper. */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

type Mode = 'nodes' | 'employees'

const MODES: { value: Mode; label: string }[] = [
  { value: 'nodes', label: 'Departments' },
  { value: 'employees', label: 'People' },
]

const EMPTY_IMPORT = {
  mode: 'nodes' as Mode, stateCode: null as number | null, parentId: '', raw: '', fileName: null as string | null,
  /** The file's header line; kept so a restored draft can match columns by name again. */
  header: '',
}

/** Fields each mode reads, in order — drives the sample CSV, the column matching and the rows sent to the
 *  server, so they can't drift apart. A file column that matches none of them is left out. */
const SCHEMA: Record<Mode, Field[]> = {
  nodes: [
    { key: 'name', label: 'Name', required: true },
    { key: 'type', label: 'Type', required: false, hint: 'blank falls back to the parent’s default child type' },
  ],
  employees: [
    { key: 'name', label: 'Name', required: true },
    { key: 'designation', label: 'Designation', required: true },
    { key: 'email', label: 'Email', required: false },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'connected', label: 'Connected', required: false, hint: 'yes/no — defaults to yes' },
  ],
}

/** Splits one CSV line, honouring double-quoted fields (and "" escapes) so a
 *  quoted address or designation containing a comma stays one column. */
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i += 1 }
        else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { out.push(field); field = '' }
    else field += c
  }
  out.push(field)
  return out.map((f) => f.trim())
}

/** Display names for the file's columns: its header cells, with a letter-based name for blank or missing ones
 *  (a data row can be wider than the header). */
function columnNames(headerLine: string, table: string[][]): string[] {
  const cells = headerLine ? splitCsvLine(headerLine) : []
  const width = Math.max(cells.length, ...table.map((r) => r.length), 0)
  return Array.from({ length: width }, (_, i) => cells[i] || `Column ${String.fromCharCode(65 + (i % 26))}`)
}

/** What the server receives for one ready row — the same shapes the positional importer produced. */
function toImportRow(mode: Mode, fields: Field[], values: string[]): ImportChildRow | ImportEmployeeRow {
  const get = (key: string) => values[fields.findIndex((f) => f.key === key)] ?? ''
  if (mode === 'nodes') {
    const type = get('type')
    return { name: get('name'), ...(type ? { type } : {}) } satisfies ImportChildRow
  }
  const row: ImportEmployeeRow = { name: get('name'), designation: get('designation'), email: get('email'), phone: get('phone') }
  const connected = get('connected')
  if (connected) row.connected = !/^(no|false|0|n)$/i.test(connected)
  return row
}

/** The rows of the sample file for a mode: a header and three example records. */
function sampleRows(mode: Mode): string[][] {
  const cols = SCHEMA[mode]
  const example = (n: number) => cols.map((c) => {
    if (c.key === 'name') return mode === 'nodes' ? `Department Example ${n}` : `Example Person ${n}`
    if (c.key === 'designation') return 'Deputy Director'
    if (c.key === 'email') return `person${n}@example.gov.in`
    if (c.key === 'phone') return `98765 4321${n}`
    if (c.key === 'connected') return 'yes'
    return ''
  })
  return [cols.map((c) => c.label), example(1), example(2), example(3)]
}

const sampleFileName = (mode: Mode) => `import-sample-${mode}.csv`

async function downloadSampleCsv(mode: Mode) {
  await downloadCsv(sampleFileName(mode), toCsv(sampleRows(mode)))
}

/** The same sample as a File, for when it is dragged into the drop zone instead of downloaded. */
function sampleFile(mode: Mode): File {
  return new File([toCsv(sampleRows(mode))], sampleFileName(mode), { type: 'text/csv' })
}

interface Props {
  open: boolean
  onClose: () => void
  /** Set only when opened from AdminImportModal (post sign-in) — shows a
   *  "Signed in as X / Sign out" strip so that gate's own chrome isn't lost
   *  once this swaps in for it. Omitted for the standalone/unauthenticated
   *  usage (goms-prod today), which never had a signed-in concept at all. */
  signedInAs?: string
  onSignOut?: () => void
}

export function ImportDialog({ open, onClose, signedInAs, onSignOut }: Props) {
  const toast = useToast()
  const { importChildren } = useNodeMutations()
  const { importEmployees } = useEmployeeMutations()
  const canImportNodes = useAllowed('am.departments', 'create')
  const canImportContacts = useAllowed('am.contacts', 'create')
  const allowed = canImportNodes || canImportContacts
  const { data: states = [] } = useStates()
  const [mode, setMode] = useState<Mode>('nodes')
  const [stateCode, setStateCode] = useState<number | null>(null)
  // Org records land under a department; people are posted at any posting-type
  // node (department/branch/division/office/unit), so each mode picks its
  // target from a different list.
  const { data: departments = [] } = useOrgRoots(stateCode ?? -1)
  const { data: postings = [] } = usePostingNodes(stateCode)
  const targets = mode === 'nodes' ? departments : postings
  const [parentId, setParentId] = useState('')
  const [raw, setRaw] = useState('')
  const [header, setHeader] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)

  // Wizard state: which step the import is on, how file columns map to fields, and whether the
  // matching should play its animation (it doesn't when a saved draft is simply put back).
  const [phase, setPhase] = useState<WizardPhase>('empty')
  const [mapping, setMapping] = useState<Mapping>({})
  const [runKey, setRunKey] = useState(0)
  const [animateMatch, setAnimateMatch] = useState(true)
  const [imported, setImported] = useState(0)
  const timers = useRef<number[]>([])
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }
  const clearTimers = () => { timers.current.forEach(window.clearTimeout); timers.current = [] }
  useEffect(() => clearTimers, [])

  // A single global draft slot — unlike the record-editing dialogs, an import
  // in progress isn't "for" any particular record, so there's nothing to key
  // it by except "the Import dialog". A pasted or uploaded batch can be
  // sizeable, so losing it to a reload would be the most painful case here.
  const draftForm = { mode, stateCode, parentId, raw, fileName, header }
  const draft = useFormDraft('import', draftForm, open, () => {
    setMode(EMPTY_IMPORT.mode); setStateCode(EMPTY_IMPORT.stateCode); setParentId(EMPTY_IMPORT.parentId)
    setRaw(EMPTY_IMPORT.raw); setFileName(EMPTY_IMPORT.fileName); setHeader(EMPTY_IMPORT.header)
    setPhase('empty'); setMapping({})
  })

  const fields = SCHEMA[mode]
  // Data rows (the header line is kept apart), split into cells.
  const table = useMemo(() => raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(splitCsvLine), [raw])
  const headers = useMemo(() => columnNames(header, table), [header, table])
  const parsed = useMemo(() => readRows(table, fields, mapping), [table, fields, mapping])
  const rows = useMemo(() => parsed.filter((r) => r.missing.length === 0).map((r) => toImportRow(mode, fields, r.values)), [parsed, mode, fields])
  const warnings = parsed.length - rows.length

  useEffect(() => {
    if (!open) return
    const restored = draft.take(EMPTY_IMPORT)
    if (restored) {
      setMode(restored.mode); setStateCode(restored.stateCode); setParentId(restored.parentId)
      setRaw(restored.raw); setFileName(restored.fileName); setHeader(restored.header ?? '')
      if (restored.raw) {
        const restoredTable = restored.raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(splitCsvLine)
        setMapping(guessMapping(SCHEMA[restored.mode], columnNames(restored.header ?? '', restoredTable)))
        setAnimateMatch(false); setPhase('review')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Matching plays for a moment (connectors drawing in), then the review opens.
  useEffect(() => {
    if (phase !== 'mapping') return
    const mapped = Object.values(mapping).filter((g) => g.column !== null).length
    const id = window.setTimeout(() => setPhase('review'), 1500 + mapped * 90)
    return () => window.clearTimeout(id)
  }, [phase, runKey, mapping])

  const parent = targets.find((d) => d.id === parentId)
  const childLabel = mode === 'employees'
    ? 'person'
    : parent ? childTypesOf(parent.typeKey)[0]?.label ?? 'record' : 'record'
  const isPending = importChildren.isPending || importEmployees.isPending
  const canImport = !!parentId && rows.length > 0 && !isPending && allowed
  const disabledReason = !allowed ? NO_PERMISSION_TITLE
    : !parentId ? `Choose where to import into first`
      : rows.length === 0 ? 'No row has every required column yet' : undefined

  function reset() {
    clearTimers()
    setStateCode(null); setParentId(''); setRaw(''); setHeader(''); setFileName(null)
    setPhase('empty'); setMapping({}); setImported(0)
  }

  function startMatching(nextHeaders: string[]) {
    setMapping(guessMapping(fields, nextHeaders))
    setAnimateMatch(true)
    setRunKey((k) => k + 1)
    setPhase('mapping')
  }

  function onFile(f: File) {
    setFileName(f.name)
    const isSpreadsheet = SPREADSHEET_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    // Row 1 is the header: it is used to match columns to fields, and the rest is kept verbatim.
    const text = isSpreadsheet
      ? readAsArrayBuffer(f).then(workbookToCsv)
      : f.text()
    text
      .then((t) => {
        const lines = t.split(/\r?\n/)
        const body = lines.slice(1).join('\n')
        const bodyTable = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map(splitCsvLine)
        setHeader(lines[0] ?? ''); setRaw(body)
        startMatching(columnNames(lines[0] ?? '', bodyTable))
      })
      .catch(() => {
        toast(`Could not read "${f.name}" — is it a valid ${isSpreadsheet ? 'Excel' : 'CSV'} file?`)
        setFileName(null)
      })
  }

  /** Point a field at a file column (or clear it); a column feeds one field at a time. */
  function mapField(key: string, column: number | null) {
    setAnimateMatch(false)
    setMapping((current) => {
      const next: Mapping = {}
      for (const [k, g] of Object.entries(current)) next[k] = column !== null && g.column === column ? { column: null, score: null, how: null } : g
      next[key] = column === null ? { column: null, score: null, how: null } : { column, score: null, how: 'manual' }
      return next
    })
  }

  async function submit() {
    if (!canImport) return
    setPhase('importing')
    try {
      const count = mode === 'nodes'
        ? await importChildren.mutateAsync({ parentId, rows: rows as ImportChildRow[] })
        : await importEmployees.mutateAsync({ orgNodeId: parentId, rows: rows as ImportEmployeeRow[] })
      const noun = mode === 'nodes' ? childLabel.toLowerCase() : 'person'
      const plural = mode === 'nodes' ? `${noun}s` : 'people'
      toast(`Imported ${count} ${count === 1 ? noun : plural}`)
      draft.clear()
      setImported(count)
      setPhase('done')
      // Let the success state play before the dialog goes away.
      later(1900, () => { reset(); draft.clear(); onClose() })
    } catch {
      setPhase('review')
    }
  }

  function close() { reset(); onClose() }

  const stateName = states.find((s) => s.code === stateCode)?.name
  const destination = parent
    ? { name: parent.name, sub: `${mode === 'nodes' ? 'Department' : 'Posting'}${stateName ? ` · ${stateName}` : ''}` }
    : null

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import records"
      titleNode={<>Import <span className="iw-title-accent">records</span></>}
      eyebrow={<div className="iw-eyebrow"><Icon name="FileUp" size={11} /> Import data</div>}
      headerAside={<ImportSteps phase={phase} />}
      description="Bring in a batch of org records or people from a CSV or Excel file. Columns are matched to fields by name — check the match before importing."
      size="xl"
      className="iw-dialog lg:max-w-[calc(100vw-10rem)]"
    >
      <div className="space-y-4">
        {signedInAs && (
          <div className="-mx-6 -mt-5 flex items-center justify-end gap-3 border-b border-line bg-panel/40 px-6 py-2 text-xs text-muted">
            <span>Signed in as {signedInAs}</span>
            {onSignOut && <button type="button" className="rounded-md px-2 py-1 font-medium hover:bg-ink-900/[0.06]" onClick={onSignOut}>Sign out</button>}
          </div>
        )}
        {draft.restored && <DraftNotice onDiscard={draft.discard} />}

        <Tabs
          tabs={MODES}
          value={mode}
          onChange={(next) => {
            // The column meanings differ per mode, so a batch parsed for one
            // schema is meaningless under the other — cleared rather than
            // silently reinterpreted.
            clearTimers()
            setMode(next); setParentId(''); setRaw(''); setHeader(''); setFileName(null); setPhase('empty'); setMapping({})
          }}
        />

        {/* The two pickers sit side by side at a fixed width (17rem), however wide the dialog is; each is the full row on a phone. */}
        <div className="flex flex-wrap gap-4">
          <div className="w-full sm:w-[17rem]">
          <FormField label="State">
            <Combobox
              aria-label="State"
              value={stateCode === null ? '' : String(stateCode)}
              onChange={(v) => { setStateCode(v ? Number(v) : null); setParentId('') }}
              options={states.map((s) => ({ value: String(s.code), label: s.name }))}
              placeholder="Select a state…"
              disabled={phase === 'importing' || phase === 'done'}
            />
          </FormField>
          </div>
          <div className="w-full sm:w-[17rem]">
          <FormField label={mode === 'nodes' ? 'Department to import into' : 'Posting to import into'} required>
            <Combobox
              aria-label={mode === 'nodes' ? 'Department to import into' : 'Posting to import into'}
              value={parentId}
              onChange={setParentId}
              options={targets.map((d) => ({ value: d.id, label: d.name }))}
              placeholder={stateCode !== null
                ? (mode === 'nodes' ? 'Select a department…' : 'Select a posting…')
                : 'Choose a state first'}
              disabled={stateCode === null || phase === 'importing' || phase === 'done'}
            />
          </FormField>
          </div>
        </div>

        <ImportWizard
          fields={fields}
          fileName={fileName}
          headers={headers}
          sample={table[0] ?? []}
          rowCount={table.length}
          mapping={mapping}
          runKey={runKey}
          animateMatch={animateMatch}
          rows={parsed}
          ready={rows.length}
          warnings={warnings}
          phase={phase}
          canImport={canImport}
          disabledReason={disabledReason}
          imported={imported}
          destination={destination}
          sampleName={sampleFileName(mode)}
          makeSampleFile={() => sampleFile(mode)}
          onFile={onFile}
          onMap={mapField}
          onAutoMatch={() => startMatching(headers)}
          onDownloadSample={() => { downloadSampleCsv(mode).catch((err) => toast(err instanceof Error ? err.message : 'Download failed')) }}
          onImport={submit}
        />
      </div>
    </Dialog>
  )
}
