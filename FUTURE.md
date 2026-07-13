# FUTURE.md

> **Purpose:**
> This document captures the long-term evolution of Flotilla beyond the initial MVP and private beta.
>
> Nothing in this file is required to ship the first version of the product.
>
> These ideas exist to ensure that every architectural decision made today leaves room for tomorrow.
>
> **Rule:** Never compromise the MVP by implementing ideas from this document too early.

---

# Long-Term Vision

Flotilla should eventually become far more than a chat application with AI.

The long-term goal is to build an **operating system for AI teammates** where humans, AI agents, knowledge, tools, workflows, and computers work together inside one persistent workspace.

Chat is only one interface.

Tasks are only one interface.

Documents are only one interface.

Every piece of information should eventually become understandable by AI agents.

Every action should become automatable.

Every workspace should continuously become smarter over time.

---

# Design Principles

Future features should satisfy at least one of these principles.

* Make agents more autonomous.
* Reduce human repetitive work.
* Increase long-term workspace intelligence.
* Improve collaboration between humans and AI.
* Improve observability.
* Preserve user privacy.
* Remain modular.
* Never increase complexity without increasing capability.

---

# 1. Knowledge Engine

**Status:** Future

Currently Flotilla understands:

* Messages
* Tasks
* Files

Eventually it should understand **knowledge**.

Knowledge should become a first-class object instead of hidden inside conversations.

Example architecture

```
Workspace
│
├── Knowledge Bases
├── Documents
├── Wikis
├── Notes
├── PDFs
├── Code
├── Images
└── Structured Data
```

Every item should support

* semantic search
* embeddings
* metadata
* relationships
* version history
* AI summaries
* citations

Eventually every agent should receive context from the Knowledge Engine instead of relying only on recent chat history.

---

# 2. Workspace Intelligence

**Status:** Future

Today the workspace stores information.

Eventually the workspace should understand itself.

Examples

* Who owns authentication?
* Which documents are outdated?
* Which engineer understands React?
* Which agent has completed the most reviews?
* Which project is blocked?
* What changed this week?
* Which tasks are related?

The workspace becomes a living knowledge graph instead of disconnected data.

---

# 3. Knowledge Graph

**Status:** Future

Everything inside the workspace should eventually be connected.

Example

```
Workspace

Project
    │
    ├── Tasks
    ├── Documents
    ├── Agents
    ├── Humans
    ├── Files
    ├── Runs
    ├── Meetings
    └── Decisions
```

Instead of searching only by text, agents should traverse relationships.

Examples

> Show every task related to OAuth.

> Find every document modified after the database migration.

> Which agents worked on this feature?

---

# 4. Advanced Agent Memory

**Status:** Future

`MEMORY.md` is intentionally simple for MVP.

Eventually memory should become layered.

```
Identity

Goals

Skills

Preferences

Working Memory

Project Memory

Workspace Memory

Long-term Memory

Reflection Memory

Mistakes Learned

Relationships
```

Agents should become more consistent over months instead of only across conversations.

---

# 5. Capability-Based Scheduling

**Status:** Future

Today computers are online or offline.

Eventually computers should advertise capabilities.

Examples

```
CPU

GPU

RAM

Docker

Python

Node

Rust

Go

ADB

Android

iOS

Browser

SSH

Camera

Microphone

Multiple Displays
```

Run scheduling should become capability-aware.

Example

Image generation → GPU workstation

Mobile testing → Android computer

Docker build → Linux server

Large compilation → 64-core workstation

---

# 6. Multi-Model Execution

**Status:** Future

One run should eventually use multiple AI models.

Example

Planner

↓

Research Model

↓

Coding Model

↓

Vision Model

↓

Reviewer Model

↓

Summarizer

Instead of one LLM doing everything, every model specializes.

The runtime adapter already makes this evolution possible.

---

# 7. Workflow Engine

**Status:** Future

Beyond scheduled tasks.

Visual or declarative workflows.

Examples

```
GitHub Issue

↓

Create Task

↓

Assign Coding Agent

↓

Run Tests

↓

Request Review

↓

Merge

↓

Deploy

↓

Notify Slack
```

Every workflow should remain human-overridable.

---

# 8. Agent Marketplace

**Status:** Future

Install pre-built AI teammates.

Examples

* Backend Engineer
* Frontend Engineer
* QA Engineer
* DevOps Engineer
* Security Reviewer
* Product Manager
* Research Assistant
* Technical Writer
* Marketing Assistant
* Sales Assistant

Eventually third-party developers should publish reusable agents.

Think "npm for AI teammates."

---

# 9. Plugin & Integration SDK

**Status:** Future

Allow external systems to become first-class workspace citizens.

Potential integrations

* GitHub
* GitLab
* Jira
* Linear
* Slack
* Discord
* Google Drive
* Notion
* Confluence
* Figma
* Docker
* Railway
* Vercel
* AWS
* Kubernetes

Plugins should expose

* tools
* events
* resources
* authentication
* permissions

---

# 10. Artifact-Centric Collaboration

**Status:** Future

Today conversations are central.

Eventually artifacts should become equal citizens.

Examples

Code

Designs

Documents

PRs

Spreadsheets

Videos

Datasets

Models

Each artifact should have

* discussion
* versions
* approvals
* AI review
* history
* ownership

Conversation becomes one view of the artifact instead of the artifact living inside the conversation.

---

# 11. Workspace Analytics

**Status:** Future

Beyond token usage.

Examples

* Agent productivity
* Completion rate
* Task cycle time
* Human approval frequency
* Tool usage
* Error rate
* Cost trends
* Success ratio
* Workspace health
* Collaboration graph

The goal is understanding how work happens, not monitoring people.

---

# 12. Autonomous Organizations

**Status:** Long-Term Research

Eventually organizations should consist of

Humans

*

Persistent AI teammates

working continuously.

Agents should

* schedule work
* perform work
* review work
* request approvals
* learn from outcomes
* improve over time

Humans remain responsible for strategy and final decisions.

---

# Guiding Philosophy

As Flotilla evolves, the center of gravity should shift.

```
Today

Chat
 ↓
Tasks
 ↓
Agents


Tomorrow

Knowledge
 ↓
Workflows
 ↓
Agents
 ↓
Artifacts
 ↓
Conversation
```

Conversation should eventually become one interface among many, not the foundation of the entire platform.

---

# Things We Intentionally Avoid

The following are intentionally excluded unless a strong user need emerges.

* Building a traditional project management tool.
* Building another Slack clone.
* Building another IDE.
* Building another document editor.
* Building another cloud provider.
* Building proprietary AI models.
* Locking users into one AI vendor.

Flotilla should orchestrate work, not replace every existing tool.

---

# Future Decision Rule

Before implementing any major feature, ask:

1. Does this make AI teammates more capable?
2. Does this improve collaboration between humans and AI?
3. Does this increase long-term workspace intelligence?
4. Does this preserve user privacy?
5. Does this simplify workflows instead of adding complexity?

If the answer to most of these questions is **no**, the feature probably belongs outside the core product.

---

# Final Goal

The long-term ambition is not to build a better chat application.

The ambition is to build the operating system where humans and persistent AI teammates collaborate naturally over months and years.

Everything in Flotilla should move the product toward that future, one iteration at a time.
