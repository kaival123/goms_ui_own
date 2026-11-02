import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { MakerDocument } from '@goms/domain'
import { FileList } from './FileList'

const docs = (n: number): MakerDocument[] => Array.from({ length: n }, (_, i) => ({
  id: `d${i + 1}`, kind: 'document', title: `Doc ${i + 1}`, fileType: 'docx', size: 1024, version: 1, documentKey: `k${i}`,
  ownerEmail: 'a@x.in', ownerName: 'Asha', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
}))

function renderList(n: number) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><FileList files={docs(n)} onAction={() => {}} /></MemoryRouter>
    </QueryClientProvider>,
  )
}
const titles = () => screen.getAllByRole('link').map((a) => a.textContent)

describe('FileList paging and scroll', () => {
  it('shows ten files a page and pages through them', async () => {
    const user = userEvent.setup()
    renderList(37)
    expect(titles()).toHaveLength(10)
    expect(titles()[0]).toBe('Doc 1')
    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    expect(nav).toHaveTextContent('Showing 1–10 of 37')
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(titles()[0]).toBe('Doc 11')
    expect(nav).toHaveTextContent('Showing 11–20 of 37')
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('button', { name: 'Page 4' }))
    expect(titles()).toHaveLength(7)
    expect(nav).toHaveTextContent('Showing 31–37 of 37')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('changes the page size and returns to the first page', async () => {
    const user = userEvent.setup()
    renderList(37)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await user.click(screen.getByRole('combobox', { name: 'Rows per page' }))
    await user.click(await screen.findByRole('option', { name: '25' }))
    expect(titles()).toHaveLength(25)
    expect(titles()[0]).toBe('Doc 1')
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toHaveTextContent('Showing 1–25 of 37')
    expect(screen.queryByRole('button', { name: 'Page 3' })).not.toBeInTheDocument()
  })

  it('has no paginator for a short list, and keeps the rows in a scroll area under a fixed header', () => {
    renderList(6)
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'Your files' })
    const scroller = table.firstElementChild as HTMLElement
    expect(scroller.className).toContain('overflow-y-auto')
    const header = within(table).getAllByRole('rowgroup')[0]
    expect(header.className).toContain('sticky')
  })
})
