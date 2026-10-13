import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/authStore'
import AuthPanel from './index'

beforeEach(async () => {
  await i18n.changeLanguage('en')
  useAuthStore.setState({
    status: {
      authenticated: false,
      method: null,
      baseUrl: null,
      displayName: null,
    },
    baseUrl: 'https://wiki.example.com',
    manualMode: 'api_token',
    error: null,
    isLoading: false,
    ssoSession: null,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('rejects whitespace credentials, associates errors, and submits a validated token form', async () => {
  const save = vi
    .spyOn(useAuthStore.getState(), 'saveManualAuth')
    .mockResolvedValue()
  render(<AuthPanel />)
  fireEvent.change(screen.getByLabelText('Email / Username'), {
    target: { value: '   ' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save API Token' }))
  await waitFor(() =>
    expect(
      screen.getByLabelText('Email / Username').getAttribute('aria-invalid'),
    ).toBe('true'),
  )
  expect(
    screen.getByLabelText('Email / Username').getAttribute('aria-describedby'),
  ).toBe('manual-api_token-username-error')
  expect(save).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Email / Username'), {
    target: { value: 'test@example.com' },
  })
  fireEvent.change(screen.getByLabelText('API Token', { selector: 'input' }), {
    target: { value: 'test-token' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save API Token' }))
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      {
        method: 'api_token',
        baseUrl: 'https://wiki.example.com',
        username: 'test@example.com',
        apiToken: 'test-token',
      },
      expect.anything(),
    ),
  )
})

it('clears the credential draft when switching authentication modes', async () => {
  render(<AuthPanel />)
  fireEvent.change(screen.getByLabelText('API Token', { selector: 'input' }), {
    target: { value: 'test-token' },
  })
  fireEvent.keyDown(screen.getByRole('tab', { name: 'Session Cookie' }), {
    key: 'Enter',
  })
  expect(
    await screen.findByLabelText('Session Cookie', { selector: 'input' }),
  ).toBeTruthy()
  expect(screen.queryByLabelText('API Token', { selector: 'input' })).toBeNull()
  fireEvent.keyDown(screen.getByRole('tab', { name: 'API Token' }), {
    key: 'Enter',
  })
  expect(
    (
      (await screen.findByLabelText('API Token', {
        selector: 'input',
      })) as HTMLInputElement
    ).value,
  ).toBe('')
})

it('validates the HTTPS URL before opening SSO', async () => {
  useAuthStore.setState({ manualMode: null, baseUrl: 'https://' })
  const start = vi
    .spyOn(useAuthStore.getState(), 'startSsoLogin')
    .mockResolvedValue()
  render(<AuthPanel />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with SSO' }))
  expect(
    screen.getByLabelText('Confluence URL').getAttribute('aria-invalid'),
  ).toBe('true')
  expect(start).not.toHaveBeenCalled()
})
