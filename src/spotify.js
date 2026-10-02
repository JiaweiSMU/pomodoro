// Spotify remote control, straight from the browser.
//
// Sign-in uses the Authorization Code flow with PKCE, which needs only a
// Client ID (no secret, no server). Endpoints follow Spotify's February 2026
// Web API revision: saved tracks are read and changed through /me/library.

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_URL = 'https://api.spotify.com/v1'

const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-library-read',
  'user-library-modify',
]

const TOKENS_KEY = 'pomodoro.spotify.tokens'
const VERIFIER_KEY = 'pomodoro.spotify.verifier'
const STATE_KEY = 'pomodoro.spotify.state'
const CLIENT_ID_KEY = 'pomodoro.spotify.clientId'

export class SpotifyError extends Error {
  constructor(status, reason, message, retryAfter = 0) {
    super(message)
    this.status = status
    this.reason = reason
    this.retryAfter = retryAfter
  }
}

// --- Client ID ---------------------------------------------------------------

const ENV_CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID || '').trim()

export const hasBuiltInClientId = () => ENV_CLIENT_ID !== ''

// A Client ID typed in Settings wins over the built-in one, so a wrong
// built-in ID can be corrected without a rebuild.
export function getClientId() {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) || ENV_CLIENT_ID
  } catch {
    return ENV_CLIENT_ID
  }
}

export function setClientId(id) {
  try {
    const trimmed = id.trim()
    if (!trimmed || trimmed === ENV_CLIENT_ID) localStorage.removeItem(CLIENT_ID_KEY)
    else localStorage.setItem(CLIENT_ID_KEY, trimmed)
  } catch {
    /* storage unavailable */
  }
}

// The address Spotify sends you back to. It must be listed, exactly, under
// "Redirect URIs" in your Spotify app settings.
export const redirectUri = () => `${window.location.origin}/callback`

// --- Tokens ------------------------------------------------------------------

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || 'null')
  } catch {
    return null
  }
}

function writeTokens(data, previous) {
  const tokens = {
    access: data.access_token,
    // Spotify may or may not send a new refresh token; keep the old one if not.
    refresh: data.refresh_token || previous?.refresh,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  }
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens))
  return tokens
}

export const isConnected = () => Boolean(readTokens()?.refresh)

export function disconnect() {
  localStorage.removeItem(TOKENS_KEY)
}

async function tokenRequest(params) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new SpotifyError(res.status, data.error, data.error_description || 'Spotify sign-in failed.')
  }
  return data
}

let refreshing = null

function refreshTokens() {
  refreshing ??= (async () => {
    const current = readTokens()
    if (!current?.refresh) throw new SpotifyError(401, 'NOT_CONNECTED', 'Connect Spotify to continue.')
    try {
      const data = await tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: current.refresh,
        client_id: getClientId(),
      })
      return writeTokens(data, current)
    } catch (err) {
      // A rejected refresh token cannot be recovered: sign in again.
      if (err.status === 400 || err.status === 401) {
        disconnect()
        throw new SpotifyError(401, 'NOT_CONNECTED', 'Your Spotify sign-in expired. Connect again.')
      }
      throw err
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

async function accessToken() {
  const tokens = readTokens()
  if (!tokens?.refresh) throw new SpotifyError(401, 'NOT_CONNECTED', 'Connect Spotify to continue.')
  if (tokens.access && tokens.expiresAt - Date.now() > 60_000) return tokens.access
  return (await refreshTokens()).access
}

// --- Sign-in (PKCE) ----------------------------------------------------------

function randomString(length = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function login() {
  const verifier = randomString(64)
  const state = randomString(16)
  localStorage.setItem(VERIFIER_KEY, verifier)
  localStorage.setItem(STATE_KEY, state)
  const url = new URL(AUTHORIZE_URL)
  url.search = new URLSearchParams({
    client_id: getClientId(),
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    scope: SCOPES.join(' '),
    state,
  }).toString()
  window.location.assign(url.toString())
}

let finishing = null

// Call once on page load. If Spotify just sent the browser back to /callback,
// this swaps the one-time code for tokens. Resolves to null when there was
// nothing to do, { ok: true } on success, or { error } with a message.
export function finishLogin() {
  finishing ??= (async () => {
    if (window.location.pathname !== '/callback') return null
    const params = new URLSearchParams(window.location.search)
    window.history.replaceState(null, '', '/')

    const error = params.get('error')
    if (error) {
      return {
        error: error === 'access_denied' ? 'Spotify access was declined.' : `Spotify sign-in failed (${error}).`,
      }
    }
    const code = params.get('code')
    const verifier = localStorage.getItem(VERIFIER_KEY)
    const expectedState = localStorage.getItem(STATE_KEY)
    localStorage.removeItem(VERIFIER_KEY)
    localStorage.removeItem(STATE_KEY)
    if (!code || !verifier || params.get('state') !== expectedState) {
      return { error: 'Spotify sign-in could not be verified. Try connecting again.' }
    }
    try {
      const data = await tokenRequest({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        client_id: getClientId(),
        code_verifier: verifier,
      })
      writeTokens(data)
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  })()
  return finishing
}

// --- Web API -----------------------------------------------------------------

async function request(method, path, { query, body } = {}, allowRetry = true) {
  const token = await accessToken()
  const url = new URL(API_URL + path)
  if (query) url.search = new URLSearchParams(query).toString()

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && allowRetry) {
    await refreshTokens()
    return request(method, path, { query, body }, false)
  }

  // Player commands answer with an empty or non-JSON body; tolerate both.
  const text = res.status === 204 ? '' : await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  if (!res.ok) {
    throw new SpotifyError(
      res.status,
      data?.error?.reason,
      data?.error?.message || `Spotify returned an error (${res.status}).`,
      Number(res.headers.get('Retry-After')) || 0,
    )
  }
  return data
}

// Only tracks and podcast episodes can be saved; local files cannot.
export const canSave = (uri) => /^spotify:(track|episode):/.test(uri || '')

// What is playing right now, or null when no Spotify device is active.
export async function getPlayback() {
  const data = await request('GET', '/me/player', { query: { additional_types: 'episode' } })
  if (!data) return null
  const item = data.item
  return {
    isPlaying: Boolean(data.is_playing),
    device: data.device?.name || '',
    track: item
      ? {
          uri: item.uri,
          name: item.name,
          artists: (item.artists || []).map((a) => a.name).join(', ') || item.show?.name || '',
          art: (item.album?.images || item.images || []).at(-1)?.url || '',
        }
      : null,
  }
}

// Resume playback. If no device is active, wake the first available one.
export async function play() {
  try {
    await request('PUT', '/me/player/play')
  } catch (err) {
    if (err.status !== 404) throw err
    const data = await request('GET', '/me/player/devices')
    const device = data?.devices?.find((d) => !d.is_restricted)
    if (!device) {
      throw new SpotifyError(404, 'NO_DEVICE', 'Open Spotify on your phone or computer, then press play here.')
    }
    await request('PUT', '/me/player', { body: { device_ids: [device.id], play: true } })
  }
}

export const pause = () => request('PUT', '/me/player/pause')
export const next = () => request('POST', '/me/player/next')
export const previous = () => request('POST', '/me/player/previous')

// Liked Songs
export async function isSaved(uri) {
  const data = await request('GET', '/me/library/contains', { query: { uris: uri } })
  return Boolean(data?.[0])
}
export const save = (uri) => request('PUT', '/me/library', { query: { uris: uri } })
export const unsave = (uri) => request('DELETE', '/me/library', { query: { uris: uri } })

// Turn an error into a sentence that says what to do about it.
export function explain(err) {
  if (err.reason === 'NO_DEVICE' || err.reason === 'NOT_CONNECTED') return err.message
  if (err.status === 429) return 'Spotify is rate-limiting this app. Controls will be back shortly.'
  if (err.status === 403 && err.reason === 'PREMIUM_REQUIRED') {
    return 'Spotify only allows playback control on Premium accounts.'
  }
  if (err.status === 403) {
    return 'Spotify refused the request. Check that this account is listed under User Management in your Spotify app.'
  }
  if (err.status === 404) return 'No active Spotify device. Open Spotify and start a song.'
  if (err instanceof TypeError) return 'Could not reach Spotify. Check your connection.'
  return err.message || 'Something went wrong talking to Spotify.'
}
