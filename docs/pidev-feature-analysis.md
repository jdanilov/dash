# pi.dev Feature Analysis for Dash

A comparison of pi.dev's coding agent features against Dash's current capabilities, filtered for relevance. Each feature includes a description, how it applies to Dash, and a high-level implementation approach.

---

## 1. Custom System Prompts (SYSTEM.md)

**What pi.dev offers:** Users can replace or append to the default system prompt on a per-project basis via a `SYSTEM.md` file. This gives fine-grained control over how the coding agent behaves for each project — enforcing coding standards, preferred libraries, architectural patterns, or domain-specific instructions.

**Dash today:** No system prompt customization. Claude Code is spawned with fixed CLI arguments (`-c -r` for resume, `--dangerously-skip-permissions` for auto-approve). The only project-level config Dash writes is `.claude/settings.local.json` containing hook definitions. Any prompt customization is delegated entirely to the user managing their own `CLAUDE.md` files outside of Dash.

**How it could work in Dash:**
- Add a `systemPrompt` text field to the `projects` table (or a separate `project_settings` table).
- Expose a "System Prompt" textarea in the Project Settings UI (accessible from the sidebar or settings modal).
- When spawning Claude Code via `ptyManager.ts`, write the system prompt content to a `CLAUDE.md` file in the task's working directory before launch, or pass it through an environment variable / CLI flag if Claude Code supports one.
- Support both project-level defaults and per-task overrides.

---

## 2. Project Instructions (AGENTS.md / Hierarchical Config)

**What pi.dev offers:** Project instructions load from a hierarchy — `~/.pi/agent/`, parent directories, and the current directory. This creates layered instruction sets: global defaults, org-level standards, and project-specific rules, all merged automatically.

**Dash today:** No hierarchical instruction system. Dash is aware of the project directory and git remote but does not manage or surface any instruction files. Users must manually create and maintain `CLAUDE.md` files.

**How it could work in Dash:**
- Detect and display existing `CLAUDE.md` files in the project tree (show an indicator in the sidebar if one exists).
- Provide a UI to view and edit the project's `CLAUDE.md` directly within Dash (a simple editor panel or modal).
- Support a global instructions file at the Dash app data directory (`~/Library/Application Support/Dash/global-instructions.md`) that gets prepended to every project's context.
- Show a "Context" tab in settings that previews the merged instruction stack (global + project) so users understand what Claude Code will see.

---

## 3. Model Selection and Switching

**What pi.dev offers:** Support for 15+ providers (Anthropic, OpenAI, Google, Azure, Bedrock, Mistral, Groq, etc.) with mid-session model switching via `/model` command, `Ctrl+P` to cycle favorites, and custom provider configuration through `models.json`.

**Dash today:** No model selection at all. The model is determined entirely by Claude Code's own configuration. Dash passes `ANTHROPIC_API_KEY` through but provides no UI for choosing or switching models.

**How it could work in Dash:**
- Add a model selector dropdown in task creation and/or the task header bar.
- Pass the selected model via the `ANTHROPIC_MODEL` environment variable (or equivalent Claude Code CLI flag) when spawning the PTY.
- Store the preferred model per-project (with per-task override capability) in the database.
- Show the active model name in the task's status area so users always know which model is running.
- Start with Anthropic models only (Claude Sonnet, Opus, Haiku) since Dash is purpose-built for Claude Code.

---

## 4. Session Branching and Tree-Structured History

**What pi.dev offers:** Sessions are stored as trees. Users can navigate to any previous conversation point via `/tree` and continue from there, creating branches. All branches live in a single file. This enables non-linear exploration — trying different approaches and comparing results.

**Dash today:** The database schema has a `conversations` table with `isMain` and `displayOrder` fields suggesting multi-conversation support was planned, but no UI exists for branching or navigating conversation history. Terminal state is persisted via snapshots but only for recovery, not exploration.

**How it could work in Dash:**
- Leverage the existing `conversations` table to store branch points (add a `parentConversationId` and `branchPointMessage` field).
- Add a "Conversation History" panel or tree visualization accessible from the task view.
- When a user wants to branch, snapshot the current session state and create a new conversation record linked to the branch point.
- Use Claude Code's `--resume` capability combined with conversation ID tracking to restore any branch.
- Show a compact tree view in the sidebar under each task, allowing one-click navigation between branches.

---

## 5. Session Export and Sharing

**What pi.dev offers:** Export sessions to HTML via `/export` or upload as a GitHub Gist via `/share` for sharing with teammates. The rendered output preserves the conversation structure.

**Dash today:** No export or sharing capability. Conversation content lives in Claude Code's own session store — Dash's database only tracks metadata (title, active status, ordering).

**How it could work in Dash:**
- Add an "Export" button to the task header or context menu.
- Capture terminal output history (already partially available through terminal snapshots and xterm serialization) and render it as clean HTML or Markdown.
- Support "Copy as Markdown" for quick sharing in PRs, Slack, or docs.
- Optionally integrate with GitHub Gist API (Dash already passes `GH_TOKEN`) for one-click sharing.
- Store a link to the shared gist in the conversation record for later reference.

---

## 6. Context Compaction and Auto-Summarization

**What pi.dev offers:** Automatic message compaction when approaching context limits, with customizable summarization strategies (topic-based, code-aware summaries, or alternative models). Extensions can implement custom compaction logic.

**Dash today:** No context management. Dash delegates the entire conversation lifecycle to Claude Code, which has its own context management. Dash has no visibility into context window usage.

**How it could work in Dash:**
- Display a context usage indicator in the task view (approximate token count or percentage) by monitoring Claude Code's output for context-related signals.
- This is lower priority since Claude Code handles its own context, but surfacing the information would help users understand when sessions are getting long.
- If Dash ever manages conversations directly (rather than through Claude Code's PTY), implement configurable compaction strategies.

---

## 7. Prompt Templates

**What pi.dev offers:** Reusable prompts stored as Markdown files, expanded by typing `/name`. This streamlines repetitive workflows like code reviews, refactoring patterns, or test generation.

**Dash today:** No template system. Users type everything from scratch or rely on terminal history.

**How it could work in Dash:**
- Add a `prompt_templates` table (id, name, content, projectId nullable for global vs. project-specific).
- Create a "Templates" section in settings where users can create, edit, and organize templates.
- Add a template picker (dropdown or `/` command palette) near the terminal input that inserts the template text into the PTY.
- Ship a few built-in templates (e.g., "Code Review", "Refactor", "Add Tests", "Explain Code") as starting points.
- Support template variables (e.g., `{{file}}`, `{{branch}}`) that auto-populate from the current task context.

---

## 8. Extension / Plugin System

**What pi.dev offers:** TypeScript extension modules with access to tools, commands, keyboard shortcuts, events, and the full TUI. 50+ example extensions. Enables community-built features like sub-agents, plan mode, permission gates, path protection, SSH execution, and sandboxing.

**Dash today:** No extension system. All functionality is built into the app. The hook server (`HookServer.ts`) provides a narrow integration point (Stop and UserPromptSubmit events) but is not user-extensible.

**How it could work in Dash:**
- This is a large undertaking. A pragmatic first step would be a **hook/event system** rather than a full plugin framework:
  - Define lifecycle events: `task:created`, `task:completed`, `session:started`, `session:idle`, `git:committed`, etc.
  - Allow users to configure shell commands or scripts that run on these events (similar to git hooks).
  - Store hook configurations per-project in the database.
- A second phase could introduce a proper extension API:
  - Extensions as npm packages loaded at startup.
  - API surface: register commands, add UI panels, listen to events, modify PTY environment.
  - Extension settings page in the UI.
- Start small — even project-level shell hooks would cover many use cases (auto-running tests, notifying external systems, triggering CI).

---

## 9. Message Queuing and Steering

**What pi.dev offers:** Two submission modes while the agent works: `Enter` sends a steering message that interrupts after the current tool completes; `Alt+Enter` queues a follow-up that waits for the agent to finish. This enables real-time course correction vs. batched instructions.

**Dash today:** Direct PTY communication — any input goes straight to the terminal. There's no distinction between steering and queuing. Users can type while Claude Code is working, but there's no managed queue or interrupt semantics beyond what the terminal provides natively.

**How it could work in Dash:**
- Implement a **message queue overlay** that appears when Claude Code is busy (detected via the existing activity monitoring system).
- Show two input modes: "Send Now (interrupt)" and "Queue for Later."
- Queued messages are stored in memory and automatically sent when the activity monitor detects the session transitions to idle.
- Visual indicator showing queued message count.
- This builds on the existing `HookServer.ts` activity detection (Stop hook = idle, UserPromptSubmit hook = busy).

---

## 10. Package / Marketplace System

**What pi.dev offers:** Installable bundles combining extensions, skills, prompts, and themes. Distributed via npm or git with version pinning, `pi install`, `pi update`, and `pi list` commands.

**Dash today:** No package system. All functionality is built-in.

**How it could work in Dash:**
- This depends heavily on whether an extension system (Feature #8) is built first.
- A lighter-weight alternative: a **community template gallery** — curated prompt templates and project configurations that users can browse and import.
- Store importable configurations as JSON/Markdown files in a public GitHub repo.
- Add an "Import from Gallery" option in the Templates or Settings UI.
- This provides community value without the complexity of a full package manager.

---

## 11. Multi-Provider API Key Management

**What pi.dev offers:** Support for multiple authentication methods (API keys and OAuth) across 15+ providers. Stored credentials with easy switching.

**Dash today:** Passes through `ANTHROPIC_API_KEY` from the environment. No UI for managing API keys, and no support for multiple providers.

**How it could work in Dash:**
- Add an "API Keys" section in Settings with secure storage (Electron's `safeStorage` API for encryption).
- Support at minimum: Anthropic API key, and optionally AWS Bedrock credentials, Google Vertex credentials (for Claude via other providers).
- Auto-detect keys from environment variables on first launch and offer to save them.
- Show key status (valid/invalid/missing) in settings.
- Pass the appropriate credentials as environment variables when spawning Claude Code.

---

## 12. Customizable Themes Beyond Light/Dark

**What pi.dev offers:** Themes are distributable as part of packages, suggesting support for custom color schemes, fonts, and terminal styling beyond a simple light/dark toggle.

**Dash today:** Two themes (light and dark) with hardcoded color values. Terminal theme syncs with the app theme. Tailwind CSS classes used throughout.

**How it could work in Dash:**
- Define theme as a set of CSS custom properties (already partially in place via Tailwind's dark mode classes).
- Add 2-3 additional built-in themes (e.g., Solarized, Monokai, Nord).
- Allow custom terminal color schemes independent of the app theme.
- Store theme selection in settings, apply via CSS custom property overrides on the document root.

---

## 13. Bookmarks and Message Labeling

**What pi.dev offers:** Users can bookmark and label important moments in a conversation for easy reference later. Combined with the tree-structured history, this makes long sessions navigable.

**Dash today:** No bookmarking. Terminal output scrolls linearly with no way to mark or return to important points.

**How it could work in Dash:**
- Add a "Bookmark" action (keyboard shortcut or button) that captures the current terminal scroll position and a user-provided label.
- Store bookmarks in the database linked to the task/conversation.
- Show a bookmark list in the task view sidebar that jumps to the saved scroll position.
- Optionally capture a text snippet from the terminal at the bookmark point for preview.

---

## Priority Ranking for Dash

Based on impact, user demand, and implementation feasibility:

| Priority | Feature | Rationale |
|----------|---------|-----------|
| **P0** | Custom System Prompts | Highest impact, moderate effort. Direct control over agent behavior per project. |
| **P0** | Model Selection | High demand, low-moderate effort. Basic dropdown + env var. |
| **P1** | Project Instructions UI | Medium effort. Makes existing CLAUDE.md discoverable and editable. |
| **P1** | Prompt Templates | Medium effort, high daily utility. Reduces repetitive typing. |
| **P1** | Message Queuing/Steering | Medium effort. Leverages existing activity monitoring. |
| **P1** | Session Export | Medium effort. Enables knowledge sharing. |
| **P2** | API Key Management | Low-medium effort. Better onboarding experience. |
| **P2** | Session Branching | Higher effort. Requires conversation state management. |
| **P2** | Bookmarks | Low effort, useful for long sessions. |
| **P3** | Hook/Event System | High effort, enables extensibility. |
| **P3** | Additional Themes | Low effort, nice-to-have. |
| **P3** | Context Usage Display | Low effort, informational. |
| **P4** | Extension System | Very high effort. Only justified with significant user base. |
| **P4** | Package Marketplace | Depends on extension system. Long-term vision. |
