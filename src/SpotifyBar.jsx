import { useCallback, useEffect, useRef, useState } from 'react'
import { Heart, ListMusic, Music2, Pause, Play, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import IconButton from './IconButton.jsx'
import * as spotify from './spotify.js'

/* ----------------------------------------------------------------------------
   Spotify
---------------------------------------------------------------------------- */

export function useSpotify() {
  const [clientId, setClientIdState] = useState(spotify.getClientId)
  const [connected, setConnected] = useState(spotify.isConnected)
  const [playback, setPlayback] = useState(null)
  const [liked, setLiked] = useState(null) // null = not known yet
  const [playlists, setPlaylists] = useState(null) // null = loading
  const [playlistsError, setPlaylistsError] = useState('')
  // Two kinds of problem: one from the background check of what is playing,
  // which clears itself on the next good check, and one from a button press,
  // which stays until the next press so there is time to read it.
  const [pollError, setPollError] = useState('')
  const [commandError, setCommandError] = useState('')
  const error = commandError || pollError
  const likedFor = useRef(null)
  const quietUntil = useRef(0)

  const fail = useCallback((err, setMessage) => {
    if (err.reason === 'NOT_CONNECTED') setConnected(false)
    if (err.status === 429) quietUntil.current = Date.now() + (err.retryAfter || 30) * 1000
    setMessage(spotify.explain(err))
  }, [])

  const refresh = useCallback(async () => {
    if (!spotify.isConnected() || Date.now() < quietUntil.current) return
    try {
      const data = await spotify.getPlayback()
      setPlayback(data)
      setPollError('')
      const uri = data?.track?.uri || null
      if (uri !== likedFor.current) {
        likedFor.current = uri
        setLiked(null)
        if (spotify.canSave(uri)) {
          const saved = await spotify.isSaved(uri)
          if (likedFor.current === uri) setLiked(saved)
        }
      }
    } catch (err) {
      fail(err, setPollError)
    }
  }, [fail])

  // Finish sign-in if Spotify just sent the browser back here.
  useEffect(() => {
    spotify.finishLogin().then((result) => {
      if (result?.ok) setConnected(true)
      else if (result?.error) setCommandError(result.error)
    })
  }, [])

  // Check what is playing every few seconds while the tab is visible.
  useEffect(() => {
    if (!connected) return undefined
    refresh()
    const id = setInterval(() => !document.hidden && refresh(), 5000)
    const onVisible = () => !document.hidden && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [connected, refresh])

  // Show the result straight away, send the command, then confirm with Spotify.
  // Resolves to true if Spotify accepted the command.
  const run = useCallback(
    async (command, optimistic) => {
      optimistic?.()
      try {
        await command()
        setCommandError('')
        setTimeout(refresh, 700)
        return true
      } catch (err) {
        fail(err, setCommandError)
        refresh()
        return false
      }
    },
    [refresh, fail],
  )

  const uri = playback?.track?.uri

  return {
    clientId,
    connected,
    playback,
    liked,
    error,
    saveClientId: (id) => {
      spotify.setClientId(id)
      setClientIdState(spotify.getClientId())
    },
    connect: () => spotify.login().catch((err) => setCommandError(spotify.explain(err))),
    disconnect: () => {
      spotify.disconnect()
      setConnected(false)
      setPlayback(null)
      setLiked(null)
      setPlaylists(null)
      setPollError('')
      setCommandError('')
      likedFor.current = null
    },
    togglePlay: () =>
      playback?.isPlaying
        ? run(spotify.pause, () => setPlayback((p) => p && { ...p, isPlaying: false }))
        : run(spotify.play, () => setPlayback((p) => p && { ...p, isPlaying: true })),
    next: () => run(spotify.next),
    toggleShuffle: () => {
      const on = !playback?.shuffle
      run(() => spotify.setShuffle(on), () => setPlayback((p) => p && { ...p, shuffle: on }))
    },
    playlists,
    playlistsError,
    loadPlaylists: () => {
      setPlaylistsError('')
      spotify
        .getPlaylists()
        .then(setPlaylists)
        .catch((err) => fail(err, setPlaylistsError))
    },
    playPlaylist: (uri) =>
      run(
        () => (uri ? spotify.play({ context_uri: uri }) : spotify.playLiked()),
        () => setPlayback((p) => p && { ...p, isPlaying: true }),
      ),
    previous: () => run(spotify.previous),
    toggleLiked: () => {
      if (!uri || liked == null) return
      const wasLiked = liked
      run(
        () => (wasLiked ? spotify.unsave(uri) : spotify.save(uri)),
        () => setLiked(!wasLiked),
      ).then((accepted) => {
        // Spotify said no: put the heart back the way it was.
        if (!accepted && likedFor.current === uri) setLiked(wasLiked)
      })
    },
  }
}

export function SpotifyBar({ sp, onOpenSettings, children }) {
  const track = sp.playback?.track
  const canLike = Boolean(track) && sp.liked != null

  let body
  if (!sp.clientId) {
    body = (
      <>
        <p className="min-w-0 flex-1 text-sm text-muted">Play, pause, skip, shuffle and pick playlists from here.</p>
        <button type="button" onClick={onOpenSettings} className="h-10 shrink-0 rounded-md border border-line px-3 text-sm font-medium hover:bg-accent-soft">
          Set up Spotify
        </button>
      </>
    )
  } else if (!sp.connected) {
    body = (
      <>
        <p className="min-w-0 flex-1 text-sm text-muted" role="status">
          {sp.error || 'Play, pause, skip, shuffle and pick playlists from here.'}
        </p>
        <button type="button" onClick={sp.connect} className="h-10 shrink-0 rounded-md bg-accent px-3 text-sm font-medium text-on-accent">
          Connect Spotify
        </button>
      </>
    )
  } else {
    body = (
      <>
        {track?.art ? (
          <img src={track.art} alt="" className="size-11 shrink-0 rounded" />
        ) : (
          <span className="grid size-11 shrink-0 place-items-center rounded bg-accent-soft text-muted">
            <Music2 size={20} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{track ? track.name : 'Nothing playing'}</p>
          <p className={`truncate text-sm ${sp.error ? 'text-ink' : 'text-muted'}`} role="status">
            {sp.error || (track ? track.artists : 'Start a song in Spotify, or press play to wake your last device.')}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton
            label={sp.liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            aria-pressed={Boolean(sp.liked)}
            disabled={!canLike}
            onClick={sp.toggleLiked}
            active={Boolean(sp.liked)}
          >
            <Heart size={20} fill={sp.liked ? 'currentColor' : 'none'} aria-hidden="true" />
          </IconButton>
          <IconButton label="Previous track" onClick={sp.previous} display="hidden sm:grid">
            <SkipBack size={20} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={sp.playback?.isPlaying ? 'Pause music' : 'Play music'}
            onClick={sp.togglePlay}
            solid
          >
            {sp.playback?.isPlaying ? <Pause size={20} aria-hidden="true" /> : <Play size={20} aria-hidden="true" />}
          </IconButton>
          <IconButton label="Next track" onClick={sp.next}>
            <SkipForward size={20} aria-hidden="true" />
          </IconButton>
          <IconButton
            label={sp.playback?.shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
            aria-pressed={Boolean(sp.playback?.shuffle)}
            disabled={!sp.playback}
            onClick={sp.toggleShuffle}
            active={Boolean(sp.playback?.shuffle)}
            display="hidden sm:grid"
          >
            <Shuffle size={20} aria-hidden="true" />
          </IconButton>
          <IconButton label="Playlists" popoverTarget="spotify-playlists" onClick={sp.loadPlaylists}>
            <ListMusic size={20} aria-hidden="true" />
          </IconButton>
        </div>
        <div
          id="spotify-playlists"
          popover="auto"
          className="playlists overflow-y-auto rounded-lg border border-line bg-surface p-2 text-ink shadow-lg"
        >
          <h2 className="px-2 py-1 text-sm font-medium">Your playlists</h2>
          {sp.playlistsError ? (
            <p className="px-2 py-1 text-sm text-muted">{sp.playlistsError}</p>
          ) : sp.playlists == null ? (
            <p className="px-2 py-1 text-sm text-muted">Loading…</p>
          ) : (
            <ul>
              {/* Liked Songs has no playlist URI; an empty uri means "play Liked Songs". */}
              {[{ uri: '', name: 'Liked Songs' }, ...sp.playlists].map((p) => (
                <li key={p.uri || 'liked'}>
                  <button
                    type="button"
                    popoverTarget="spotify-playlists"
                    popoverTargetAction="hide"
                    onClick={() => sp.playPlaylist(p.uri)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent-soft"
                  >
                    {!p.uri ? (
                      <span className="grid size-9 shrink-0 place-items-center rounded bg-accent text-on-accent">
                        <Heart size={16} fill="currentColor" aria-hidden="true" />
                      </span>
                    ) : p.art ? (
                      <img src={p.art} alt="" className="size-9 shrink-0 rounded" />
                    ) : (
                      <span className="grid size-9 shrink-0 place-items-center rounded bg-accent-soft text-muted">
                        <Music2 size={16} aria-hidden="true" />
                      </span>
                    )}
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </>
    )
  }

  return (
    <aside aria-label="Spotify" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface">
      {children}
      <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">{body}</div>
    </aside>
  )
}
