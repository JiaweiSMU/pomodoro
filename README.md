# Pomodoro

A Pomodoro timer that hatches a pixel animal every time you finish a focus
session. Built with React, Tailwind CSS and Lucide icons. It is a static site:
there is no server and no database, so it runs on Vercel's free tier.

## What it does

- **Timer**: Focus, Short break and Long break, each with a length you set
  (1 to 180 minutes) from the stepper under the timer or in Settings. A long
  break is suggested after every 4 focus sessions (also adjustable).
- **Rewards**: finishing a focus session hatches one of 12 pixel animals
  (6 common, 4 rare, 2 legendary). Skipping or resetting a focus session hatches
  nothing. Longer sessions improve the odds of rarer animals, and the last
  session before a long break always hatches a rare or better.
- **History**: a bar chart of completed pomodoros by day (7 days), week
  (8 weeks, Monday to Sunday) or month (6 months), with arrows to look further back.
- **Tasks**: add tasks with an estimate, pick one, and finished sessions count toward it.
- **Spotify**: play, pause, skip, and save or remove the current song from
  Liked Songs.
- Light and dark mode, colours that change with the timer mode, a soft chime,
  the time in the browser tab title, **Space** to start or pause, **Alt+S** to skip.

Everything (settings, tasks, history, animals) is saved in your browser's
local storage. It stays on that browser and device, and is not synced.

## Run it on your computer

```bash
npm install
npm run dev
```

Then open http://127.0.0.1:5173 (use that address, not `localhost`: Spotify
rejects `localhost`).

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
     `VITE_SPOTIFY_CLIENT_ID` with the Client ID as its value, then redeploy.
     (Locally: copy `.env.example` to `.env.local` and paste it there.)
   - Or skip the variable and paste the Client ID into **Settings > Spotify**
     on the site itself. It is then remembered in that browser only.
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

## Changing things

| To change | Edit |
| --- | --- |
| Animals, their pixels and colours, the odds | `src/animals.js` |
| Colours for each mode, light and dark | `src/index.css` |
| The timer, tasks, chart, collection and Spotify bar | `src/App.jsx` |
| How the site talks to Spotify | `src/spotify.js` |

Each animal is 16 rows of 16 characters, one character per pixel, so you can
draw a new one in a text editor.
