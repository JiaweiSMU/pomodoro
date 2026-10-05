# Pomodoro

A Pomodoro timer that hatches a pixel animal every time you finish a focus
session. Built with React, Tailwind CSS and Lucide icons. It is a static site:
there is no server and no database, so it runs on Vercel's free tier.

## What it does

- **Timer**: Focus, Short break and Long break, each with a length you set
  (1 to 180 minutes) from the stepper under the timer or in Settings. A long
  break is suggested after every 4 focus sessions (also adjustable).
- **Rewards**: finishing a focus session hatches one of 43 pixel animals
  (20 common, 15 rare, 8 legendary), from pets and farm animals to wildlife,
  including breeds such as the Shiba Inu and Siamese cat. Skipping or resetting
  a focus session hatches nothing. Longer sessions improve the odds of rarer
  animals, and the last session before a long break always hatches a rare or
  better. Every animal you have hatched walks along the top of the Spotify bar.
- **Meadow**: a second page (`/meadow`). While a focus session runs, every
  animal you have hatched takes turns jumping a fence, and each jump earns
  coins: 1 for a common animal, 3 for a rare, 10 for a legendary, times how
  many of it you have. Coins are earned from focus time, so they keep counting
  on the Timer page, in another tab, or with the browser closed.
- **Closet**: a third page (`/closet`) where you spend coins on accessories and
  outfits: 19 items over four slots (head, face, neck and body), from a 200-coin
  bow to a 30,000-coin royal robe. Try anything on before you buy it. One
  purchase works for every animal, and each species wears its own outfit, shared
  by all its copies.
- **History**: a bar chart of completed pomodoros by day (7 days), week
  (8 weeks, Monday to Sunday) or month (6 months), with arrows to look further back.
- **Tasks**: add tasks with an estimate, pick one, and finished sessions count toward it.
- **Spotify**: play, pause, skip, shuffle, save or remove the current song from
  Liked Songs, and start any of your playlists or your Liked Songs from the
  playlist button.
- Light and dark mode, colours that change with the timer mode, a soft chime,
  the time in the browser tab title, **Space** to start or pause, **Alt+S** to skip.

Everything (settings, tasks, history, animals, coins, items and outfits) is saved in your browser's
local storage. It stays on that browser and device, and is not synced.

## Run it on your computer

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173 (use that address, not `localhost`: Spotify
rejects `localhost`).

`npm test` runs the coin tests.

## Put it on Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, choose **Add New > Project** and import the repository. Vercel
   detects Vite on its own (build command `npm run build`, output folder `dist`).
3. Deploy. You get an address like `https://your-name.vercel.app`.

Or, without GitHub: run `npx vercel` in this folder and follow the prompts.

## Connect Spotify

Spotify requires every site to register as an "app" first. It is free, but
the account that owns the app must have **Spotify Premium**.

1. Go to https://developer.spotify.com/dashboard and choose **Create app**.
2. Under **Redirect URIs** add both of these, exactly:
   - `https://your-name.vercel.app/callback` (your real Vercel address)
   - `http://127.0.0.1:5173/callback` (for running it on your computer)
3. When asked which APIs you plan to use, tick **Web API**, then save.
4. Copy the **Client ID** from the app's settings and give it to the site in
   one of two ways:
   - On Vercel: **Project Settings > Environment Variables**, add
     `VITE_SPOTIFY_CLIENT_ID` with the Client ID as its value (no quotes),
     then redeploy. The ID is built into the site when Vercel builds it, so
     saving the variable alone changes nothing.
     (Locally: create a file named `.env.local` in this folder containing
     `VITE_SPOTIFY_CLIENT_ID=your-client-id`, then restart `npm run dev`.)
   - Or paste the Client ID into **Settings > Spotify** on the site itself. It
     is then remembered in that browser only, and takes priority over the
     built-in one, so it can also fix a wrong built-in ID. Clear the box to go
     back to the built-in ID.
5. On the site, press **Connect Spotify** and approve.

The Client ID is not a secret; it is safe in the page. No client secret is used.

Things to know:

- **It is a remote control.** The site controls Spotify playing on another
  device (the desktop app, your phone, a speaker). It does not play sound in
  the browser tab itself. Have Spotify open somewhere; if nothing is active,
  pressing play wakes the first device Spotify reports.
- **Premium only.** Spotify refuses play, pause and skip for free accounts.
- **Up to 5 people.** A new Spotify app is in "development mode": only accounts
  you add under **User Management** in the dashboard can sign in. That is
  plenty for a personal site. If Spotify refuses your own sign-in, add your
  account there too.
- **Use your main Vercel address.** Preview deployments get a different address
  each time, which will not match the redirect URI you registered.
- **"client_id: Invalid"** on Spotify's page means Spotify has no app with that
  Client ID. Check you copied the Client ID, not the Client Secret (both are 32
  letters and numbers). Press Back to return to the site.
- **Reconnect after updates that add permissions.** If the playlist list asks
  for a new permission, go to **Settings**, press **Disconnect Spotify**, then
  connect again.

## Changing things

| To change | Edit |
| --- | --- |
| Animals, their pixels and colours, the odds, the fence | `src/animals.js` |
| Coin values and how often animals jump | `src/coins.js` |
| Colours for each mode, light and dark | `src/index.css` |
| The timer and saved sessions | `src/useTimer.js` |
| The timer page, tasks, chart, collection and Settings | `src/App.jsx` |
| The Meadow page | `src/MeadowPage.jsx` |
| Accessories and outfits: their pixels, prices, and where they sit on each animal | `src/wardrobe.js` |
| The Closet page | `src/ClosetPage.jsx` |
| The Spotify bar and playlist list | `src/SpotifyBar.jsx` |
| How the site talks to Spotify | `src/spotify.js` |

Each animal is 16 rows of 16 characters, one character per pixel, so you can
draw a new one in a text editor. For a breed or colour variant of an existing
animal, add one `variant(...)` line at the bottom of `ANIMALS` with a new
palette; it reuses that animal's pixels.
