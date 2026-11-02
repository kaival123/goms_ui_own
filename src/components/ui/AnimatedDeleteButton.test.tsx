import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AnimatedDeleteButton } from './AnimatedDeleteButton'

describe('AnimatedDeleteButton', () => {
  it('runs onDelete only after the animation, and only once for repeated clicks', async () => {
    const onDelete = vi.fn()
    render(<AnimatedDeleteButton onDelete={onDelete} />)
    const button = screen.getByRole('button', { name: 'Delete' })
    await userEvent.click(button)
    await userEvent.click(button)
    expect(onDelete).not.toHaveBeenCalled()
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1), { timeout: 15000 })
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted')
    expect(onDelete).toHaveBeenCalledTimes(1)
  }, 30000)

  it('returns to idle without a success state when showSuccess is off', async () => {
    const onDelete = vi.fn()
    render(<AnimatedDeleteButton showSuccess={false} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1), { timeout: 15000 })
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  }, 30000)

  it('does not show success when onDelete rejects', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('nope'))
    render(<AnimatedDeleteButton onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalled(), { timeout: 15000 })
    await new Promise(r => setTimeout(r, 100))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  }, 30000)

  it('ignores clicks while disabled', async () => {
    const onDelete = vi.fn()
    render(<AnimatedDeleteButton disabled onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await new Promise(r => setTimeout(r, 2000))
    expect(onDelete).not.toHaveBeenCalled()
  }, 30000)
})
