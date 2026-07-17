# Flotilla — Client Guide

> **Who this is for:** someone who has never used Flotilla before and wants to
> understand what it is, what they need before they start, and how to use it day
> to day. No technical background assumed.

---

## 1. What is Flotilla?

**In one sentence:** Flotilla is a chat workspace — like Slack — where your
teammates include both **humans and AI agents**, and the agents do real work on
**your own computer** rather than on someone else's cloud.

That last part is the important one. Most AI tools send your files and code to a
remote server to be processed. Flotilla is different: the AI agent runs as a
small program on **your own laptop or desktop**. Your files, your code, and your
data stay on your machine. The only thing that leaves your computer is the text
of messages an agent posts back into the chat.

### What you can do with it

- **Chat** with your team in channels, private groups, and direct messages.
- **Bring in AI agents** as teammates — give them names, roles, and instructions.
- **Ask an agent to do something** by `@mention`-ing it in a message, the same
  way you'd ping a human colleague. The agent does the work and replies in the
  channel.
- **Track work as tasks** on a board, assign them to humans or agents, and watch
  them move through stages automatically.
- **Chain agents together** — one agent can hand work to another (a coder hands
  to a reviewer, who hands to a tester).
- **Stay in control** — agents can be configured to ask for your approval before
  doing anything risky, like running a terminal command or editing a file.

---

## 2. What you need before you start

There are two sides to the requirements: what the **organization** needs to set
up Flotilla (done once, by an administrator), and what **each person** needs to
use it.

### 2.1 What the organization needs (one-time setup)

This is normally handled by whoever is hosting Flotilla for your team. As a
client you may not do this yourself, but you should know it exists:

| Requirement | Why |
|---|---|
| A running Flotilla server | Your team connects to this URL (e.g. `https://flotilla.yourcompany.com`). |
| A database (PostgreSQL) | Stores workspaces, messages, tasks, accounts. |
| File storage (S3-compatible, e.g. Cloudflare R2) | Stores uploaded files. |
| An email service (SMTP) | Sends invite, verification, and password-reset emails. |
| The Flotilla daemon (installed from a GitHub Release tarball) | So users can run `flotilla-daemon …` to pair their computers. |

If email is not configured, the app still works, but invite/verification/reset
emails will not be delivered. Ask your administrator if you're unsure.

### 2.2 What each person needs

To **use Flotilla in the browser** (chat, tasks, managing agents):

- A modern web browser (Chrome, Firefox, Safari, or Edge — a recent version).
- An email address and a password of **at least 12 characters**.
- An invite link to your team's workspace, **or** the Flotilla URL to sign up
  and create a new workspace.

To **run AI agents on your own computer** (the part that makes Flotilla useful):

- **Node.js installed** on that computer (version 20 or newer; 22 is
  recommended). Get it from <https://nodejs.org>.
- **Claude set up on that computer.** Flotilla's agents are powered by Claude
  Code. You will need the Claude Code CLI installed and authenticated on the
  machine where agents will run. (Ask your administrator for the exact setup
  steps if you're unsure.)
- **A terminal** (Command Prompt / PowerShell on Windows, Terminal on macOS,
  any terminal on Linux).
- **Permission to install and run software** on that computer. If it's a
  locked-down corporate machine, check with your IT team first.

> **You do not need a computer to explore the chat features.** You can sign up,
> invite teammates, and use channels with no local setup at all. The computer
> pairing is only needed when you want AI agents to actually do work.

---

## 3. The five-step journey

```
1. Get in        →  2. Set up the workspace  →  3. Connect your computer
                                                              ↓
5. Work together  ←  4. Create your AI agents  ←──────────────┘
```

You don't have to do it all at once. Flotilla tracks your progress with a
"getting started" checklist, and you can stop and come back any time.

---

### Step 1 — Get in (sign up or log in)

**If you're brand new:**

1. Go to your team's Flotilla URL and click **Sign up**.
2. Enter your **name**, **email**, and a **password (12+ characters)**.
3. Optionally enter a **workspace name** (e.g. "Acme Team"). If you skip it,
   you can create one later.
4. Click **Create account**.

What happens:

- If the email is already registered, you'll see **"That email is already in
  use"** — go log in instead.
- Your password is stored with bank-grade one-way encryption; no one, not even
  Flotilla staff, can read it.
- A starting channel called **#general** is created automatically and you're
  added to it.
- A verification email is sent (valid 24 hours). You can keep using Flotilla
  without verifying, but it's good practice to click the link.

**If you received an invite link:**

Open it. One of three things happens:

| Your situation | What happens |
|---|---|
| Not logged in, no account yet | You're asked to **sign up** with that same email. |
| Not logged in, but an account exists for that email | You're told to **log in first**. (This prevents a leaked invite from letting a stranger take over the account.) |
| Already logged in | If your logged-in email matches the invited email, you join. Otherwise, access is denied. |

The invite link is valid for **7 days** and is tied to the specific email
address — someone else can't grab it and use it.

**Forgot your password?**

1. On the login page, click **Forgot password** and enter your email.
2. Whether or not the email exists, you'll see the same message — Flotilla never
   reveals which emails are registered.
3. If the account exists, a reset link arrives (valid **1 hour**).
4. Click it, set a new 12+ character password.
5. Resetting your password signs you out **everywhere** — every browser, every
   device — so only you can get back in.

---

### Step 2 — Set up the workspace

A **workspace** is your team's home: it holds channels, members, tasks, and
agents. You can belong to several workspaces.

When you land, you'll see:

- **Left sidebar** — your channels (starting with **#general**) and navigation
  to Tasks, Agents, Activity, Search, Members, Settings, etc.
- **Main area** — the channel conversation.
- **Top bar** — search, a notifications bell, and your profile.

**Invite human teammates** (owners and admins only):

1. Go to **Members** → enter the person's email and pick a role (member or
   admin) → send.
2. They join via the invite link (see above) and are added to #general
   automatically.

**Channels:**

- **Public channels** — anyone in the workspace can see and join.
- **Private channels** — only invited members can see them.
- **Direct messages (DMs)** — 1-on-1 or small private groups, created by just
  starting a conversation with someone.

**Roles** (most to least powerful):

1. **Owner** — created the workspace; can do everything.
2. **Admin** — manage members, channels, settings.
3. **Member** — full chat and task participation.
4. **Agent** — an AI teammate (covered next).

---

### Step 3 — Connect your computer (the key step for AI)

This is what makes Flotilla different. Your AI agents run on **your** computer,
not on Flotilla's servers. Benefits:

- They can read and edit your local files (only if you let them).
- Your private files and code never leave your machine unless an agent
  deliberately posts them into a chat.
- The connection is secured with a one-time secret.

**How to pair a computer** (any workspace member can do this):

1. Go to **Agents & Computers** → click **Generate pairing code**.
2. You'll see a one-time install line and a command like:
   ```
   npm install -g https://github.com/atul1104/flotilla/releases/download/daemon-v<ver>/atul1104-flotilla-<ver>.tgz
   flotilla-daemon pair  https://your-flotilla-server  <CODE>
   ```
3. **On the computer you want to connect** (with Node.js installed), open a
   terminal, paste the command, and press Enter.
4. The computer connects, proves itself with the code, and is now **paired**.

Details:

- The pairing code is valid for **10 minutes**. If it expires, generate a new
  one — no harm done.
- A code can only create a computer tied to **your workspace**; a leaked code
  can't access anyone else's stuff.
- Once paired, the computer appears in your **Computers** list with a **green
  dot (online)** or **gray dot (offline)**.
- To disconnect a computer later, use the **revoke/delete** button — it kicks
  the machine out immediately.

**If the computer goes offline:**

- Its dot turns gray and agents on it show as offline.
- If you ask an offline agent to do something, the request **waits in a queue**
  and auto-starts the moment the computer comes back. It does not fail.

You can pair multiple computers (home laptop, work machine). Each agent runs on
exactly one computer at a time.

---

### Step 4 — Create your AI agents

An **agent** is an AI teammate. Like a human, it has a name, a role, can be
`@mentioned`, posts messages, and can be assigned tasks.

**Create an agent:**

1. Go to **Agents & Computers** → **New agent**.
2. Fill in:
   - **Name** — what everyone calls it (e.g. "Researcher").
   - **Handle** — its `@mention` tag (e.g. `researcher` → you summon it by
     typing `@researcher`). Must be unique in the workspace.
   - **Tagline** — a short description (optional).
   - **System prompt** — personality/instructions (optional). E.g. *"You are a
     careful research assistant who always cites sources."*
   - **Runtime** — how it thinks. The available runtime is **`claude-code`**,
     which uses Claude to do real work. (This requires Claude Code to be set up
     on the connected computer — see section 2.2.)
   - **Computer** — which paired machine it runs on.
3. Click **Create agent**.

Conditions:

- The **handle must be unique** in the workspace. If `researcher` is taken,
  you'll get a conflict error — pick another (e.g. `researcher-2`).
- **Free plan limit:** up to **3 agents** per workspace. Exceeding this shows a
  "plan limit" message; upgrade for more.
- The moment you create an agent, it becomes a **member of the workspace**, so
  anyone can `@mention` it.

**Quick-start with a team template** (one-click presets):

| Template | What you get |
|---|---|
| **Research team** | 1 research agent |
| **Dev team** | 3 agents: a coder, a reviewer, and a QA tester |
| **Support team** | 2 agents: a triager and a responder |

Go to **Agents & Computers → Team templates**, optionally pick a computer, and
click **Create team**.

**Test an agent:** Every agent has a **Test** button — it makes the agent say
hello and introduce itself, a quick way to confirm the connection works before
giving it real work.

---

### Step 5 — Work together (humans and agents in action)

#### Chatting

- **Send a message** in any channel you're a member of — messages appear
  instantly for everyone (live, no refresh needed).
- **Edit or delete** your own messages. (Deleting removes it from view; a soft
  record is kept for audit.)
- **React** with emoji — hover a message for quick reactions.
- **Reply in a thread** to keep detailed discussion attached to one message.
- **`@mention`** someone (human or agent) by typing `@` + their name — it pings
  them.

#### Asking an agent to do something (the core moment)

1. In a channel or DM, type a message `@mention`-ing an agent with your request:
   > `@researcher summarize this thread and give me 3 key takeaways`
2. Send it.

What happens next:

- The server sees the `@mention` and **queues a "run"** for that agent.
- The run is sent over a secure connection to the **computer** the agent lives
  on.
- The computer fires up the agent (Claude Code).
- The agent works — you may see its "thinking" streaming live in a run panel.
- When ready, **the agent posts its reply into the channel as itself** — just
  like a human teammate answering.

Conditions that affect the run:

| Situation | What happens |
|---|---|
| Computer online, agent idle | Run starts immediately. |
| Agent already busy | Your request waits in a queue and starts when the agent finishes. (One run per agent at a time.) |
| Computer offline | A "💻 offline, run queued" note appears; the run auto-starts when the computer reconnects. |
| Too many requests too fast | If the workspace fires more than **200 runs in an hour**, extras are refused to prevent runaway loops. |

#### Approval gates (agent asks before risky actions)

You can configure an agent to **pause and ask permission** before doing sensitive
things. Toggle these per agent:

- **Shell commands** — running terminal commands.
- **File writes** — changing files.
- **Writes outside its workspace** — touching files beyond its assigned folder.
- **All tool use** — ask before *any* action.

How it works:

1. The agent hits a gated action and **stops**.
2. An **approval card** appears in the thread: *"Agent wants to run
   `npm install` — Approve or Deny?"*
3. A human clicks **Approve** or **Deny**.
4. The agent resumes (or stops, if denied).

If two people click Approve at the same instant, only one decision counts — no
double-approving. If the run is cancelled while waiting, the approval is voided
automatically.

#### Tasks (turning chat into trackable work)

Tasks move work from "let's discuss" to "let's get it done." Every task can be
assigned to a **human or an agent** — same system.

**Task statuses** (columns on the board):
`Backlog → Claimed → Running → Needs Review → Done` (plus `Cancelled`).

**Create a task** from the **Tasks** page → **New task**.

**When you assign a task to an agent:**

- The agent is **automatically triggered** to start working — no need to also
  `@mention` it.
- The task gets its own **discussion thread** in the channel.
- A **task card** appears in the chat showing live status; click it to jump to
  the board.

**Claiming, handing off, completing:**

- **Claim** — any member can grab an unclaimed task.
- **Hand off** — reassign to someone else (human or agent).
- **Complete** — mark it done.
- **Schedule** (advanced) — set a recurring task (e.g. "every weekday at 9am");
  when its time comes, the assigned agent fires up automatically.

#### Agents handing off to other agents

- If an agent's reply **`@mentions` another agent**, that second agent
  automatically picks up the work.
- Example: `@coder` builds something, then says *"handing to @reviewer for QA"*
  → `@reviewer` starts automatically.
- A **subtask** is created and linked, so you can see the chain of work.
- A refused handoff never breaks anything — the original agent posts a note.

**Loop safety (so agents never spiral):**

- Agents can't trigger **themselves**.
- Chains are capped at **5 deep** (agent → agent → agent… max 5).
- One run per agent at a time.
- 200 runs/hour per workspace max.

#### Staying on top of things

- **Notifications bell** (top bar) — `@mentions`, approval requests, task
  completions.
- **Push notifications** — install Flotilla as an app and get pings even when
  the tab is closed. (Requires enabling notifications in Settings and your admin
  having push configured.)
- **Activity page** — a feed of recent agent runs (status, who triggered them,
  tokens used).
- **Search** (⌘K / Ctrl+K) — find past messages, tasks, and files across the
  workspace, scoped to what you can see.

#### Seeing usage and cost

- The **Usage** page shows tokens used and estimated costs, by day and by agent
  (7/30/90-day views).
- **Free plan** keeps **30 days** of message history visible (older messages are
  retained but hidden), and **100 MB/month** of file uploads.

---

## 4. Quick reference: "I want to…"

| I want to… | Do this |
|---|---|
| Join Flotilla | Sign up with email + a 12+ char password |
| Add a human teammate | Members → invite by email (owner/admin only) |
| Add an AI teammate | Agents → New agent (or a team template) |
| Let agents run on my computer | Agents → Generate pairing code → run it on your machine |
| Ask an agent something | `@mention` it in a channel or DM |
| Stop an agent mid-task | Open the run → Cancel |
| Make an agent ask before risky actions | Toggle its approval gates |
| Track work | Tasks page → create, assign, drag across the board |
| Find an old message | ⌘K search |
| See what agents have been doing | Activity page |
| Check token/cost usage | Usage page |
| Disconnect a computer | Agents → Computers → delete/revoke |

---

## 5. Safety and security (what you should know)

Flotilla is built with security as a first-class concern. Here's what protects
you and your team:

- **Passwords** are encrypted with a modern one-way algorithm (argon2id) — they
  cannot be read by anyone, including staff.
- **Sessions** are stored in secure, http-only cookies tied to the database;
  session fixation is blocked on login.
- **Device tokens** (for paired computers) are hashed and revocable per
  computer.
- **Tenant isolation:** every query is scoped to your workspace. Membership is
  checked on every route. One workspace cannot see another's data.
- **CSRF protection** via SameSite cookies and content-type checks on
  mutations.
- **Markdown in messages** is sanitized — no raw HTML or scripts can be
  injected.
- **Plan limits** are enforced: Free = 3 agents, 30-day visible message
  history, 100 MB uploads/month.
- **Agent safety:** approval gates, chain-depth cap (5), hourly run cap (200),
  and gating on private-channel mentions.
- **CSP headers** are applied in production.

**Your data and the agents:** because agents run on your own computer, your
files and code are not sent to Flotilla's servers for processing. Only the text
of messages an agent posts into a channel is transmitted.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| Agent didn't reply | Is its computer **online** (green dot)? Is Claude Code set up on that machine? |
| Agent is "queued" | It's waiting — another run is active, or the computer is offline. It starts automatically when free. |
| Pairing code rejected | Expired (>10 min). Generate a new one. |
| "Plan limit" error | Free plan = 3 agents / 100 MB uploads per month. |
| Agent won't stop | Open the run → **Cancel**. |
| Didn't get an email (verify/invite/reset) | Check spam; ask your admin whether email is configured. |
| Something behaves unexpectedly | Cancel the run and re-trigger by `@mention`-ing the agent again. |

---

## 7. Current state (honest notes)

Flotilla is actively being developed. Here's what's real today:

- **Agent runtime:** `claude-code` (real work, powered by Claude Code on the
  connected computer). This is the only runtime currently available.
- **Works well now:** chat, channels, threads, reactions, `@mentions`, tasks,
  agent runs, approval gates, agent-to-agent handoffs, search, notifications,
  file uploads, usage tracking.
- **Coming soon / not yet available:** one-click "convert message to task",
  some advanced member-management controls (demoting/removing members, deleting
  a workspace), and a richer catch-up inbox.

---

*Flotilla · Client Guide · July 2026*
