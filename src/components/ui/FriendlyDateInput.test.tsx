import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FriendlyDateInput } from './FriendlyDateInput'
import type { FriendlyDateFormat } from '@/lib/friendlyDate'

function Harness({ initial = '', format, min, onValue }: {
  initial?: string; format?: FriendlyDateFormat; min?: string; onValue?: (v: string) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <FriendlyDateInput aria-label="When" format={format} min={min} value={value} onChange={(v) => { setValue(v); onValue?.(v) }} />
      <output data-testid="stored">{value}</output>
      <button type="button" onClick={() => setValue('2027-01-02')}>Reset</button>
    </>
  )
}

describe('FriendlyDateInput', () => {
  it('adds and removes an optional time without inventing midnight for a date alone', async () => {
    render(<Harness initial="2026-10-09" format="optional-time" />)
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-10-09')
    await userEvent.click(screen.getByRole('button', { name: 'Add time' }))
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-10-09')
    fireEvent.change(screen.getByLabelText('Time for When'), { target: { value: '00:00' } })
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-10-09T00:00')
    await userEvent.click(screen.getByRole('button', { name: 'Remove time' }))
    expect(screen.getByTestId('stored').textContent).toBe('2026-10-09')
  })

  it('preserves an optional clock when a different day is picked', async () => {
    render(<Harness initial="2026-10-09T15:45" format="optional-time" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    await userEvent.click(await screen.findByRole('gridcell', { name: '10 October 2026' }))
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-10-10T15:45')
  })

  it('captures typed time, including midnight, in optional mode', () => {
    render(<Harness format="optional-time" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'When' }), { target: { value: '9 Oct 2026 00:00' } })
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-10-09T00:00')
  })
  it('stores a typed free-form date as yyyy-mm-dd and previews what it captured', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('textbox', { name: 'When' }), '13th may 2026')
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-05-13')
    expect(screen.getByText(/Captured:/)).toHaveTextContent('13 May 2026')
  })

  it('captures a compact DDMMYYYY date typed as digits', async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole('textbox', { name: 'When' }), '21092026')
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-09-21')
    expect(screen.getByText(/Captured:/)).toHaveTextContent('21 September 2026')
  })

  it('shows an existing value readably without a preview', () => {
    render(<Harness initial="2026-05-13" />)
    expect(screen.getByRole('textbox', { name: 'When' })).toHaveValue('13 May 2026')
    expect(screen.queryByText(/Captured:/)).not.toBeInTheDocument()
  })

  it('flags unreadable text, stores empty, and recovers when corrected', () => {
    const onValue = vi.fn()
    render(<Harness initial="2026-05-13" onValue={onValue} />)
    const input = screen.getByRole('textbox', { name: 'When' })
    fireEvent.change(input, { target: { value: 'not a date' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid date')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onValue).toHaveBeenLastCalledWith('')
    fireEvent.change(input, { target: { value: '2026-06-01' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-06-01')
  })

  it('follows a value changed from outside (e.g. a form reset)', async () => {
    render(<Harness initial="2026-05-13" />)
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByRole('textbox', { name: 'When' })).toHaveValue('02 Jan 2027')
  })

  it('stores datetime-local values with their time', () => {
    render(<Harness format="datetime-local" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'When' }), { target: { value: '13/5/26 3pm' } })
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-05-13T15:00')
    expect(screen.getByText(/Captured:/)).toHaveTextContent('13 May 2026, 15:00')
  })

  it('flags a date before min but keeps the value, like the native input', () => {
    render(<Harness min="2026-06-01" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'When' }), { target: { value: '13/5/26' } })
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-05-13')
    expect(screen.getByRole('alert')).toHaveTextContent('Must be on or after 01 Jun 2026')
  })

  it('stores a value picked from the calendar, and closes it', async () => {
    render(<Harness initial="2026-07-01" format="date" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(await screen.findByRole('dialog')).toHaveTextContent('July 2026')
    await userEvent.click(screen.getByRole('gridcell', { name: '4 July 2026' }))
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-07-04')
    expect(screen.getByRole('textbox', { name: 'When' })).toHaveValue('04 Jul 2026')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens on the chosen day, moves between months and marks the chosen day', async () => {
    render(<Harness initial="2026-07-15" format="date" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(screen.getByRole('gridcell', { name: '15 July 2026' })).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('August 2026')
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    await userEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('June 2026')
    await userEvent.click(screen.getByRole('gridcell', { name: '3 June 2026' }))
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-06-03')
  })

  it('clears the value and picks today from the footer', async () => {
    render(<Harness initial="2026-07-15" format="date" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Clear' }))
    expect(screen.getByTestId('stored').textContent).toBe('')
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Today' }))
    const now = new Date()
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    expect(screen.getByTestId('stored')).toHaveTextContent(expected)
  })

  it('does not let a day outside min be picked', async () => {
    render(<Harness initial="2026-07-15" format="date" min="2026-07-10" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    expect(await screen.findByRole('gridcell', { name: '9 July 2026' })).toBeDisabled()
    expect(screen.getByRole('gridcell', { name: '10 July 2026' })).toBeEnabled()
  })

  it('moves the focused day with the arrow keys and picks it with Enter', async () => {
    render(<Harness initial="2026-07-15" format="date" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    await waitFor(() => expect(screen.getByRole('gridcell', { name: '15 July 2026' })).toHaveFocus())
    await userEvent.keyboard('{ArrowRight}{ArrowDown}')
    await waitFor(() => expect(screen.getByRole('gridcell', { name: '23 July 2026' })).toHaveFocus())
    await userEvent.keyboard('{Enter}')
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-07-23')
  })

  it('shows a time box for a date-and-time field and keeps the calendar open after a day is picked', async () => {
    render(<Harness initial="2026-07-15T09:30" format="datetime-local" />)
    await userEvent.click(screen.getByRole('button', { name: 'Open calendar' }))
    await userEvent.click(await screen.findByRole('gridcell', { name: '16 July 2026' }))
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-07-16T09:30')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '18:05' } })
    expect(screen.getByTestId('stored')).toHaveTextContent('2026-07-16T18:05')
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('disables the calendar button when the field is disabled', () => {
    render(<FriendlyDateInput aria-label="When" value="" onChange={() => {}} disabled />)
    expect(screen.getByRole('textbox', { name: 'When' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open calendar' })).toBeDisabled()
  })
})
