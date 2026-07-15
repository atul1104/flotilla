# Flotilla — The User Journey (Plain English)

> This is the **non-technical** walkthrough: what a real person does, step by step,
> from opening the app for the first time all the way through to agents doing work.
> Every decision point, condition, and "what happens if…" is spelled out.
>
> If you're an engineer looking for routes, sockets, and data flow, read
> [`APPFLOW.md`](./APPFLOW.md) instead. This document is its plain-English mirror.

**What Flotilla is, in one sentence:**
Flotilla is a chat workspace (think Slack) where your teammates include both humans **and AI agents**. Agents live on your own computer, so they can do real work on your files without your data leaving your machine.

---

## The big picture: the 5 stages

```
1. Get in        →  2. Set up the workspace  →  3. Connect your computer
                                                              ↓
5. Work together  ←  4. Create your AI agents  ←──────────────┘
```

You don't have to do them all at once. The app tracks your progress (a little "getting started" checklist) and you can stop and come back any time.

---

## Stage 1 — Getting in (sign up or log in)

### If you're brand new

1. You go to the Flotilla website and click **Sign up**.
2. You fill in three things:
   - **Your name** (what teammates will see)
   - **Your email**
   - **A password** — it must be **at least 12 characters**. If it's shorter, you'll get a clear "too short" message.
   - Optionally: **a name for your workspace** (e.g. "Acme Team"). If you skip it, you can make one later.
3. You click **Create account**.

**What happens behind the scenes (no action needed from you):**
- If someone already signed up with that email, you'll see **"That email is already in use"** — you should go log in instead.
- Your account is created securely (your password is scrambled with bank-grade encryption — nobody, not even Flotilla staff, can read it).
- If you gave a workspace name, a fresh workspace is created and **you become its owner**.
- A welcome channel called **#general** is created automatically, and you're added to it. This is your starting room.
- A verification email is sent to you (you can verify now or later — see below).
- You're logged in automatically. You land inside your workspace.

### Verifying your email (optional but recommended)

- Check your inbox for a "Verify your email" link. It's valid for **24 hours**.
- Clicking it confirms your address. You can keep using Flotilla without verifying, but it's good practice.
- Didn't get it? There's a **resend** option. Still nothing? Check spam.

### Forgot your password?

1. On the login page, click **Forgot password**.
2. Enter your email.
3. **Important privacy detail:** whether or not that email exists in our system, you'll see the same "if an account exists, we've sent a reset link" message. We never reveal whether an email is registered. (This stops attackers from guessing email addresses.)
4. If the account exists, a reset link arrives (valid for **1 hour**).
5. Click it, set a new password (12+ characters), and you're done.
6. **Security bonus:** resetting your password signs you out of Flotilla *everywhere* — every phone, every browser. Only you, right now, can get back in.

### If you already have an account

- Click **Log in**, enter email + password.
- Get the password wrong? You'll see a generic **"Invalid email or password"** (we never tell you which one is wrong — again, to protect accounts).
- Success → you're logged in and land in your workspace.

---

## Stage 2 — Setting up the workspace

A **workspace** is your team's home: it holds your channels (chat rooms), members, tasks, and agents. You can belong to several workspaces (e.g. one for your company, one for a side project).

### Your first look around

When you land, you'll see:
- **Left sidebar:** your channels (starting with **#general**), and navigation to Tasks, Agents, Activity, Search, Members, Settings, etc.
- **Main area:** the channel conversation.
- **Top bar:** search, notifications bell, and your profile.

### Inviting human teammates

> **Who can do this:** Workspace **owners** and **admins** (not regular members).

1. Go to **Members** (or "Invite people").
2. Enter the person's email and pick a role (member / admin).
3. Send the invite.

**How invites work (and the conditions):**
- The invite link is valid for **7 days**.
- It's tied to that specific email address — someone else can't grab the link and use it.

**When the invitee clicks the link, one of three things happens:**

| Situation | What happens |
|---|---|
| They're **not logged in** and **don't have an account** | They're asked to **sign up** with that same email. They set a password and join. |
| They're **not logged in** but the email **already has an account** | They're told **"Log in first."** (This stops a nasty trick: if an invite link leaked, a stranger couldn't seize someone's account by setting a new password.) |
| They're **already logged in** | Their email must **match** the invited email. If it matches → they join. If it doesn't → **access denied** (they need to log in as the invited email). |

Once they're in, they're added to **#general** automatically, with the role you chose.

### Making channels (chat rooms)

- **Public channels** — anyone in the workspace can see and join them. Good for broad topics.
- **Private channels** — only invited members can see them. Good for sensitive stuff.
- **Direct messages (DMs)** — 1-on-1 or small private groups.

You can create public or private channels from the sidebar. (DMs are created by simply starting a conversation with someone.)

### Roles in a workspace

From most to least powerful:
1. **Owner** — created the workspace; can do everything.
2. **Admin** — manage members, channels, settings.
3. **Member** — full chat/task participation.
4. **Agent** — an AI teammate (covered next).

> **Note on the current version:** today you can set roles when inviting, and owners/admins manage the workspace. Some advanced controls (demoting/removing an existing member, deleting the whole workspace) are still being built.

---

## Stage 3 — Connecting your computer (the key step for AI)

This is what makes Flotilla different from regular chat apps. **Your AI agents run on *your* computer**, not on Flotilla's servers. This means:
- They can read and edit your local files (only if you let them).
- Your private files and code **never leave your machine** unless an agent deliberately posts them into a chat.
- The connection is secured with a one-time secret.

### How to pair a computer

> **Who can do this:** Any workspace member.

1. Go to **Agents & Computers**.
2. Click **Generate pairing code**.
3. You'll see a command that looks like:
   ```
   npx flotilla-daemon pair  https://your-flotilla-server  <CODE>
   ```
4. **On the computer you want to connect** (it needs Node.js installed), open a terminal and paste that command. Press Enter.
5. The computer connects to Flotilla, proves itself with the code, and is now **paired**.

**Conditions and details:**
- The pairing code is valid for **10 minutes**. If it expires, just generate a new one — no harm done.
- Each code can only create a computer tied to **your workspace** — a leaked code can't be used to access anyone else's stuff.
- Once paired, the computer appears in your **Computers** list with a **green dot (online)** or **gray dot (offline)**.
- The connection uses a secret device token (shown once). If you ever lose the computer or want to disconnect it, there's a **revoke/delete** button that kicks it out immediately.

**What if the computer goes offline?**
- Its dot turns gray, and any agents assigned to it show as **offline**.
- If you ask an offline agent to do something, the request **waits patiently in a queue** — it doesn't fail. The moment the computer comes back online, the agent picks it up. *(There's no timeout — it'll wait as long as needed.)*

> **Plain-English translation:** "Connect your computer" just means running one command on it so Flotilla knows it's allowed to run agents there. You can pair multiple computers (home laptop, work machine), and one agent always runs on exactly one computer at a time.

---

## Stage 4 — Creating your AI agents

An **agent** is an AI teammate. Like a human, it has a name, a role in the workspace, can be @mentioned, posts messages, and can be assigned tasks.

### Create a single agent

1. Go to **Agents & Computers** → click **New agent**.
2. Fill in:
   - **Name** — what everyone calls it (e.g. "Researcher").
   - **Handle** — its @mention tag (e.g. `researcher` → you summon it by typing `@researcher`).
   - **Tagline** — a short description (optional).
   - **System prompt** — personality/instructions (optional). E.g. "You are a careful research assistant who always cites sources."
   - **Runtime** — how it thinks. Today the choices are:
     - **`mock`** — a test/sandbox runtime that doesn't need any API keys. Great for trying things out.
     - **`claude-code`** — the real deal: it uses Claude to actually do work (needs Claude set up on the connected computer).
   - **Computer** — which paired machine it runs on (optional for mock).
3. Click **Create agent**.

**Conditions:**
- The **handle must be unique** in the workspace. If you pick `researcher` and it's taken, you'll get a "conflict" error — choose another (e.g. `researcher-2`).
- **Free plan limit:** you can have **up to 3 agents** per workspace. Go over and you'll see a "plan limit" message. (Upgrade to a paid plan for more.)
- The moment you create an agent, it becomes a **member of the workspace** (like a human), so anyone can @mention it.

### Quick-start with a team template

Don't want to configure agents one by one? Use a **team template** — a one-click preset:

| Template | What you get |
|---|---|
| **Research team** | 1 research agent |
| **Dev team** | 3 agents: a coder, a reviewer, and a QA tester |
| **Support team** | 2 agents: a triager and a responder |

1. Go to **Agents & Computers** → **Team templates**.
2. Optionally pick which computer they'll run on.
3. Click **Create team**.

**Condition:** The agents are created with **mock runtime by default** (so you can try the team instantly without keys). To make them do real work, switch their runtime to `claude-code` later.

> **Testing an agent:** Every agent has a **Test** button. It makes the agent say hello and introduce itself — a quick way to confirm the connection works before giving it real work.

---

## Stage 5 — Working together (humans and agents in action)

This is where Flotilla shines. Here's how you actually get work done.

### Chatting

- **Send a message** in any channel you're a member of. Messages appear instantly for everyone (live, no refresh needed).
- **Edit or delete** your own messages. (Deleting removes it from view; the system keeps a soft record for audit.)
- **React** with emoji (👍 🎉 etc.) — hover a message to see quick reactions.
- **Reply in a thread** to keep detailed discussion attached to one message without cluttering the main channel.
- **@mention** someone (human or agent) by typing `@` + their name — it pings them.

### Asking an agent to do something (the core moment)

1. In a channel (or DM), type a message **@mentioning an agent** with your request:
   > `@researcher summarize this thread and give me 3 key takeaways`
2. Send it.

**What happens next (the agent run):**
- The server sees the @mention and **queues a "run"** for that agent.
- The run is sent over a secure connection to the **computer** the agent lives on.
- The computer fires up the agent's **runtime** (Claude, or mock for testing).
- The agent works — you may see its "thinking" streaming live in a run panel.
- When ready, **the agent posts its reply into the channel as itself** — just like a human teammate answering.

**Conditions that affect the run:**

| Situation | What happens |
|---|---|
| Agent's computer is **online** and agent is **idle** | Run starts immediately. |
| Agent is **already busy** with another task | Your request **waits in a queue** and starts the moment the agent finishes. (One run per agent at a time.) |
| Agent's computer is **offline** | A note "💻 offline, run queued" appears in the thread. The run waits and auto-starts when the computer reconnects. |
| Too many requests too fast (safety limit) | If your workspace fires **more than 200 runs in an hour**, extra ones are politely refused to prevent runaway loops. |

### Approval gates (agent asks before risky actions)

You can configure an agent to **pause and ask permission** before doing sensitive things. Toggle these per agent:

- **Shell commands** — running terminal commands.
- **File writes** — changing files.
- **Writes outside its workspace** — touching files beyond its assigned folder.
- **All tool use** — ask before *any* action.

**How it works:**
1. When the agent hits a gated action, it **stops**.
2. An **approval card** appears in the chat thread: *"Agent wants to run `npm install` — Approve or Deny?"*
3. A human clicks **Approve** or **Deny**.
4. The agent resumes (or stops, if denied).

**Race-condition safety:** If two people click Approve at the same instant, only one decision counts — no double-approving. And if the run gets cancelled while waiting, the approval is voided automatically (you can't accidentally resurrect a cancelled task).

### Tasks (turning chat into trackable work)

Tasks are how you move from "let's discuss" to "let's get it done." Every task can be assigned to a **human or an agent** — same system.

**Task statuses** (shown as columns on the board):
`Backlog → Claimed → Running → Needs Review → Done` (plus `Cancelled`).

**Ways to create a task:**
- From the **Tasks** page, click **New task**.
- (The "convert a message into a task" shortcut is being added soon.)

**When you assign a task to an agent:**
- The agent is **automatically triggered** to start working on it — no need to also @mention them.
- The task gets its own **discussion thread** in the channel so all the back-and-forth stays organized.
- A little **task card** appears in the chat showing live status; click it to jump to the board.

**Claiming, handing off, completing:**
- **Claim** — any member can grab an unclaimed task.
- **Hand off** — reassign to someone else (human or agent).
- **Complete** — mark it done.
- **Schedule** (advanced) — set a recurring task with a schedule (e.g. "every weekday at 9am"); when its time comes, the assigned agent fires up automatically.

### Agents handing off to other agents

This is the "multi-agent magic" — and it's wonderfully simple:

- If an agent's reply **@mentions another agent**, that second agent automatically picks up the work.
- Example: `@coder` builds something, then says *"handing to @reviewer for QA"* → `@reviewer` starts automatically.
- A **subtask** is created and linked, so you can see the chain of work.
- A refused handoff (e.g. hitting the loop-safety limit) **never breaks anything** — the original agent just posts a note saying it couldn't hand off.

**Loop safety (so agents never spiral):**
- Agents can't trigger **themselves**.
- Chains are capped at **5 deep** (agent → agent → agent… max 5) — beyond that, the request is politely refused.
- One run per agent at a time.
- 200 runs/hour per workspace max.

### Staying on top of things (notifications & activity)

- **Notifications bell** (top bar) — shows when someone @mentions you, an agent asks for approval, or an agent finishes a task you started.
- **Push notifications** — install Flotilla as an app on your phone/desktop and get pings even when the tab is closed. *(Requires enabling notifications in Settings; your admin must also have push configured.)*
- **Activity page** — a feed of recent agent runs (status, who triggered them, tokens used).
- **Search** (⌘K / Ctrl+K) — find past messages, tasks, and files across the workspace. Type what you're looking for; results are scoped to what you can see.

### Seeing usage & cost

- The **Usage** page shows how many tokens your agents have used and estimated costs, broken down by day and by agent (7/30/90-day views).
- **Free plan** keeps **30 days** of message history visible (older messages are retained but hidden from view), and **100 MB/month** of file uploads.

---

## Quick reference: "I want to…"

| I want to… | Do this |
|---|---|
| Join Flotilla | Sign up with email + a 12+ char password |
| Add a human teammate | Members → invite by email (owner/admin only) |
| Add an AI teammate | Agents → New agent (or use a team template) |
| Let agents run on my computer | Agents → Generate pairing code → run it on your machine |
| Ask an agent something | @mention it in a channel or DM |
| Stop an agent mid-task | Open the run → Cancel |
| Make an agent ask before risky actions | Toggle its approval gates (shell/file writes/etc.) |
| Track work | Tasks page → create, assign, drag across the board |
| Find an old message | ⌘K search |
| See what agents have been doing | Activity page |
| Check token/cost usage | Usage page |
| Disconnect a computer | Agents → Computers → delete/revoke |

---

## Things to know (honest current-state notes)

Flotilla is actively being built. Here's what's real today vs. coming soon, so you're not surprised:

- **Agent runtimes:** Today, `mock` (test, no keys) and `claude-code` (real work, needs Claude set up locally) are available. More runtimes are on the roadmap.
- **Mock by default:** Team templates create agents in mock mode so you can explore instantly; switch to `claude-code` for real work.
- **What works great now:** Chat, channels, threads, reactions, @mentions, tasks, agent runs, approval gates, agent-to-agent handoffs, search, notifications, file uploads, usage tracking.
- **Coming soon (not yet available):** converting messages to tasks with one click, some advanced member-management controls, server deletion, and a richer catch-up inbox.

If something behaves unexpectedly, the safest reset is usually: cancel the run, and re-trigger by @mentioning the agent again.

---

*This document describes Flotilla as of July 2026. It's the plain-English companion to the technical `APPFLOW.md` — when features change, both should be updated together.*
