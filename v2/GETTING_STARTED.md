# Getting Started — from this PR to a running app

This guide assumes **no coding experience**. Follow it top to bottom and you will have the mock-interview app running on your own laptop. Every command is copy-pasteable: paste it into your terminal (macOS: **Terminal** app; Windows: **Git Bash**, installed with Git below) and press Enter.

---

## 1. Prerequisites (one-time setup)

### Git

Check whether you already have it:

```bash
git --version
```

If you see a version number (e.g. `git version 2.43.0`), you're set. If you see "command not found", download and install Git from **<https://git-scm.com/downloads>** (accept the default options), then close and reopen your terminal and run the check again.

### Node.js

Check whether you already have it:

```bash
node --version
```

You need **v20 or newer** (e.g. `v20.11.0` or `v22.x`). If it's missing or older, install the **LTS** version from **<https://nodejs.org>** (the big green button), then close and reopen your terminal and check again.

### Tell Git who you are (one-time)

Use your own name and the email of your GitHub account:

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

---

## 2. Getting the code

### Option A — merge the PR first (simplest)

1. Open the pull request on GitHub and click **Merge pull request**, then **Confirm merge**.
2. On your laptop, get the code:

   **First time** (creates a `pathwisse-mockinterview` folder):

   ```bash
   git clone https://github.com/MahammadWahab540/pathwisse-mockinterview.git
   cd pathwisse-mockinterview
   ```

   **Already cloned before** (update your existing folder):

   ```bash
   cd pathwisse-mockinterview
   git pull origin main
   ```

### Option B — try the PR branch *before* merging

```bash
git clone https://github.com/MahammadWahab540/pathwisse-mockinterview.git
cd pathwisse-mockinterview
git fetch origin
git checkout claude/blissful-hopper-a5gn13
```

(`claude/blissful-hopper-a5gn13` is this PR's branch name.)

---

## 3. Setup

Go into the new app and create your settings file:

```bash
cd v2/server
cp .env.example .env
```

(Windows Git Bash understands `cp`; in plain Command Prompt use `copy .env.example .env`.)

Now open `v2/server/.env` in any text editor (Notepad is fine) and fill it in:

| Setting | What to do |
| --- | --- |
| `GROQ_API_KEY` | **Required.** Get a free key: go to <https://console.groq.com>, sign up, open **API Keys**, click **Create API Key**, copy it, and paste it after the `=`. |
| `GROQ_MODEL` | Leave the default. |
| `GROQ_WHISPER_MODEL` | Leave the default. |
| `PORT` | Leave the default (3001). |
| `STORAGE_BACKEND` | Leave as `file` for local use. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Leave empty — only needed for production deployment. |

---

## 4. Running locally

You need **two terminals** (two terminal windows/tabs), one for the backend and one for the frontend, started in this order.

**Terminal 1 — backend:**

```bash
cd pathwisse-mockinterview/v2/server
npm install
npm run dev
```

Success looks like this in the terminal (leave it running):

```
mock-interview v2 server listening on http://localhost:3001
```

**Terminal 2 — frontend:**

```bash
cd pathwisse-mockinterview/v2/web
npm install
npm run dev
```

Success looks like this (leave it running too):

```
  VITE v6.x.x  ready in ... ms
  ➜  Local:   http://localhost:5173/
```

Now open **<http://localhost:5173>** in Chrome or Edge. (`npm install` is only needed the first time, or after pulling new code.)

To stop either service later, click into its terminal and press **Ctrl+C**.

---

## 5. Testing stage by stage

Work through this checklist in order — each stage builds on the previous one. (These are the same steps as the "Stage verification" section of the [README](./README.md).)

**Stage 1 — core turn loop**
- [ ] Backend terminal shows `listening on http://localhost:3001`; frontend shows the Vite URL.
- [ ] Start a **skill** interview (e.g. "React") with **2 questions**.
- [ ] The first question appears on screen and is read aloud (first time, the voice model downloads in the background — give it a minute).
- [ ] Click **Answer**, allow the microphone, speak, click **Done**.
- [ ] Your spoken answer comes back as an accurate transcript and the next question appears.
- [ ] After question 2 the interview completes.

**Stage 2 — full interview flow**
- [ ] The step trail at the top (Setup → Briefing → Mic check → Meet → Interview → Report) shows where you are, and every step has a **← Back** button.
- [ ] Briefing screen shows the plan (question count, focus areas, length).
- [ ] Buttons work even while the interviewer is talking — clicking **Answer** just interrupts her.
- [ ] Mic check lets you record and play back a test clip.
- [ ] The interviewer introduces herself out loud; the orb animates while she speaks.
- [ ] The room shows "Question X of Y" with a progress bar.
- [ ] **Repeat question**, **Skip**, **Type instead**, and **End interview** all work.
- [ ] The orb changes animation: speaking (indigo ripple) → listening (amber, while recording) → thinking (spinning, while transcribing).

**Stage 3 — evaluation & SWOT report**
- [ ] After the last answer, "Preparing your evaluation…" resolves to a report within seconds.
- [ ] The report shows: overall score and readiness level, a 2×2 SWOT grid where points quote things you said, and a card per question with score, feedback, and how to improve.
- [ ] **Download / print report** opens a clean print view.

**Stage 4 — production prep**
- [ ] A completed interview leaves a JSON file in `v2/server/data/sessions/`.
- [ ] Stop the backend (Ctrl+C) mid-interview, submit an answer — you get a friendly error with **Retry upload**, not a dead screen. Restart the backend (`npm run dev`), click retry, the interview continues.

---

## 6. Pushing changes back

If you edit files locally and want them on GitHub:

```bash
git add .
git commit -m "describe what you changed"
git push
```

> Once Railway is connected (next section), every merged PR or push to the main branch **auto-deploys** — no extra steps.

---

## 7. Deploying to the internet

Follow the **"Deploy to Railway"** section of the [README](./README.md#deploy-to-railway). In short: Railway → **New Project → Deploy from GitHub repo**, create two services (backend from `v2/server`, frontend from `v2/web`), and set the environment variables from the tables there — the same `GROQ_API_KEY` you used locally, plus Supabase storage settings (`STORAGE_BACKEND=supabase`) for the backend and `VITE_API_URL` for the frontend. No GPU and no Python service are needed.
