# Git-Based Collaboration for Flotilla Teams

> **A hybrid collaboration approach that combines Flotilla's agent orchestration with Git's proven code collaboration workflows**

## Overview

This document describes a three-layer collaboration system that solves the team file-sharing challenge while maintaining Flotilla's privacy-first architecture. Instead of forcing Flotilla to handle file sharing, we use each tool for what it's best at:

- **Flotilla**: Agent coordination, task management, team communication
- **Git**: Code collaboration, version control, file sharing  
- **Claude Code**: Actual coding work with human oversight

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Flotilla Workspace                            │
│              (Coordination & Communication Layer)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │   Agents    │  │    Tasks    │  │    Chat     │            │
│  │  @coder     │  │  Assignment │  │  Handoff    │            │
│  │  @qa        │  │  Tracking   │  │  Updates    │            │
│  │  @reviewer  │  │  Status     │  │  Notify     │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                            ↕
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌─────────────────────┐               ┌─────────────────────┐
│   Computer A         │               │   Computer B         │
│ + @coder agent      │               │ + @qa agent          │
│ + Human A            │               │ + Human B            │
│ + Claude Code UI     │               │ + Claude Code UI     │
│ + Local Workspace    │               │ + Local Workspace    │
└─────────────────────┘               └─────────────────────┘
        ↕                                       ↕
┌─────────────────────┐               ┌─────────────────────┐
│   GitHub Repository │◄───────────────│   GitHub Repository │
│                     │   Git Push/Pull│                     │
│  Branch Management  │               │  Branch Management  │
│  Code Collaboration │               │  Code Collaboration │
│  Version Control   │               │  Version Control   │
└─────────────────────┘               └─────────────────────┘
```

## Detailed Workflow

### 1. Setup Phase

#### Workspace Manager Setup:
1. **Create Flotilla workspace** with team members
2. **Pair computers to agents:**
   - Computer A (Human A's machine) → @coder agent
   - Computer B (Human B's machine) → @qa agent  
   - Computer C (Human C's machine) → @reviewer agent
3. **Configure GitHub integration:**
   - Add GitHub repository URL to workspace settings
   - Provide GitHub tokens for agents
   - Set default branch strategy

#### Agent Configuration:
```javascript
// Enhanced agent configuration with Git support
{
  name: 'Coder',
  handle: 'coder',
  systemPrompt: 'You are @coder working on GitHub repo...',
  computerId: 'computer-a-id',
  githubToken: 'ghp_encrypted_token',
  defaultRepo: 'https://github.com/org/project.git',
  defaultBranch: 'main',
  collaborationMode: 'human-supervised',
  gitWorkflow: 'feature-branch'
}
```

### 2. Work Execution Phase

#### Task Creation with Git Context:
```javascript
// Enhanced task structure
{
  title: 'Create todo application',
  description: 'Build a simple todo app with HTML, CSS, and JavaScript',
  githubRepo: 'https://github.com/org/project.git',
  baseBranch: 'main',
  featureBranch: 'feature/todo-app',
  assignedTo: '@coder',
  teamMembers: ['@coder', 'Human A', '@qa', 'Human B', '@reviewer'],
  gitWorkflow: {
    strategy: 'feature-branch',
    requireHumanApproval: true,
    autoMerge: false
  }
}
```

#### @coder + Human A Workflow:
1. **@coder receives task** in Flotilla with GitHub context
2. **Human A opens terminal** on Computer A where daemon is running
3. **Claude Code interface visible** to Human A
4. **Collaborative coding:**
   - @coder suggests code changes
   - Human A can accept/reject edits in Claude Code
   - Human A can guide @coder using plan mode
   - Human A can toggle auto/manual modes as needed
5. **Local testing** in `~/.flotilla/agents/coder/workspace/`
6. **Git operations:**
   - Human A commits with @coder's guidance
   - Push to feature branch: `feature/coder-todo-app`
7. **Flotilla chat update:**
   ```
   @coder: "✅ Complete - pushed todo app to feature/coder-todo-app"
   @coder: "📋 Created PR #123 for review"
   ```

#### @qa + Human B Workflow:
1. **@qa triggered** by @coder's completion message
2. **Pull latest changes** from GitHub
3. **Test execution** in local workspace
4. **Create test files** or update existing ones
5. **Push test results** to same feature branch
6. **Flotilla chat update:**
   ```
   @qa: "📥 Pulled feature/coder-todo-app, all tests passing"
   @qa: "✅ Test results pushed to feature/coder-todo-app"
   ```

#### @reviewer + Human C Workflow:
1. **Review triggered** by @qa's test completion
2. **Pull feature branch** for review
3. **Code review** in Claude Code interface
4. **Approve or request changes**
5. **Merge to main** if approved
6. **Flotilla chat update:**
   ```
   @reviewer: "👀 Reviewed feature/coder-todo-app"
   @reviewer: "✅ Approved and merged to main"
   @reviewer: "🚀 Deployed to production"
   ```

### 3. Communication & Coordination

#### Standardized Git Messages:
```
// Work started
@coder: "🔄 Starting work on todo app - pulled latest from main"

// Code complete
@coder: "✅ Implementation complete - pushed to feature/coder-todo-app"

// Testing phase  
@qa: "📥 Pulled feature/coder-todo-app for testing"
@qa: "✅ All tests passing - ready for review"

// Review phase
@reviewer: "👀 Reviewing feature/coder-todo-app"
@reviewer: "✅ Code approved - merging to main"

// Completion
@coder: "🎉 Todo app complete and deployed - main branch updated"
```

#### Flotilla Task Status Updates:
```javascript
// Task status synced with Git state
{
  taskId: 'task-123',
  status: 'in_progress',
  gitStatus: {
    branch: 'feature/coder-todo-app',
    commits: 3,
    pullRequest: 'PR-123',
    lastUpdate: '2024-01-15T14:30:00Z'
  }
}
```

## Implementation Phases

### Phase 1: Basic Git Integration

#### Database Schema Updates:
```prisma
// Add to existing Agent model
model Agent {
  // ... existing fields
  githubTokenEncrypted String?  @map("github_token_encrypted")
  defaultRepoUrl String?        @map("default_repo_url")
  defaultBranch String?         @default("main") @map("default_branch")
  gitWorkflow String?           @map("git_workflow")
}

// Add to Task model
model Task {
  // ... existing fields
  githubRepo String?            @map("github_repo")
  baseBranch String?             @map("base_branch")
  featureBranch String?          @map("feature_branch")
  pullRequestUrl String?         @map("pull_request_url")
  gitStatus Json?                @map("git_status")
}

// New model for tracking git operations
model GitOperation {
  id          String   @id @default(uuid()) @db.Uuid
  agentId     String   @map("agent_id") @db.Uuid
  agent       Agent    @relation(fields: [agentId], references: [id])
  taskId      String?  @map("task_id") @db.Uuid
  operation   String   // clone, pull, push, commit, branch, pr
  status      String   // pending, success, failed
  branch      String?
  commitHash  String?  @map("commit_hash")
  error       String?
  createdAt   DateTime @default(now()) @map("created_at")
  completedAt DateTime? @map("completed_at")
}
```

#### API Endpoints:
```javascript
// GitHub integration endpoints
POST   /api/v1/agents/:agentId/github-config
GET    /api/v1/tasks/:taskId/git-status
POST   /api/v1/tasks/:taskId/git-operation
GET    /api/v1/workspaces/:id/github-repos
```

#### Enhanced Agent Prompts:
```javascript
// Base agent prompt template for Git workflow
const GIT_AGENT_PROMPT = `You are {agentName} working on a GitHub project.

Repository: {repoUrl}
Base Branch: {baseBranch}
Feature Branch: {featureBranch}

Your Workflow:
1. Always pull latest changes before starting work
2. Complete your assigned task with human assistance
3. Test your changes locally in your workspace directory
4. Commit changes with clear, descriptive messages
5. Push to your feature branch
6. Post status updates in Flotilla chat

Collaboration:
- Work transparently with your human partner in Claude Code
- Accept guidance and corrections from your human
- Ask for help when needed using plan mode
- Never push broken code - test locally first

Communication:
- Always post clear status updates in chat
- Use emoji indicators for quick scanning (🔄 ✅ ❌ 📋 👀)
- Mention next agents in workflow when your work is complete

Privacy & Security:
- Never expose sensitive data in commits or messages
- Use feature branches, never commit directly to main
- Follow Git best practices and conventions`;
```

### Phase 2: Enhanced Claude Code Integration

#### Transparency Modes:
```javascript
// Agent collaboration modes
const COLLABORATION_MODES = {
  AUTONOMOUS: 'autonomous',        // Agent works alone
  SUPERVISED: 'supervised',        // Human can observe and intervene
  INTERACTIVE: 'interactive',      // Human and agent work together
  MANUAL: 'manual'                 // Human-led with agent assistance
};

// In Agent model
{
  collaborationMode: 'supervised',
  autoApproveEdits: false,
  requireHumanApproval: ['git_push', 'git_commit', 'file_delete'],
  transparencyLevel: 'high'
}
```

#### Claude Code Interface Enhancements:
```bash
# Human can see agent's Claude Code session
cd ~/.flotilla/agents/coder/
ls -la

# Files to monitor:
- .claude/session.json    # Current session state
- workspace/              # Working files
- MEMORY.md              # Agent memory
- claude-code.log        # Claude Code output
```

### Phase 3: Flotilla-Git Bridge

#### Git Status Dashboard:
```javascript
// Enhanced agent cards with Git status
{
  agentId: 'coder-123',
  name: 'Coder',
  handle: 'coder',
  gitStatus: {
    currentBranch: 'feature/coder-todo-app',
    commitsAhead: 3,
    commitsBehind: 1,
    lastCommit: 'feat: add CSS styling',
    lastCommitTime: '2024-01-15T14:30:00Z',
    pullRequest: {
      number: 123,
      state: 'open',
      url: 'https://github.com/org/project/pull/123'
    }
  }
}
```

#### Automated Git Notifications:
```javascript
// Socket.IO events for Git operations
const GIT_SOCKET_EVENTS = {
  BRANCH_CREATED: 'git.branch.created',
  COMMIT_PUSHED: 'git.commit.pushed',
  PULL_REQUEST_OPENED: 'git.pr.opened',
  PULL_REQUEST_MERGED: 'git.pr.merged',
  CONFLICT_DETECTED: 'git.conflict.detected'
};
```

### Phase 4: Smart Handoff Protocol

#### Automated Triggers:
```javascript
// Git-based handoff triggers
const HANDOFF_TRIGGERS = {
  PR_CREATED: 'pr_created',
  PR_APPROVED: 'pr_approved',
  BRANCH_UPDATED: 'branch_updated',
  TESTS_PASSED: 'tests_passed',
  REVIEW_COMPLETE: 'review_complete'
};

// Handoff logic
if (gitEvent === 'pr_opened' && agent === '@coder') {
  triggerAgent('@qa', {
    context: `Review PR #${prNumber} for ${featureBranch}`,
    branch: featureBranch,
    prUrl: `https://github.com/org/project/pull/${prNumber}`
  });
}
```

## Best Practices

### Git Workflow Guidelines:

1. **Branch Naming:**
   - Use agent handles: `feature/coder-task-name`
   - Use task IDs: `feature/task-123-todo-app`
   - Keep branches short-lived

2. **Commit Messages:**
   - Follow conventional commits: `feat:`, `fix:`, `docs:`, `test:`
   - Include task references: `[task-123] Add todo app`
   - Agent attribution: `Co-Authored-By: @coder`

3. **Pull Request Standards:**
   - Always use PRs (no direct main branch commits)
   - Include task context in PR description
   - Mention responsible agents in PR body
   - Use PR templates for consistency

4. **Conflict Resolution:**
   - Humans handle merge conflicts in Claude Code
   - Agents pause and request human assistance
   - Document conflict resolution in commits

### Team Collaboration:

1. **Role Clarification:**
   - **@coder**: Implementation, feature development
   - **@qa**: Testing, quality assurance, bug finding
   - **@reviewer**: Code review, security audit, approval
   - **Humans**: Oversight, guidance, conflict resolution

2. **Communication Standards:**
   - Use consistent emoji indicators
   - Post status updates at key milestones
   - Tag relevant agents in handoffs
   - Keep updates concise and actionable

3. **Code Quality:**
   - All code tested before push
   - Code review required for main branch
   - Security review for sensitive changes
   - Documentation updates with features

## Security Considerations

### GitHub Token Management:
```javascript
// Encrypt GitHub tokens at rest
const encryptedToken = encrypt(githubToken, workspaceKey);

// Use environment variables for daemon
GITHUB_TOKEN_encrypted="sha256encryptedvalue"

// Token scopes (principle of least privilege)
- repo: read/write
- pull_request: read/write  
- contents: read/write
- NO admin or delete permissions
```

### Workspace Security:
```bash
# Agent workspace isolation
~/.flotilla/agents/coder/workspace/     # Coder's files only
~/.flotilla/agents/qa/workspace/       # QA's files only
~/.flotilla/agents/reviewer/workspace/ # Reviewer's files only

# No cross-contamination between agent workspaces
```

### Human Oversight:
```javascript
// Require approval for sensitive operations
const SENSITIVE_GIT_OPS = [
  'git_push_to_main',
  'git_delete_branch',
  'git_force_push',
  'git_modify_history'
];

// Human must approve in Claude Code
if (operation in SENSITIVE_GIT_OPS) {
  await requestHumanApproval();
}
```

## Troubleshooting

### Common Issues:

1. **Agent can't push to GitHub:**
   - Check GitHub token permissions
   - Verify repository access
   - Ensure branch protection rules allow push

2. **Merge conflicts:**
   - Agent should pause and request human help
   - Human resolves in Claude Code interface
   - Document resolution in commit message

3. **Handoff not triggering:**
   - Verify PR was actually created
   - Check agent is online with daemon running
   - Ensure task is properly assigned

4. **Files not visible to team:**
   - Confirm push completed successfully
   - Check correct branch was pushed
   - Verify team member has repo access

### Debug Mode:
```bash
# Enable detailed git logging
export GIT_TRACE=1
export GIT_CURL_VERBOSE=1

# Check agent git operations
cd ~/.flotilla/agents/coder/workspace/
git status
git log --oneline -5

# Monitor daemon-git interaction
tail -f /tmp/flotilla-daemon.log | grep git
```

## Examples

### Complete Workflow Example:

**Task:** Create a user authentication system

**1. Task Creation:**
```json
{
  "title": "Implement user authentication",
  "description": "Add login/signup with JWT tokens",
  "githubRepo": "https://github.com/org/webapp.git",
  "featureBranch": "feature/auth-system",
  "assignedTo": "@coder",
  "priority": 1
}
```

**2. @coder + Human A:**
```
@coder: "🔄 Starting auth system - pulled latest main"
@coder: "📝 Created login form component"
@coder: "🔐 Implemented JWT token generation"  
@coder: "✅ Auth system complete - pushed to feature/auth-system"
@coder: "📋 PR #456 created for review"
```

**3. @qa + Human B:**
```
@qa: "📥 Pulled feature/auth-system for testing"
@qa: "🧪 Running authentication tests..."
@qa: "✅ All tests passing - pushed test results"
@qa: "📋 Ready for @reviewer to review PR #456"
```

**4. @reviewer + Human C:**
```
@reviewer: "👀 Reviewing auth system in PR #456"
@reviewer: "🔒 Security review passed"
@reviewer: "✅ Approved and merged to main"
@reviewer: "🚀 Auth system deployed to production"
```

## Future Enhancements

### Planned Features:

1. **Automatic Branch Management:**
   - Auto-create feature branches from task assignments
   - Auto-delete merged branches
   - Branch naming conventions enforcement

2. **Enhanced Git Analytics:**
   - Commit frequency tracking
   - Code quality metrics over time
   - Agent productivity insights

3. **Advanced Conflict Resolution:**
   - AI-assisted merge conflict resolution
   - Automatic conflict detection and prevention
   - Three-way merge suggestions

4. **Repository Health Monitoring:**
   - Automated code quality checks
   - Security vulnerability scanning
   - Performance impact analysis

5. **Integration with Other Tools:**
   - Jira/Linear task synchronization
   - Slack/Discord notifications
   - CI/CD pipeline integration

## Conclusion

This Git-based collaboration approach provides a robust, scalable solution for team development with Flotilla agents. By leveraging Git's proven collaboration workflows alongside Flotilla's agent orchestration, teams can achieve:

- **Seamless file sharing** through GitHub repositories
- **Natural code review** through pull requests
- **Human oversight** through Claude Code transparency
- **Clear coordination** through Flotilla chat
- **Audit trails** through Git history and chat logs

The hybrid approach respects each tool's strengths while creating a more powerful combined system for collaborative AI-human development teams.