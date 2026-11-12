# Changelog

All notable changes to **Ultracode** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-11-12

### Added

- **Core Orchestration Protocol (`skills/ultracode/SKILL.md` & Standing Opt-In Rule)**:
  - Top-level coordinator scope guard (`Standing Opt-In`) paired with subagent anti-recursion isolation (`<subagent_reminder>` single-agent execution without nested `invoke_subagent`).
  - Three foundational control-flow invariants: `Hybrid Scout -> Metis/Momus Pre-Flight -> Anti-Lazy Task-Brief Slicing`, `Streaming Pipeline vs True Barrier`, and `Flat Depth-1 Star Topology Cap`.
  - Context and cache economics separating `TypeName: "self"` scratch-file disk offloading (`<artifactDir>/scratch/`) from `TypeName: "research"` read-only context distillation, `send_message` cache-warm continuation vs `invoke_subagent` bias-free isolation, and append-only wave wisdom notepads (`<wave>-notepad.md`).
  - Native [`agentdash`](https://github.com/cty12356541/agentdash) (`--host agy`) lifecycle alignment: `Workspace: "inherit"` worktree path locking, unique first-80-char `[<Task-ID>]` attribution in `Role` and `Prompt`, `Hook-Safe` word-boundary protection for read-only probes, and `done_at <= last_gate_passed` strict gate folding order.
- **6 Semantic Category Behavioral Payloads (`Category + Skill`)**:
  - `visual-engineering` (design-system invariants, semantic tokens, dual-theme & multi-viewport verification), `ultrabrain` (first-principles call-chain/race analysis & minimal leverage points), `deep` (mandatory silent exploration before multi-file edits), `quick` (exact `FILE:L1-L2` surgical edits), `audit-sweep` (`Multi-Modal Sweep` + `Seen-Set` dedup + `No Silent Caps`), and `writing-spec` (clickable file links, schemas, and executable verification commands).
- **7 Zero-Trust Quality Patterns & 2-Strike Oracle Escalation**:
  - Grounded in the `"Subagents Lie"` Proof-of-Work axiom (`git status/diff`, `zeroForbiddenFilesTouched === true`, deterministic exit codes).
  - Full suite of 7 quality patterns: `Adversarial Verify` (independent Skeptic defaulting to `refuted=true`), `Perspective-Diverse 3 Lenses` (`Completeness & Backlog`, `Boundary & Static Locks`, `Spec & Runtime`), `Judge Panel & Grafting`, `Loop-Until-Dry with Seen-Set Dedup`, `Multi-Modal Sweep`, `Completeness Critic`, and `No Silent Caps`.
  - Bounded `fix-round` loop (`max_rounds = 3`) with mandatory `2-Strike Oracle` root-cause architectural escalation after 2 consecutive unresolved rounds.
- **14 Subagent Prompt Templates (`skills/ultracode/references/prompt-templates.md`)**:
  - End-to-end reusable templates spanning Phase 0 (`Metis & Momus` Pre-Flight Critic), Phase 1 (`Deep Scout`), Phase 1.5 (`Proposal Architect` + `Synthesis Judge`), Phase 2A/2B/2C (`Lane Implementer`, `Disjoint Sub-Track Implementer`, `Map-Reduce Chunk Worker`), Phase 3 (`RevA` / `RevB` / `RevC` Orthogonal Reviewers), Phase 4 (`Adversarial Skeptic Verifier`), Phase 4.5 (`Root-Cause Architecture Oracle`), and Phase 5 (`Final Completeness Critic` + `Refinery Merge Guard & Signoff`).
- **9 Structured Output JSON Schemas & 7 Battle-Tested Playbooks (`skills/ultracode/references/quality-patterns-and-playbooks.md`)**:
  - 9 machine-checkable schemas: `PREFLIGHT_CRITIC_SCHEMA`, `SCOUT_SCHEMA`, `PROPOSAL_SCHEMA`, `FINAL_SPEC_SCHEMA`, `REVIEW_SCHEMA`, `VERDICT_SCHEMA`, `ORACLE_DIAGNOSIS_SCHEMA`, `CHUNK_RESULT_SCHEMA`, and `REFINERY_SIGNOFF_SCHEMA`.
  - 7 engineering playbooks: `Loop-Until-Dry Sweep`, `Disjoint Sub-Track Parallel Implement`, `Audit Worktree Split`, `Merge Guard + Refinery Queue + Final Signoff`, `Append-Only Scratch Wave Notepads`, `Work-List Map-Reduce`, and `2-Strike Oracle + Multi-Viewport Gate + Strict Ledger Closing`.
- **Dual-Stack Idempotent Installers (`install.ps1` & `install.sh`) & Antigravity Plugin Packaging (`plugin.json`)**:
  - Four installation modes across Windows PowerShell and POSIX Bash: global plugin + `<!-- ultracode:begin v2 -->` standing rule (preserving `agentdash` and custom sections while deduplicating legacy standalone `config/skills/ultracode`), standalone skill mode (`-SkillOnly` / `--skill-only` with optional `-NoGlobalRule` / `--no-global-rule`), per-repository workspace installation (`-Target <path>` / `./install.sh <path>`), and surgical uninstall (`-Uninstall` / `--uninstall`).
- **Deterministic Sandbox Verification Suite (`tests/verify-suite.mjs`) & Bilingual Open-Source Documentation**:
  - Zero-dependency Node.js verification harness testing manifest/skill integrity, zero-leak sanitization, and isolated temp-HOME installer/uninstaller idempotency across `README.md` (Simplified Chinese) and `README.en.md` (English).

[2.0.0]: https://github.com/cty12356541/ultracode/releases/tag/v2.0.0
