import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ImportWizard } from './ImportWizard'
import type { Field } from './columnMatch'

const fields: Field[] = [{ key: 'name', label: 'Name', required: true }]

function setup() {
  const onFile = vi.fn()
  const sample = new File(['Name\nA\n'], 'import-sample-nodes.csv', { type: 'text/csv' })
  render(
    <ImportWizard
      fields={fields} fileName={null} headers={[]} sample={[]} rowCount={0} mapping={{}} runKey={0} animateMatch
      rows={[]} ready={0} warnings={0} phase="empty" canImport={false} imported={0} destination={null}
      sampleName="import-sample-nodes.csv" makeSampleFile={() => sample}
      onFile={onFile} onMap={() => {}} onAutoMatch={() => {}} onDownloadSample={() => {}} onImport={() => {}}
    />,
  )
  return { onFile, sample }
}

/** A minimal DataTransfer: jsdom has none, and the wizard only reads `types`/`files` and writes `setData`. */
function transfer(types: string[], files: File[] = []) {
  const data: Record<string, string> = {}
  return { types, files, data, setData: (type: string, value: string) => { data[type] = value; if (!types.includes(type)) types.push(type) }, dropEffect: '', effectAllowed: '' }
}

describe('ImportWizard sample file', () => {
  it('can be dragged from the sample chip into the drop zone, which then loads it like an uploaded file', () => {
    const { onFile, sample } = setup()
    const chip = screen.getByRole('button', { name: /import-sample-nodes\.csv/ })
    expect(chip).toHaveAttribute('draggable', 'true')
    const dt = transfer([])
    fireEvent.dragStart(chip, { dataTransfer: dt })
    expect(dt.types).toContain('application/x-goms-import-sample')
    const zone = screen.getByText('Drop your CSV or Excel file here').closest('[role="button"]')!
    expect(zone).toHaveAttribute('data-ready', 'true')
    fireEvent.dragOver(zone, { dataTransfer: dt })
    expect(zone).toHaveAttribute('data-over', 'true')
    fireEvent.drop(zone, { dataTransfer: dt })
    expect(onFile).toHaveBeenCalledWith(sample)
  })

  it('still accepts a real file dropped into the zone, and ignores unrelated drags', () => {
    const { onFile } = setup()
    const zone = screen.getByText('Drop your CSV or Excel file here').closest('[role="button"]')!
    const file = new File(['x'], 'mine.csv')
    fireEvent.drop(zone, { dataTransfer: transfer(['Files'], [file]) })
    expect(onFile).toHaveBeenCalledWith(file)
    onFile.mockClear()
    fireEvent.dragOver(zone, { dataTransfer: transfer(['text/plain']) })
    expect(zone).not.toHaveAttribute('data-over', 'true')
  })

  it('downloads instead when the chip is clicked', () => {
    const onDownloadSample = vi.fn()
    render(
      <ImportWizard
        fields={fields} fileName={null} headers={[]} sample={[]} rowCount={0} mapping={{}} runKey={0} animateMatch
        rows={[]} ready={0} warnings={0} phase="empty" canImport={false} imported={0} destination={null}
        sampleName="s.csv" makeSampleFile={() => new File([''], 's.csv')}
        onFile={() => {}} onMap={() => {}} onAutoMatch={() => {}} onDownloadSample={onDownloadSample} onImport={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /s\.csv/ }))
    expect(onDownloadSample).toHaveBeenCalledTimes(1)
  })
})
