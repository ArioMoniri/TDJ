# TDJ owner guide (no technical steps)

You are the organiser: the person who put TDJ online for the DJs of your milonga, marathon or school. This page lists everything you must give or do, once, so a DJ can open the app, log in to Spotify and get written reviews without any setup of their own. Every step is a click, a paste or an e-mail; nothing runs in a terminal.

The app address below is written as `https://your-app` (for the current deployment it is `https://d3k5k2c1l0s5ri.cloudfront.net`). Wherever a redirect URI is needed, `/admin` shows the exact text with a Copy button.

## A. First time: open the owner page

1. Deploy once (GitHub → Actions → **Deploy to AWS** → Run workflow). The run takes a few minutes.
2. Open the finished run → **Summary**. The "Owner setup" box shows a one-time **setup code**. It works for one day.
3. Open `https://your-app/admin`, paste the code → **Unlock**.
4. Choose an **owner passphrase** (8 characters or more) and save it. The setup code stops working; from now on `/admin` opens with the passphrase. Forgot it? Run Deploy to AWS again and use the new setup code.

The page has a group for each service below, plus **People** and **AI reviews for everyone**. The top right of the page links back to this guide.

## B. Spotify (one-tap login for up to 5 DJs)

What Spotify allows, verified 2026-10-19: a Spotify app in Development Mode admits **5 Spotify accounts**, named by e-mail by you in the Spotify dashboard. One app per developer account. The bigger "Extended Quota" is for registered businesses with 250,000 monthly users, so "anyone can log in" is not possible on Spotify's side. Every other DJ still gets their set into Spotify through a transfer service (section G).

1. Go to https://developer.spotify.com/dashboard, log in with a **Spotify Premium** account and click **Create app**. Name: `TDJ`. Description: anything. Website: `https://your-app`.
2. **Redirect URIs**: paste the two addresses `/admin` shows under Spotify, exactly as written (Copy button):
   - `https://your-app/api/spotify/callback`
   - `https://your-app/callback`
   Tick **Web API** and **Web Playback SDK**, accept the terms, **Save**.
3. Open the app → **Settings** (top right) → copy the **Client ID**; click **View client secret** and copy the **Client secret**.
4. Back on `/admin` → Spotify: paste both → **Save** → **Test**. "Spotify accepted the Client ID and secret" means the login works.
5. **User Management** (left menu of your Spotify app): add the name and Spotify e-mail of yourself and up to 4 DJs. Each one can log in a minute later. Paste the same e-mails into `/admin` → **People** → **Spotify seats** so everyone sees how many seats are left.

## C. Google (Drive files and YouTube playlists, up to 100 DJs)

While the app is "unverified" Google admits up to **100 test users**, each of whom reconnects once a week. Publishing the app for everyone needs Google's review of the YouTube permission; it is optional.

1. Go to https://console.cloud.google.com, create a project called `TDJ`.
2. **APIs & Services → Library**: enable **Google Drive API** and **YouTube Data API v3**.
3. **Google Auth Platform → Branding**: app name `TDJ`, your support e-mail, your domain. **Audience**: External; add every DJ as a **test user** (their Google e-mail).
4. **Clients → Create client → Web application**: under Authorised redirect URIs paste the address `/admin` shows under Google: `https://your-app/api/google/callback`. Create, then copy the **Client ID** and the **Client secret**.
5. `/admin` → Google: paste both → **Save** → **Test**. Add the test users' e-mails to **People → Google seats**.

## D. Dropbox (export files, up to 50 DJs)

A Dropbox app in development admits **50 linked users**; after that Dropbox asks you to apply for production (a short form, free).

1. Go to https://www.dropbox.com/developers/apps → **Create app**: Scoped access → **App folder** → name `TDJ` (the folder DJs see is `Apps/TDJ`).
2. **Permissions** tab: tick `files.content.write` and `sharing.write` → Submit.
3. **Settings** tab → OAuth 2 → Redirect URIs: paste `https://your-app/api/dropbox/callback` (shown on `/admin`). Copy the **App key** and the **App secret** (Show).
4. `/admin` → Dropbox: paste both → **Save** → **Test**. Keep your own count in **People → Dropbox seats**.

## E. AI reviews for everyone

A DJ gets written reviews of a set and precise "Tell the DJ" changes from a model. With one key paid by you, every DJ gets them without a key of their own.

1. Get an API key from the provider you choose: Anthropic (https://console.anthropic.com → API keys; create the key **inside a workspace**, or also copy the workspace's ID `wrkspc_…`), OpenAI, Gemini or OpenRouter.
2. `/admin` → **AI reviews for everyone**: pick the provider, paste the key (and the Workspace ID if the key was made at organisation level), leave the model blank for the default, set the **daily limit per DJ** (20 requests a day is plenty) → **Save** → **Test**.
3. Cost: one review is a few cents; the daily limit caps what a single DJ can spend. The key never reaches a browser; DJs who add their own key under Settings use it instead of yours.

## F. What DJs see

- **Settings → Connectors**: a Spotify row with one button, "Log in with Spotify". Google and Dropbox rows read "Connect" when you enabled them, "Not enabled" otherwise.
- **Settings → Written reviews**: "Using the organiser's key · 3 of 20 today" once your key is saved, with "Use my own key" for DJs who have one.
- **Export → Send to**: Spotify (their account), **Spotify via a transfer service** (any account, no seat needed), YouTube, Dropbox and Google Drive when enabled, plus the file downloads for Rekordbox, Traktor, Serato and the rest.
- A DJ who logs in to Spotify without being on your list sees a plain sheet: "This app can let in 5 Spotify accounts. Ask the organiser to add your Spotify email, or send your set to Spotify another way", with your contact (section A's **Organiser contact** field), a **Copy my request** button that drafts the e-mail to you, and **Other ways**.

## G. When a DJ cannot log in to Spotify

1. Check **People → Spotify seats** on `/admin`. Fewer than 5? Add the DJ's Spotify e-mail under User Management in the Spotify dashboard and to the list on `/admin`; they can log in a minute later.
2. All 5 taken? Either swap a seat (remove someone in User Management, add the new DJ) or tell the DJ to use **Export → Send to → Spotify via a transfer service**: TDJ downloads a small file (title, artist, album) and opens TuneMyMusic or Soundiiz, which build the playlist in the DJ's own Spotify account in three steps. This works for any number of DJs.
3. A DJ who has their own Spotify developer app can also paste its Client ID under Settings → Spotify → Advanced.

## H. The two tables

### What you must give (keys)

| What | Where you get it | Where it goes |
|---|---|---|
| Owner passphrase | you choose it | `/admin` → Owner passphrase |
| Spotify Client ID + Client secret | developer.spotify.com → your app → Settings | `/admin` → Spotify |
| Google Client ID + Client secret | console.cloud.google.com → Clients | `/admin` → Google |
| Dropbox App key + App secret | dropbox.com/developers/apps → your app → Settings | `/admin` → Dropbox |
| Model API key (+ Workspace ID for an Anthropic organisation key) | console.anthropic.com, platform.openai.com, aistudio.google.com or openrouter.ai | `/admin` → AI reviews for everyone |
| Organiser contact (e-mail or chat handle) | yours | `/admin` → People |

### What you must do (clicks)

| Step | Where | How often |
|---|---|---|
| Run Deploy to AWS, copy the setup code | GitHub → Actions | once (and again if the passphrase is lost) |
| Unlock `/admin`, set the passphrase | `https://your-app/admin` | once |
| Create the Spotify app, paste the 2 redirect URIs, tick Web API + Web Playback SDK | developer.spotify.com | once |
| Add DJ e-mails (up to 5) | Spotify dashboard → User Management, and `/admin` → People | per DJ |
| Create the Google project, enable Drive + YouTube APIs, consent screen, OAuth client with 1 redirect URI | console.cloud.google.com | once |
| Add Google test users (up to 100) | Google Auth Platform → Audience, and `/admin` → People | per DJ |
| Create the Dropbox app (App folder `TDJ`), 2 permissions, 1 redirect URI | dropbox.com/developers/apps | once |
| Paste each pair on `/admin`, Save, Test | `/admin` | once per service |
| Paste the model key, choose the daily limit | `/admin` → AI reviews for everyone | once |
| Answer "add my Spotify e-mail" requests | your inbox | per DJ |

Everything on `/admin` lives in your AWS account (Parameter Store, encrypted); the page only ever shows "Configured" and the last four characters of an ID. Technical detail, if someone asks: [docs/DEPLOY.md](DEPLOY.md).
