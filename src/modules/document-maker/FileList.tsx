import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { makerRights, type MakerDocument } from '@goms/domain'
import { Icon } from '@/components/ui/Icon'
import { Menu, MenuDivider, MenuItem } from '@/components/ui/Menu'
import { PersonName } from '@/components/ui/PersonName'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { cn } from '@/lib/utils'
import { editedLabel, formatBytes, KIND_META } from './kinds'
import { useOwnerPerson } from './useOwner'

export type FileAction = 'rename' | 'duplicate' | 'download' | 'delete' | 'share' | 'versions' | 'office' | 'libreOffice'

/** What the caller's own rights on a file allow, on top of the permission tree. */
export function fileAllows(doc: MakerDocument, action: FileAction): boolean {
  const rights = makerRights(doc)
  if (action === 'rename' || action === 'delete' || action === 'share') return rights.owner
  if (action === 'office' || action === 'libreOffice') return true
  return rights.read
}

const PAGE_SIZES = [10, 25, 50]

/** Page numbers to show: the first, the last and the neighbours of the current page, with gaps as '…'. */
function pageNumbers(total: number, current: number): (number | '…')[] {
  const keep = new Set([1, total, current - 1, current, current + 1].filter((n) => n >= 1 && n <= total))
  const sorted = [...keep].sort((a, b) => a - b)
  const out: (number | '…')[] = []
  sorted.forEach((n, i) => {
    // A gap of one page shows that page; a longer gap shows an ellipsis.
    if (i > 0 && n - sorted[i - 1] === 2) out.push(n - 1)
    else if (i > 0 && n - sorted[i - 1] > 2) out.push('…')
    out.push(n)
  })
  return out
}

function PagerButton({ children, active, ...props }: { children: ReactNode; active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-[12px] font-medium tabular-nums transition-colors focus-visible:focus-ring',
        active ? 'bg-ink-900 text-paper shadow-sm' : 'text-ink-700 hover:bg-ink-900/[0.06] disabled:pointer-events-none disabled:opacity-35',
      )}
    >
      {children}
    </button>
  )
}

/** The user's files: a table on wide screens, stacked rows on a phone (same markup, grid columns collapse). */
/** `can` hides menu actions the permission tree does not allow (default: all allowed).
 *  `onOpen` replaces the editor link (Android app: the file opens in a phone app instead). */
export function FileList({ files, onAction, onOpen, can = () => true }: {
  files: MakerDocument[]; onAction: (action: FileAction, doc: MakerDocument) => void; onOpen?: (doc: MakerDocument) => void
  can?: (action: FileAction) => boolean
}) {
  const ownerOf = useOwnerPerson()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0])
  const totalPages = Math.max(1, Math.ceil(files.length / pageSize))
  const current = Math.min(page, totalPages) // a delete or a search can leave fewer pages than before
  const start = (current - 1) * pageSize
  const pageFiles = files.slice(start, start + pageSize)
  const scrollRef = useRef<HTMLDivElement>(null)
  // The page's files grouped by kind; a group's header folds and unfolds its rows.
  const [tableOpen, setTableOpen] = useState(true)
  // Drag the table's right edge to narrow it: columns fold away, last first, into the file's second line.
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const kinds = [...new Set(pageFiles.map((d) => d.kind))]
  const toggleKind = (kind: string) => setFolded((f) => { const n = new Set(f); if (!n.delete(kind)) n.add(kind); return n })
  const ordered = kinds.flatMap((k) => [{ header: k } as const, ...(folded.has(k) ? [] : pageFiles.filter((d) => d.kind === k).map((doc) => ({ doc })))])
  // A new page starts at its top.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0 }, [current, pageSize])

  const pager = files.length > PAGE_SIZES[0] ? (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel/40 px-4 py-2.5 text-[12px] text-muted">
      <span aria-live="polite">
        Showing <b className="font-semibold text-ink-900">{start + 1}–{Math.min(start + pageSize, files.length)}</b> of{' '}
        <b className="font-semibold text-ink-900">{files.length}</b>
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-2">
          Rows per page
          <SelectMenu
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(v) => { setPageSize(Number(v)); setPage(1) }}
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            className="w-[4.75rem]"
            buttonClassName="h-8 rounded-lg"
          />
        </span>
        <div className="flex items-center gap-1">
          <PagerButton aria-label="Previous page" disabled={current === 1} onClick={() => setPage(current - 1)}><Icon name="ChevronLeft" size={15} /></PagerButton>
          {pageNumbers(totalPages, current).map((n, i) => n === '…'
            ? <span key={`gap-${i}`} aria-hidden className="px-1 text-muted">…</span>
            : <PagerButton key={n} active={n === current} aria-label={`Page ${n}`} aria-current={n === current ? 'page' : undefined} onClick={() => setPage(n)}>{n}</PagerButton>)}
          <PagerButton aria-label="Next page" disabled={current === totalPages} onClick={() => setPage(current + 1)}><Icon name="ChevronRight" size={15} /></PagerButton>
        </div>
      </div>
    </nav>
  ) : null

  return (
    <div className="@container overflow-hidden rounded-2xl border border-line bg-white">
    <button type="button" aria-expanded={tableOpen} onClick={() => setTableOpen((o) => !o)}
      className={cn('flex w-full items-center gap-2 bg-panel/60 px-4 py-2.5 text-left text-[12px] font-semibold text-ink-700 hover:bg-ink-900/[0.04] focus-visible:focus-ring', tableOpen && 'border-b border-line')}>
      <Icon name="ChevronDown" size={15} className={cn('transition-transform duration-300', !tableOpen && '-rotate-90')} />
      Your files
      <span className="rounded-full bg-white px-2 py-px text-[11px] font-medium tabular-nums text-muted">{files.length}</span>
    </button>
    <div className={cn('grid transition-[grid-template-rows] duration-300 ease-out', tableOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
    <div className="min-h-0 overflow-hidden" inert={!tableOpen}>
    <div role="table" aria-label="Your files">
      {/* The rows scroll inside the table (the header stays put); the paginator sits below it. */}
      <div ref={scrollRef} className="max-h-[26rem] overflow-y-auto scrollbar-thin">
      <div role="rowgroup" className="sticky top-0 z-10 bg-white">
        <div role="row" className="hidden grid-cols-[minmax(0,1fr)_9rem_3rem] items-center gap-4 border-b border-line bg-panel/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted @xl:grid @3xl:grid-cols-[minmax(0,1fr)_9rem_12rem_3rem]">
          <span role="columnheader">Name</span>
          <span role="columnheader">Last edited</span>
          <span role="columnheader" className="hidden @3xl:block">Owner</span>
          <span role="columnheader"><span className="sr-only">Actions</span></span>
        </div>
      </div>
      <div role="rowgroup" key={current} className="row-reveal">
        {ordered.map((entry, index) => {
          if ('header' in entry) {
            const kind = entry.header
            const open = !folded.has(kind)
            const count = pageFiles.filter((d) => d.kind === kind).length
            return (
              <div key={`group-${kind}`} className="border-b border-line bg-panel/40">
                <button type="button" aria-expanded={open} onClick={() => toggleKind(kind)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-[12px] font-semibold text-ink-700 hover:bg-ink-900/[0.04] focus-visible:focus-ring">
                  <Icon name="ChevronDown" size={15} className={cn('transition-transform duration-200', !open && '-rotate-90')} />
                  {KIND_META[kind].label}s
                  <span className="rounded-full bg-white px-2 py-px text-[11px] font-medium tabular-nums text-muted">{count}</span>
                </button>
              </div>
            )
          }
          const doc = entry.doc
          const meta = KIND_META[doc.kind]
          const allows = (action: FileAction) => can(action) && fileAllows(doc, action)
          return (
            <div
              key={doc.id}
              role="row"
              style={{ '--i': Math.min(index, 14) } as React.CSSProperties}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-4 py-3 last:border-b-0 hover:bg-grid-hover @xl:grid-cols-[minmax(0,1fr)_9rem_3rem] @3xl:grid-cols-[minmax(0,1fr)_9rem_12rem_3rem]"
            >
              <div role="cell" className="flex min-w-0 items-center gap-3">
                <span aria-hidden className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', meta.tint, meta.text)}>
                  <Icon name={meta.icon} size={17} />
                </span>
                <span className="min-w-0">
                  {onOpen ? (
                    <button type="button" onClick={() => onOpen(doc)}
                      className="block max-w-full truncate text-left text-[14px] font-medium text-ink-900 hover:underline focus-visible:focus-ring">
                      {doc.title}
                    </button>
                  ) : (
                    <Link
                      to={`/document-maker/${doc.id}`}
                      className="block truncate text-[14px] font-medium text-ink-900 hover:underline focus-visible:focus-ring"
                    >
                      {doc.title}
                    </Link>
                  )}
                  <span className="block truncate text-[12px] text-muted">
                    {doc.permissions && <span className="mr-1 rounded bg-panel px-1.5 py-px text-[11px] font-medium text-ink-700">Shared · {doc.permissions.join(', ')}</span>}
                    {meta.label} · .{doc.fileType} · {formatBytes(doc.size)}
                    <span className="@xl:hidden"> · {editedLabel(doc.updatedAt)}</span>
                  </span>
                </span>
              </div>
              <span role="cell" className="hidden text-[13px] tabular-nums text-ink @xl:block" title={new Date(doc.updatedAt).toLocaleString('en-IN')}>
                {editedLabel(doc.updatedAt)}
              </span>
              <span role="cell" className="hidden min-w-0 text-[13px] text-ink @3xl:block">
                <PersonName person={ownerOf(doc)} />
              </span>
              <span role="cell" className="justify-self-end">
                <Menu trigger={({ toggle, open }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label={`Actions for ${doc.title}`}
                    aria-expanded={open}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-ink-900/[0.06] hover:text-ink focus-visible:focus-ring"
                  >
                    <Icon name="MoreHorizontal" size={17} />
                  </button>
                )}>
                  {(close) => (
                    <>
                      {allows('libreOffice') && <MenuItem icon={<Icon name="ExternalLink" size={15} />} onClick={() => { close(); onAction('libreOffice', doc) }}>Open in LibreOffice</MenuItem>}
                      {allows('share') && <MenuItem icon={<Icon name="UserPlus" size={15} />} onClick={() => { close(); onAction('share', doc) }}>Share</MenuItem>}
                      {allows('versions') && <MenuItem icon={<Icon name="History" size={15} />} onClick={() => { close(); onAction('versions', doc) }}>Version history</MenuItem>}
                      {allows('rename') && <MenuItem icon={<Icon name="Pencil" size={15} />} onClick={() => { close(); onAction('rename', doc) }}>Rename</MenuItem>}
                      {allows('duplicate') && <MenuItem icon={<Icon name="Copy" size={15} />} onClick={() => { close(); onAction('duplicate', doc) }}>Duplicate</MenuItem>}
                      {allows('download') && <MenuItem icon={<Icon name="Download" size={15} />} onClick={() => { close(); onAction('download', doc) }}>Download .{doc.fileType}</MenuItem>}
                      {allows('delete') && <MenuDivider />}
                      {allows('delete') && <MenuItem danger icon={<Icon name="Trash2" size={15} />} onClick={() => { close(); onAction('delete', doc) }}>Delete</MenuItem>}
                    </>
                  )}
                </Menu>
              </span>
            </div>
          )
        })}
      </div>
      </div>
    </div>
    {pager}
    </div>
    </div>
    </div>
  )
}
