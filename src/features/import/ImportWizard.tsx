import { useEffect, useLayoutEffect, useRef, useState, type DragEvent } from 'react'
import { AnimatePresence, animate, motion } from 'framer-motion'
import { Icon } from '@/components/ui/Icon'
import { cn } from '@/lib/utils'
import type { Field, Mapping, ParsedRow } from './columnMatch'
import './importWizard.css'

export type WizardPhase = 'empty' | 'mapping' | 'review' | 'importing' | 'done'

/** Drag type carried by the sample chip, so the drop zone can tell it from a file dragged in from outside. */
const SAMPLE_DRAG = 'application/x-goms-import-sample'
const PREVIEW_ROWS = 5
const MAX_CHIPS = 8
const EASE = [0.22, 1, 0.36, 1] as const
const LINE_START = 0.2 // s before the first connector starts drawing
const LINE_STEP = 0.09 // s between connectors
const SKIP_LENGTH = 24 // px: how far the red line of an unused column runs before its cross
const CROSS = 4.5 // px: half-size of that cross

const STEPS = ['File', 'Columns', 'Review', 'Import'] as const
const ACTIVE_STEP: Record<WizardPhase, number> = { empty: 0, mapping: 1, review: 2, importing: 3, done: 4 }

/** The four-step indicator shown in the dialog header. */
export function ImportSteps({ phase }: { phase: WizardPhase }) {
  const at = ACTIVE_STEP[phase]
  return (
    <ol className="iw-steps" aria-label="Import progress">
      {STEPS.map((label, i) => {
        const state = i < at ? 'done' : i === at ? 'active' : 'todo'
        return (
          <li key={label} className="iw-step" data-state={state} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="iw-step-num">{state === 'done' ? <Icon name="Check" size={11} strokeWidth={3} /> : i + 1}</span>
            {label}
          </li>
        )
      })}
    </ol>
  )
}

/** Turns on `delay` ms after `on` becomes true (immediately when delay is 0), so chips, nodes and tabs
 *  light up in step with their connector being drawn. */
function useLit(on: boolean, delay: number, replay: number) {
  const [lit, setLit] = useState(delay === 0 && on)
  useEffect(() => {
    if (!on) { setLit(false); return }
    if (delay === 0) { setLit(true); return }
    setLit(false)
    const id = window.setTimeout(() => setLit(true), delay)
    return () => window.clearTimeout(id)
  }, [on, delay, replay])
  return lit
}

/** Counts up to `value` (and follows later changes) instead of jumping. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLElement>(null)
  const shown = useRef(0)
  useEffect(() => {
    const controls = animate(shown.current, value, {
      duration: 0.9, ease: EASE,
      onUpdate: (v) => { shown.current = v; if (ref.current) ref.current.textContent = String(Math.round(v)) },
    })
    return () => controls.stop()
  }, [value])
  return <strong ref={ref}>0</strong>
}

interface ChipProps {
  name: string
  sample: string
  matched: boolean
  picked: boolean
  litDelay: number
  replay: number
  nodeRef: (el: HTMLElement | null) => void
  onClick: () => void
}
function Chip({ name, sample, matched, picked, litDelay, replay, nodeRef, onClick }: ChipProps) {
  const lit = useLit(matched, litDelay, replay)
  return (
    <motion.button
      type="button"
      className="iw-chip"
      data-lit={lit}
      data-skip={!matched}
      data-picked={picked}
      onClick={onClick}
      title={`Column “${name}”${matched ? '' : ' — not imported'}`}
      initial={litDelay ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay: litDelay ? Math.max(0, litDelay / 1000 - 0.3) : 0 }}
    >
      <strong>{name}</strong>
      <span>{sample || ' '}</span>
      {!matched && <em>not imported</em>}
      <i className="iw-node" data-edge="bottom" data-lit={lit} data-skip={!matched} ref={nodeRef} />
    </motion.button>
  )
}

interface TabProps {
  field: Field
  sourceName: string | null
  picked: boolean
  litDelay: number
  replay: number
  nodeRef: (el: HTMLElement | null) => void
  onClick: () => void
  onClear: () => void
}
function Tab({ field, sourceName, picked, litDelay, replay, nodeRef, onClick, onClear }: TabProps) {
  const lit = useLit(sourceName !== null, litDelay, replay)
  return (
    <div className="iw-tab" data-lit={lit} data-picked={picked} role="button" tabIndex={0} onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      aria-label={`${field.label}${field.required ? ' (required)' : ''}${sourceName ? `, from column ${sourceName}` : ', no column chosen'}`}>
      <i className="iw-node" data-edge="top" data-lit={lit} ref={nodeRef} />
      <strong>{field.label}{field.required && <i className="iw-req" title="Required" />}</strong>
      <span>{sourceName !== null ? `← ${sourceName}` : field.required ? 'required' : 'optional'}</span>
      {sourceName !== null && (
        <button type="button" className="iw-tab-x" aria-label={`Unmap ${field.label}`}
          onClick={(e) => { e.stopPropagation(); onClear() }}><Icon name="X" size={9} strokeWidth={2.6} /></button>
      )}
    </div>
  )
}

interface Props {
  fields: Field[]
  fileName: string | null
  headers: string[]
  sample: string[]
  rowCount: number
  mapping: Mapping
  /** Changes whenever the matching should (re)play its animation. */
  runKey: number
  /** False when a restored draft is shown, so it appears settled rather than replaying the sequence. */
  animateMatch: boolean
  rows: ParsedRow[]
  ready: number
  warnings: number
  phase: WizardPhase
  canImport: boolean
  disabledReason?: string
  imported: number
  destination: { name: string; sub: string } | null
  sampleName: string
  /** Builds the sample file when the sample chip is dropped into the drop zone. */
  makeSampleFile: () => File
  onFile: (file: File) => void
  onMap: (fieldKey: string, column: number | null) => void
  onAutoMatch: () => void
  onDownloadSample: () => void
  onImport: () => void
}

export function ImportWizard(p: Props) {
  const { fields, phase, mapping, headers } = p
  const hasFile = p.fileName !== null
  const fileRef = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [dragging, setDragging] = useState(false) // the sample chip is being dragged
  const [picked, setPicked] = useState<{ kind: 'chip' | 'field'; id: string | number } | null>(null)

  // ---- which source columns get a chip: the first few, plus any that are mapped
  const mappedCols = new Set(Object.values(mapping).map((g) => g.column).filter((c): c is number => c !== null))
  const shown = headers.map((_, i) => i).filter((i) => i < MAX_CHIPS || mappedCols.has(i))
  const hidden = headers.length - shown.length

  // ---- connectors: measured from the chip and tab nodes, redrawn when layout changes
  const mapRef = useRef<HTMLDivElement>(null)
  const chipNodes = useRef<Record<number, HTMLElement | null>>({})
  const tabNodes = useRef<Record<string, HTMLElement | null>>({})
  const [geom, setGeom] = useState<{ key: string; x1: number; y1: number; x2: number; y2: number }[]>([])
  // Columns no field reads: a short red line that ends in a cross, never reaching a card.
  const [skips, setSkips] = useState<{ col: number; x: number; y1: number; y2: number }[]>([])
  const mappedFields = fields.filter((f) => mapping[f.key]?.column !== null && mapping[f.key]?.column !== undefined && shown.includes(mapping[f.key].column as number))
  // Centre of a node in the map's own coordinates, from layout offsets: unlike getBoundingClientRect these
  // ignore the dialog's open animation and the chips' entrance motion, so the lines never start off-centre.
  const centre = (el: HTMLElement | null | undefined) => {
    const root = mapRef.current
    if (!el || !root) return null
    let x = 0
    let y = 0
    for (let n: HTMLElement | null = el; n && n !== root; n = n.offsetParent as HTMLElement | null) { x += n.offsetLeft; y += n.offsetTop }
    return { x: x + el.offsetWidth / 2, y: y + el.offsetHeight / 2 }
  }
  const measure = () => {
    if (!mapRef.current || !hasFile) { setGeom((prev) => (prev.length ? [] : prev)); setSkips((prev) => (prev.length ? [] : prev)); return }
    const next = mappedFields.flatMap((f) => {
      const a = centre(chipNodes.current[mapping[f.key].column as number])
      const b = centre(tabNodes.current[f.key])
      if (!a || !b) return []
      return [{ key: f.key, x1: a.x, y1: a.y, x2: b.x, y2: b.y }]
    })
    // Keep the old array when nothing moved, so measuring never causes another render.
    setGeom((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    const dead = shown.filter((col) => !mappedCols.has(col)).flatMap((col) => {
      const a = centre(chipNodes.current[col])
      return a ? [{ col, x: a.x, y1: a.y, y2: a.y + SKIP_LENGTH }] : []
    })
    setSkips((prev) => (JSON.stringify(prev) === JSON.stringify(dead) ? prev : dead))
  }
  const measureLatest = useRef(measure)
  measureLatest.current = measure
  const measureKey = JSON.stringify([mapping, headers.length, hasFile, phase === 'empty'])
  useLayoutEffect(measure, [measureKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = mapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureLatest.current())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ---- click-to-map: pick a column chip and a field tab, in either order
  function pick(kind: 'chip' | 'field', id: string | number) {
    if (picked && picked.kind !== kind) {
      const column = kind === 'chip' ? (id as number) : (picked.id as number)
      const field = kind === 'field' ? (id as string) : (picked.id as string)
      p.onMap(field, column)
      setPicked(null)
      return
    }
    setPicked(picked?.kind === kind && picked.id === id ? null : { kind, id })
  }

  function takeFile(file: File | undefined) {
    if (!file) return
    p.onFile(file)
  }
  const accepts = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).some((t) => t === 'Files' || t === SAMPLE_DRAG)
  function onDrop(e: DragEvent) {
    e.preventDefault()
    setOver(false)
    setDragging(false)
    if (Array.from(e.dataTransfer.types ?? []).includes(SAMPLE_DRAG)) {
      takeFile(p.makeSampleFile())
      return
    }
    takeFile(e.dataTransfer.files?.[0])
  }

  const nodeCount = fields.length
  const matchedColumns = mappedFields.length
  const skipped = Math.max(0, headers.length - new Set(Object.values(mapping).map((g) => g.column).filter((c) => c !== null)).size)
  const showRows = phase === 'review' || phase === 'importing' || phase === 'done'
  const previewed = p.rows.slice(0, PREVIEW_ROWS)
  const importing = phase === 'importing'
  const done = phase === 'done'
  const lineDelay = (i: number) => (p.animateMatch ? LINE_START + i * LINE_STEP : 0)

  const caption =
    phase === 'empty' ? 'Drop a CSV or Excel file: its columns are matched to the record fields.'
      : phase === 'mapping' ? 'Matching columns by name similarity…'
        : phase === 'done' ? `Done: ${p.imported} ${p.imported === 1 ? 'record' : 'records'} imported.${p.warnings ? ` The ${p.warnings} row${p.warnings === 1 ? '' : 's'} with warnings were left out.` : ''}`
          : phase === 'importing' ? 'Importing…'
            : p.ready === 0 ? 'No row can be imported yet — check which columns feed the required fields.'
              : `${matchedColumns} column${matchedColumns === 1 ? '' : 's'} matched${skipped ? ` · ${skipped} not imported` : ''}. ${p.warnings ? `${p.ready} rows can be imported; ${p.warnings} have warnings and will be skipped.` : `All ${p.ready} rows are ready to import.`}`

  return (
    <div>
      <section className="iw-panel" aria-label="Import file">
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          aria-label="Choose a CSV or Excel file"
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }}
        />

        <AnimatePresence mode="wait" initial={false}>
          {!hasFile ? (
            <motion.div key="top" className="iw-top"
              exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.25, ease: EASE }}>
              <div
                className="iw-drop"
                data-over={over}
                data-ready={dragging}
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
                onDragOver={(e) => { if (!accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <span className="iw-drop-icon"><Icon name="FileUp" size={15} /></span>
                <span className="iw-drop-title">Drop your CSV or Excel file here</span>
                <span className="iw-drop-sub">or choose it from your computer</span>
              </div>
              <div className="iw-sample" data-dragging={dragging}>
                <span className="iw-eyebrow-sm">Sample file</span>
                <span
                  className="iw-filechip iw-draggable"
                  role="button"
                  tabIndex={0}
                  draggable
                  aria-label={`${p.sampleName} — drag it into the drop zone, or press Enter to download`}
                  title="Drag it into the drop zone to try it, or click to download a ready-to-fill copy"
                  onDragStart={(e) => {
                    e.dataTransfer.setData(SAMPLE_DRAG, p.sampleName)
                    e.dataTransfer.setData('text/plain', p.sampleName)
                    e.dataTransfer.effectAllowed = 'copy'
                    setDragging(true)
                  }}
                  onDragEnd={() => setDragging(false)}
                  onClick={p.onDownloadSample}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onDownloadSample() } }}
                >
                  <Icon name="FileSpreadsheet" size={12} /><span>{p.sampleName}</span>
                </span>
                <small>Drag it into the drop zone, or click to download</small>
              </div>
            </motion.div>
          ) : (
            <motion.div key="file" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>
              <div className="iw-filebar">
                <Icon name="FileSpreadsheet" size={13} />
                <span className="iw-mono">{p.fileName}</span>
                <span>· {p.rowCount} {p.rowCount === 1 ? 'row' : 'rows'} · {headers.length} {headers.length === 1 ? 'column' : 'columns'}{hidden > 0 ? ` (${hidden} not shown)` : ''}</span>
                <button type="button" className="iw-link" onClick={() => fileRef.current?.click()} disabled={importing || done}>Change file</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={mapRef} className="iw-map">
          {hasFile && (
            <div className="iw-grid" style={{ ['--n' as string]: shown.length }}>
              <span />
              {shown.map((col) => {
                const owner = fields.findIndex((f) => mapping[f.key]?.column === col)
                const order = mappedFields.findIndex((f) => mapping[f.key].column === col)
                return (
                  <Chip key={`${p.runKey}-${col}`} name={headers[col]} sample={p.sample[col] ?? ''} matched={owner >= 0}
                    picked={picked?.kind === 'chip' && picked.id === col} replay={p.runKey}
                    litDelay={owner >= 0 && p.animateMatch ? Math.round((lineDelay(Math.max(order, 0)) + 0.1) * 1000) : 0}
                    nodeRef={(el) => { chipNodes.current[col] = el }} onClick={() => pick('chip', col)} />
                )
              })}
            </div>
          )}

          <div className="iw-lines" data-compact={!hasFile} />

          {hasFile && (geom.length > 0 || skips.length > 0) && (
            <svg className="iw-svg" aria-hidden>
              {skips.map((s, i) => (
                <motion.g key={`${p.runKey}-skip-${s.col}`} className="iw-skip"
                  initial={p.animateMatch ? { opacity: 0 } : false} animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: lineDelay(geom.length + i) }}>
                  <path d={`M${s.x},${s.y1} L${s.x},${s.y2}`} />
                  <path d={`M${s.x - CROSS},${s.y2 - CROSS} L${s.x + CROSS},${s.y2 + CROSS} M${s.x + CROSS},${s.y2 - CROSS} L${s.x - CROSS},${s.y2 + CROSS}`} />
                </motion.g>
              ))}
              {geom.map((g, i) => {
                const k = Math.max(18, (g.y2 - g.y1) * 0.55)
                return (
                  <motion.path key={`${p.runKey}-${g.key}`} d={`M${g.x1},${g.y1} C${g.x1},${g.y1 + k} ${g.x2},${g.y2 - k} ${g.x2},${g.y2}`}
                    initial={p.animateMatch ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.55, delay: lineDelay(i), ease: [0.4, 0, 0.2, 1] }} />
                )
              })}
            </svg>
          )}
          {hasFile && geom.map((g, i) => {
            const m = mapping[g.key]
            return (
              <motion.span key={`${p.runKey}-b-${g.key}`} className="iw-badge" style={{ left: (g.x1 + g.x2) / 2, top: (g.y1 + g.y2) / 2 }}
                initial={p.animateMatch ? { opacity: 0, scale: 0.4 } : false} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 22, delay: lineDelay(i) + 0.4 }}>
                {m.how === 'name' && m.score !== null ? `${Math.round(m.score * 100)}%` : 'manual'}
              </motion.span>
            )
          })}

          <div className="iw-grid" style={{ ['--n' as string]: nodeCount }}>
            <span />
            {fields.map((f) => {
              const col = mapping[f.key]?.column ?? null
              const order = mappedFields.findIndex((m) => m.key === f.key)
              return (
                <Tab key={`${p.runKey}-${f.key}`} field={f} sourceName={hasFile && col !== null ? headers[col] ?? null : null}
                  picked={picked?.kind === 'field' && picked.id === f.key} replay={p.runKey}
                  litDelay={p.animateMatch && col !== null ? Math.round((lineDelay(Math.max(order, 0)) + 0.5) * 1000) : 0}
                  nodeRef={(el) => { tabNodes.current[f.key] = el }}
                  onClick={() => hasFile && pick('field', f.key)} onClear={() => p.onMap(f.key, null)} />
              )
            })}
          </div>
        </div>

        <div className="iw-rows">
          {showRows ? previewed.map((row, i) => {
            const warn = row.missing.length > 0
            return (
              <motion.div key={i} className="iw-row iw-grid" style={{ ['--n' as string]: nodeCount }} data-state={warn ? 'warn' : 'ready'}
                data-imported={done && !warn}
                initial={p.animateMatch ? { opacity: 0, y: 6 } : false} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: EASE, delay: i * 0.07 }}>
                <span className="iw-status" data-kind={warn ? 'warn' : done ? 'done' : 'ready'} title={warn ? `Skipped — missing ${row.missing.join(', ')}` : undefined}>
                  <Icon name={warn ? 'TriangleAlert' : 'Check'} size={10} strokeWidth={3} />
                </span>
                {fields.map((f, k) => {
                  const empty = !row.values[k]
                  const bad = empty && f.required
                  return (
                    <span key={f.key} className="iw-cell" data-warn={bad} data-empty={empty && !bad} title={bad ? `${f.label} is required — this row will be skipped` : undefined}>
                      <span>{row.values[k] || (bad ? 'missing' : '—')}</span>
                      {bad && <Icon name="TriangleAlert" size={11} />}
                    </span>
                  )
                })}
              </motion.div>
            )
          }) : Array.from({ length: PREVIEW_ROWS }, (_, i) => (
            <div key={i} className="iw-row iw-grid" style={{ ['--n' as string]: nodeCount }} aria-hidden>
              <span />
              {fields.map((f, k) => <i key={f.key} className="iw-bar" style={{ width: `${48 + ((i * 7 + k * 13) % 38)}%` }} />)}
            </div>
          ))}
          {showRows && p.rows.length > PREVIEW_ROWS && <p className="iw-more">+ {p.rows.length - PREVIEW_ROWS} more rows</p>}
        </div>

        <div className="iw-foot">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={phase === 'review' || phase === 'done' ? 'chips' : phase} className="flex items-center gap-2"
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: EASE }}>
              {(phase === 'review' || phase === 'done') ? (
                <>
                  <span className="iw-pill"><Icon name="Check" size={11} strokeWidth={3} /> {p.ready} ready</span>
                  {p.warnings > 0 && <span className="iw-pill" data-tone="warn"><Icon name="TriangleAlert" size={11} /> {p.warnings} with warnings</span>}
                </>
              ) : (
                <span className="iw-foot-text">{phase === 'empty' ? 'Drop a file to start.' : phase === 'mapping' ? 'Matching columns…' : 'Importing…'}</span>
              )}
            </motion.div>
          </AnimatePresence>
          <div className="iw-actions">
            <button type="button" className="iw-btn iw-btn-ghost" onClick={() => { setPicked(null); p.onAutoMatch() }} disabled={!hasFile || importing || done || phase === 'mapping'}>
              <Icon name="Sparkles" size={12} /> Auto-match
            </button>
            <button type="button" className="iw-btn iw-btn-primary" data-state={done ? 'done' : undefined} data-ready={phase === 'review' && p.canImport}
              onClick={p.onImport} disabled={phase !== 'review' || !p.canImport} title={p.disabledReason}>
              {importing ? <><Icon name="Loader" size={12} className="animate-spin" /> Importing…</>
                : done ? <><Icon name="Check" size={12} strokeWidth={3} /> Imported</>
                  : <>{phase === 'review' && p.ready > 0 ? `Import ${p.ready} ${p.ready === 1 ? 'row' : 'rows'}` : 'Import'} <Icon name="ArrowRight" size={12} /></>}
            </button>
          </div>
        </div>
      </section>

      <div className="iw-dest">
        <span className="iw-dest-icon"><Icon name="Database" size={15} /></span>
        <div className="min-w-0">
          <div className="iw-dest-name">{p.destination?.name ?? 'Choose a destination'}</div>
          <div className="iw-dest-sub">{p.destination?.sub ?? 'Select a state and where to import into'}</div>
        </div>
        <div className="iw-dest-bars" aria-hidden><i style={{ width: '82%' }} /><i style={{ width: '58%' }} /></div>
        <div className="iw-dest-count">
          <CountUp value={done ? p.imported : phase === 'review' || importing ? p.ready : 0} />
          <span>{done ? 'imported' : 'rows to add'}</span>
        </div>
        <AnimatePresence>
          {done && (
            <motion.span className="iw-plus" initial={{ opacity: 0, scale: 0.4, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.5 }}>+{p.imported}</motion.span>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={caption} className={cn('iw-caption')} role="status"
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {caption}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
