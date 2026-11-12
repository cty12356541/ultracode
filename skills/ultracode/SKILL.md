---
name: ultracode
description: >-
  Execute multi-phase Ultracode v2 orchestration in Antigravity: pre-flight Metis/Momus gap & plan critique, zero-noise Task-Brief slicing, hybrid inline scout, streaming pipeline vs barrier fan-out, flat Depth-1 star topology cap, semantic Category+Skill payloads, scratch wave notepads, disjoint sub-track parallel implementation, zero-trust Proof-of-Work verification, 7 quality patterns (Adversarial Verify, Perspective-Diverse Lenses, Judge Panel, Loop-Until-Dry with seen-set dedup, Multi-Modal Sweep, Completeness Critic, No Silent Caps), 2-strike Oracle root-cause escalation, Refinery merge queue, Final Signoff, and real-browser visual gate.
  Use this skill whenever handling multi-module engineering tasks, wave orchestration, taking over tasks from Claude Code / Codex / OpenCode, or when the user asks for ultracode, 对抗复核, 多智能体编排, or 高规格波次推进.
---

# Ultracode v2 — 多智能体高阶编排、语义路由与零信任对抗验证规程 (Antigravity)

本技能集大成融合全球三大 AI Coding 阵营的核心调度精髓与 Antigravity 原生原语（`invoke_subagent` / `define_subagent` / `send_message` / `manage_subagents` + `agentdash` 台账体系）：
- **Claude Code 生态**：内置 `Coordinator / Workflow`（主控专注合成调度不越界抢改泳道源码、`Pipeline vs Barrier`、七大质量模式）、`Superpowers`（零噪音单任务切片 `Task-Brief`、双阶合规+质量审查）、`Gas Town`（`Beads` DAG 台账与 `Refinery` 专职串行合流队列）、Anthropic 多智能体论文（大体积产物直写磁盘绕过协调器瓶颈）；
- **OpenAI Codex 生态**：`codex-rs` 防 `Context Rot` 上下文蒸馏、结构化批量扇出（`Work-List Map-Reduce`）、Worktree 环境引导与 `Symphony` 确定性 `Proof-of-Work` 物证门禁；
- **OpenCode & Oh My OpenCode (`OMO`) 生态**：规划前置铁三角（`Metis` 查盲区 + `Momus` 挑刺计划）、`Category + Skill` 语义载荷解耦、`Multimodal-Looker / Librarian` 附件与外部文档卸载、跨波次只增不减便签（`Wave Notepads`）、`Atlas` 零信任反撒谎铁律（`"Subagents Lie"`）、连续 2 轮失败 `Oracle` 根因会诊与防早退持续推进闭环。

**核心铁律（Standing Opt-In & 顶层作用域边界）**：
- **仅顶层主控会话触发编排**：一旦进入实质性研发、架构审计、多模块修复或波次推进，顶层主控默认无条件启用 Ultracode v2 编排（仅纯闲聊或单行机械微调允许单兵直改）。
- **子智能体免读防套娃**：被派生的子智能体（含 `<subagent_reminder>`）免读本文件、严禁再次调用 `invoke_subagent`，专注单兵闭环父会话 `Task-Brief` 并通过 `send_message` 回传结果。

* **子智能体标准 Prompt 与语义类别载荷模板库（14 套全场景模板）**：见 [references/prompt-templates.md](./references/prompt-templates.md)
* **七大质量模式速查表、9 大 JSON Schema 契约与七大实战剧本库（剧本 1–7）**：见 [references/quality-patterns-and-playbooks.md](./references/quality-patterns-and-playbooks.md)

---

## 1. 编排拓扑与控制流铁律：Pre-Flight · Pipeline vs Barrier · Depth-1 Cap

### 1.1 混合先遣侦察、前置挑刺与反懒惰切片 (`Hybrid Scout → Pre-Flight → Task-Brief`)
1. **禁止盲目大扇出**：永远先在主控内联执行 1~2 步轻量只读侦察（列目录、`git status -sb`、`git diff --stat`、定位入口文件），摸清**工作项列表（Work-List）与文件边界**后再结构化扇出。多轨并行期间，主控专注台账协调、切片合成与合流门禁，不越界直接修改子泳道独占业务源码。
2. **前置查漏与计划挑刺（`Metis + Momus` Gate，大型波次必做）**：
   - **`Metis` 盲区排查**：起草多轨计划前，主动识别隐含边界假设、多租户/多环境/多语种兼容漏项及过度设计（AI-Slop）；
   - **`Momus` 可执行性静态核验**：通过只读文件检查确保计划引用的每个目标文件真实存在且为运行时真实挂载路径（非死代码），测试脚本与门禁配置真实存在（严禁在只读预检命令行出现门禁触发词）。
3. **反懒惰合成与零噪音任务切片（`Anti-Lazy Synthesis & Task-Brief Slicing`）**：
   - 新派生的子智能体看不见兄弟子智能体的对话记录。**严禁主控下发“根据前面探针的发现去修复”等懒惰指令**！
   - 主控必须将勘测结论消化提炼为针对该执行者的**自包含单任务切片（Task-Brief）**：仅投喂其所需的精确 `file + exactLineRanges`、输入输出契约、必跑单测命令、独占白名单与本仓防雷要点，不让执行者通读全量巨型计划以防 `Context Rot`。

### 1.2 默认流式无屏障 (`Default to Pipeline`) vs 真正同步屏障 (`True Barrier`)
在多阶段编排（如对 $N$ 条泳道或 $N$ 个模块依次执行 `Implement → Review → Verify → Fix`）时，严格区分流式推进与全局屏障：
* **默认使用流式链 (`Streaming Pipeline`)**：
  * 当子项 A 的下一阶段（如 `Review` 或 `Verify`）仅依赖子项 A 自己的产物、不需要参考子项 B/C 的输出时，**严禁等待所有兄弟子项全部完成上一阶段**！哪路子智能体先回报，主控立即对其流式发起下一阶段子智能体调用。总挂钟耗时等于**最慢单链耗时** $\max_i(\sum_s t_{i,s})$，而非各阶段最慢节点之和。
* **何时才设跨项同步屏障 (`True Barrier`)**：
  仅当阶段 $N$ **确实需要阶段 $N-1$ 所有子项的完整合集上下文**时才等待全员到齐：
  1. **跨探针全局去重 (`Cross-Finder Dedup`)**：汇总所有探针发现的候选问题，按 `file + line` 全局去重后再派发高成本对抗核验；
  2. **全局零发现早退 (`Zero-Count Early Exit`)**：全量扫描确认 `0 bugs` 后直接跳过修复与重验阶段；
  3. **跨泳道合流精炼队列 (`Multi-Lane Merge Guard & Refinery`)**：必须同时拿到所有并行 Worktree 的修改文件与行号区间，才能计算交集并规划串行合流顺序；
  4. **多方案竞赛评审团 (`Judge Panel`)**：必须同时对比 $N$ 份独立架构提案，才能择优并嫁接各方案长处。

### 1.3 单层扁平星型封顶 (`Flat Depth-1 Star Topology Cap`)
- **禁止任何子智能体递归调用 `invoke_subagent`**：
  1. 防指数级 Token 爆炸与同一 Worktree 内并发写踩踏；
  2. **兼容 `--host agy` 钩子闭合机制**：`agentdash` 的 `hook.rs` 会将任何发出过 `dispatched` 事件的会话标记为 `is_dispatcher = true`，进而在其 `Stop` 时跳过写入其自身的 `completed` 事件（会导致 `archive --strict` 因 `running subagent(s) unclosed` 失败退 1）。
- **深水区自查与主控代扇出**：实现者（`TypeName: "self"`）自身已拥有完整的只读搜索与读文件工具，局部疑问直接就地只读查清；若发现大范围跨子系统阻塞问题，通过 `send_message` 回报顶层主控，由顶层主控统一扇出兄弟 `research` 探针。

---

## 2. 算力档位、角色定制、语义载荷、上下文经济学与 `--host agy` 铁律

### 2.1 模型档位、`define_subagent` 与 6 大语义类别载荷 (`Category + Skill Payloads`)
1. **算力默认拉满 (`Model: "inherit"`)**：调用 `invoke_subagent` 时默认设置 `Model: "inherit"`（继承主控最高档推理模型），严禁在复杂设计、核心实现或终审裁定阶段降档（仅在超大规模纯机械格式枚举时可按需评估 `flash`）。
2. **`define_subagent` 会话级专职角色注册**：当同一长会话内需反复派生超过 3 次相同职责、相同工具边界的专职子智能体（如定制只读审计员或专项分片转换工）时，主控可先调用 `define_subagent`（显式设置 `EnableSubagentTools: false`，只读角色设 `EnableWriteTools: false`）注册会话级角色类型再复用。
3. **6 大语义类别载荷注入**：派发子智能体时，按任务认知画像在 Prompt 中注入对应的标准行为载荷（详见 [references/prompt-templates.md](./references/prompt-templates.md)）：
   - **`visual-engineering`**（前端 UI/UX、组件样式、动效、响应式看板）：预检设计语言不变量与色彩令牌规范（如 `docs/DESIGN-INVARIANTS.md`、`docs/COLOR-TOKENS.md` 零硬编码裸色、语义 CSS 变量 `--ui-*` / `--ds-*`、冻结透明度阶梯、KPI/表格数字强制 `tabular-nums` 等宽对齐）+ 真机多视口与浅深双主题实证；
   - **`ultrabrain`**（核心架构、并发/流式 SSE 幂等防重竞态、64 位雪花 ID 字符串精度保护、复杂 SQL 口径）：强制追踪完整调用链与数据流，优先选择最小侵入杠杆点，编写极端边界反例单测；
   - **`deep`**（跨文件自主重构、深水区故障排障）：强制执行 **静默深读期（`Silent Exploration`）**——动笔前先完整追踪 caller/callee/tests 涟漪效应，零半途反问，端到端闭环；
   - **`quick`**（单文件局部确定性微调）：主控直接给出精确 `FILE:L1-L2` 锚点与验证命令，执行者零发散快速落盘自验；
   - **`audit-sweep`**（全仓清零/合规盘点）：自动绑定 `Multi-Modal Sweep` + `Loop-Until-Dry (seen-set)` + `No Silent Caps`；
   - **`writing-spec`**（架构规格书/契约文档/调研报告）：剔除空洞 AI 套话，强制给出可点击文件符号链接、精确 Schema 与可执行验收命令。

### 2.2 上下文与缓存经济学 (`Context & Cache Economics`)
1. **区分 `self` 磁盘直写与 `research` 窗口蒸馏（防主控 `Context Rot`）**：
   - **`TypeName: "self"`（具备 `write_file` 权限的分片/文档节点）**：产出大体积中间清单、批量扫描分片或长篇规格时，令其直接写入 `<artifactDir>/scratch/<id>.json`（或独占白名单文档），在 `send_message` 中**仅回传文件路径指针与核心摘要**；
   - **`TypeName: "research"`（纯只读沙箱，无写文件工具且严禁通过命令写盘）**：负责在独立子窗口内消化海量源码读取、长篇 Git diff、**多张高分 UI 截图/PDF/视频附件（映射 `Multimodal-Looker`）或第三方库官方文档/网页检索（映射 `Librarian`）**，仅通过 `send_message` 回传高密度结构化 JSON 结论。
2. **`Continue (send_message)` vs `Spawn Fresh (invoke_subagent)` 决策铁律**：
   - **高重合度续接（`send_message` 命中会话缓存）**：当任务高度依赖某子智能体刚读完的文件上下文（如紧耦合追问，或将实锤缺陷打回原实现者执行 `fix-round`）时，**必须通过 `send_message` 复用原 `conversationId`**，节省冷启动 Token 并保持完整修改记忆；
   - **零偏见独立隔离（`invoke_subagent` 全新会话）**：当从广域发散探索转入聚焦代码实现（防探索废料污染实现），或执行**代码审查（Reviewer）与对抗证伪（Verifier）**时，**必须调用 `invoke_subagent` 启动全新会话**，彻底杜绝确认偏见（Confirmation Bias）。
3. **跨波次只增不减智慧便签 (`Append-Only Wave Notepads`)**：
   - 在多波次推进（Wave $1 \to N$）时，主控在会话隔离目录 **`<artifactDir>/scratch/<wave>-notepad.md`**（严禁写进 `.agentdash/` 目录以免污染 `git status -uall` 或干扰多根路径探测）维护一份**只增不减（严禁覆写清空）**的波次经验便签，记录已探明的真实挂载路径、死代码黑名单、构建/哈希锁命令与高频陷阱，并在派发后续波次子智能体时将精选摘要注入其 `Task-Brief`。

### 2.3 严格遵守 `--host agy` 钩子归因、Actor 通信与异常回收铁律
1. **`Workspace` 必须保持默认 `"inherit"`**（切勿传 `"branch"`）：在 `Prompt` 中硬性锁死子智能体只准在显式分配的 `<worktree_path>` 绝对路径下操作，使子会话 `Stop` 事件准确写回主仓 `.agentdash/events.jsonl`；
2. **`Role` 必须带唯一任务与阶段前缀**（前 80 字符唯一，如 `"[W2-L4] PC Web UX Implementer"`、`"[W2-L4-RevA] Completeness Critic"`）；
3. **`Prompt` 首行前 80 字符必须唯一且以 `[<Task-ID>]` 开头**（禁止在多个子智能体 Prompt 开头粘贴相同长段公共背景，防止 `hook.rs` 反查实名 `who` 槽位互相覆盖）；
4. **`send_message` 强制显式回传 + 响应式唤醒**：Antigravity 子智能体普通文本不会自动回传父会话，所有子智能体必须调用 `send_message` 向父会话发送结果后简洁收尾；主控发出 `invoke_subagent` 后直接结束当前轮次等待系统唤醒，严禁循环或 `sleep` 轮询；
5. **异常/跑偏子智能体强制回收 (`manage_subagents`)**：当子智能体跑偏、超时失联或触发 2 轮熔断需废弃时，主控立即调用 `manage_subagents(Action: "kill", ConversationIds: [...])`（`--host agy` 钩子会自动补齐该子会话的 `completed` 事件并清理挂起槽位）；
6. **只读审计的钩子防污染纪律 (`Hook-Safe Read-Only Rule`)**：`agentdash` 的 `match_word_seq` 按词边界扫描整条 `CommandLine`（引号非词字符，连 `rg "npm test" package.json` 也会触发门禁事件！）。因此只读探针与审查员运行命令时，若非主控刻意跑门禁，**严禁在整条命令字符串（含引号参数内）出现验证门触发词**（如 `cargo test`/`clippy`/`fmt`、`go test`、`npm test`、`vitest`、`pytest`、`gh pr checks` 及 `.agentdash/config.json` 自定义门词）。

---

## 3. 零信任验收铁律与七大 Ultracode 质量模式 (Zero-Trust & The 7 Quality Patterns)

### 3.0 零信任反撒谎前置公理 (`Default Distrust — "Subagents Lie"`)
主控与审查员**永远不得盲信实现者子智能体自报的“已全部完成/测试全绿”**。任何实现汇报必须附带并经独立核验 **Proof-of-Work（确定性物证）**：
- `git status --porcelain=v1 -uall` 真实状态与 `git diff` 逐 hunk 代码落点；
- `zeroForbiddenFilesTouched === true`（零越界触碰兄弟泳道或台账禁区）；
- 独立实跑目标单测文件与静态校验脚本的真实退出码 `EXIT=0`。

### 3.1 七大高阶质量编排模式（判据速查表与 Schema 详见 [references/quality-patterns-and-playbooks.md](./references/quality-patterns-and-playbooks.md)）
1. **`Adversarial Verify`（默认怀疑的对抗证伪）**：
   - 针对初审挑出的候选缺陷，派出独立 Skeptic 子智能体下达反证指令：**“默认怀疑该发现为误报（Default to `refuted=true` if uncertain），亲自核对源码精确行号与实跑单测，试图推翻它”**。只有经受住反证（`refuted: false, isRealBug: true`）的真缺陷才进入修复环。
2. **`Perspective-Diverse Verify`（三透镜正交审查）**：
   - 提交或合流前强制并行派出 3 路正交透镜 Reviewer（按目标仓技术栈适用具体锚点）：
     * **Lens 1 · `Completeness & Backlog Override`**：逐条核对任务切片与需求台账（如 `docs/BACKLOG.md`），严查漏项、半截接线、改在未挂载死代码（如 `LegacyCard.tsx`）上、或破坏多租户/多环境部署同构（如 `tenant-a` / `tenant-b` 或 `prod` / `staging` 配置投影与诚实空态降级）；
     * **Lens 2 · `Boundary & Static Locks`**：核查是否越界触碰兄弟泳道独占文件；核查工程四类静态锁（如：① 前端构建产物快照锁 `packages/web/dist/*` + `npm run build`，② 静态资产清单与 SHA-256 完整性哈希锁 `assets-manifest.json` + `SHA256SUMS` + `node scripts/check-asset-hashes.mjs`，③ 依赖与 Vendor 冻结守卫 `package-lock.json` / `Cargo.lock` / `vendor/`，④ 多语种词典对称与领域术语准确性锁 `zh-CN/en/ja/ko/...` 键值对称与跨命名空间防冲突）；
     * **Lens 3 · `Spec, Security & Runtime Edge-Case`**：核查色彩令牌与设计语言不变量（如 `docs/DESIGN-INVARIANTS.md`、`docs/COLOR-TOKENS.md` 零硬编码裸色、冻结透明度阶梯、语义 CSS 变量 `--ui-*` / `--ds-*`、禁违规高噪动效、KPI/表格数字 `tabular-nums`）、64 位雪花 ID 字符串精度保护、SQL 压测/仿真脏数据过滤守卫（如过滤 `SIM_FIXTURE_*` / `is_synthetic = 1`）、SSRF/资源泄漏、流式 SSE 事件幂等防重与诚实空态（禁前端硬编码假数据）。
3. **`Judge Panel & Grafting`（多视角方案竞赛与优胜嫁接）**：
   - 开放式设计空间较宽时，并行派 3 路子智能体从正交角度（`MVP 最小侵入角`、`极致 UX 交互角`、`极端边界与防雷角`）独立提案，再由 `[<Task-ID>-Judge]` 子智能体以优胜方案为主干、嫁接其余方案防雷亮点，输出含 `tddTaskBreakdown`（含 `redTestsToWriteFirst`）的终版规格。
4. **`Loop-Until-Dry with Seen-Set Dedup`（直到连续 $K$ 轮零新发现 + `seen` 全集去重）**：
   - 全仓清零任务持续迭代扫描直至连续 $K$ 轮返回 `0 fresh items`。**防死循环铁律**：去重必须比对历史全量已评估集合 **`seen`**（含曾被判为合法豁免的项），**严禁仅比对 `confirmed`**。
5. **`Multi-Modal Sweep`（多模态正交盲搜合流）**：
   - 并行探针按正交维度（目录容器 `by-container`、词法/AST `by-content`、调用链 `by-entity`、Git 历史 `by-time`）独立盲搜后并集去重。
6. **`Completeness Critic`（终局完整性审计官）**：
   - 批次收口前专设 `[<Wave-ID>-CompCritic]`，对照实时 `git status --porcelain=v1 -uall` 与需求台账排查任何漏网文件、hunk、断言或静态锁。
7. **`No Silent Caps`（零静默截断）**：
   - 任何扫描、采样或测试若设置了上限或跳过目录，必须显式汇报略过范围与原因，严禁以偏概全。

### 3.2 有界返修环与连续 2 轮失败 `Oracle` 熔断会诊 (`2-Strike Oracle Escalation`)
- 经证伪实锤的 `blocker / major` 缺陷，通过 `send_message` 发回原实现子会话执行原地 `fix-round`（默认上限 `max_rounds = 3`）。
- **2 轮不愈熔断铁律**：若同一缺陷在 **连续 2 轮 `fix-round`** 后仍未彻底解决或引发连环回归，**严禁盲目发起第 3 轮局部打补丁**！主控立即暂停原实现会话，派生全新只读 **`[<Task-ID>-Oracle]` 根因诊断官**（`ultrabrain` 载荷）从第一性原理重审全链路，产出 `ORACLE_DIAGNOSIS_SCHEMA` 外科手术方案后再完成最终根治。

---

## 4. 七大实战工程剧本（与参考库剧本 1–7 一一对应）

以下剧本 A–G 与 [references/quality-patterns-and-playbooks.md](./references/quality-patterns-and-playbooks.md) 第三节的 **剧本 1–7** 严格一一对应：

- **剧本 A（对应参考库剧本 1）· 穷尽式扫描与对抗清零循环 (`Loop-Until-Dry Sweep`)**：维护全量 `seen` 集合去重，多路 Finder 正交扫描 $\to$ Verifier 核实，直至连续 2 轮 `0 fresh items`。
- **剧本 B（对应参考库剧本 2）· 同一 Worktree 内无交集子分轨并行实现 (`Disjoint Sub-Track Parallel Implement`)**：锁定两两零交集文件白名单（$\bigcap F_i = \emptyset$），硬锁编辑前只读重读锚点校验（`Re-Read Anchor Guard`）、TDD 先红后绿与分轨并行期全局 Git 状态禁令（禁跑 `git commit/checkout/reset/stash/clean`），跑通各自专属单测后由主控统一提交。
- **剧本 C（对应参考库剧本 3）· 混合工作树逐文件/逐 Hunk 剥离审计 (`Audit Worktree Split`)**：`Sweep` 标记 `ownerA/ownerB/mixed` $\to$ `Adversarial Verify` 逐 hunk 严查公共热区文件夹带改动 $\to$ `Completeness Critic` 零遗漏核对。
- **剧本 D（对应参考库剧本 4）· 跨泳道 `Merge Guard`、`Refinery` 串行合流队列与 `Final Signoff`**：预检新 Worktree 依赖环境就绪 $\to$ 识别跨泳道共享热区冲突矩阵 $\to$ 按 **`Refinery` 串行精炼顺序**（先底层/纯后端 $\to$ 后前端业务 $\to$ 主仓统一重跑构建如 `npm run build` 与刷新资产哈希锁 `node scripts/check-asset-hashes.mjs --write` $\to$ 跨模块差分测试）逐条过 `Final Signoff`（核验 `cleanWorktree === true`、远端对齐状态、不含门禁触发词的目标单测全绿与返修闭环）。
- **剧本 E（对应参考库剧本 5）· 跨波次只增不减智慧便签 (`Append-Only Scratch Wave Notepads`)**：在 `<artifactDir>/scratch/<wave>-notepad.md` 持续追加挂载路径/死代码陷阱、冻结契约与静态锁命令，跨波次赋能下游 `Task-Brief`。
- **剧本 F（对应参考库剧本 6）· 结构化工作项批量扇出归并 (`Work-List Map-Reduce`)**：主控用 `run_command` + `write_file` 固化无截断 `work-list.json` $\to$ 分批（每批 3~5 路 `TypeName: "self"`）并发写盘 `<artifactDir>/scratch/result-chunk-i.json` $\to$ 主控脚本确定性归并校验 $\sum \text{processed} === \text{total}$。
- **剧本 G（对应参考库剧本 7）· `2-Strike Oracle` 熔断 + 真机多视口视觉门禁 + 防 `done ?` 台账收口 + 多级分支清场**：
  1. **真机多视口核验**：启动真实应用服务完成桌面（`1440×900` / `1280×800`）、移动（`375×812` 及嵌入式壳层视口）、浅深双主题与多语种切换（如 `zh-CN/en/ja/ko/...`）的计算样式与真实渲染实证；
  2. **防 `done ?` 门禁折叠顺序**：先在 `.agentdash/ledger.json` 将任务置为 `"state": "done"` 并写入当前 RFC 3339 `"done_at"`，**紧接着由顶层主控在主工作区实跑真实项目门禁命令**（如 `npm test` / `cargo test` 或 `.agentdash/config.json` 配置的自定义门禁），使 `last_gate_passed >= done_at`，随后输出 `agentdash render panel`；
  3. **多级分支四步彻底清场与防早退闭环 (`Anti-Premature-Stop`)**：① 移除已合流 Worktree 并 `git worktree prune` $\to$ ② 删除本地及远端（如双远端 `origin`、`upstream`）已合入的临时特性分支（如 `feat-20261112-engine`） $\to$ ③ 同步更新需求台账（如 `docs/BACKLOG.md`）状态 $\to$ ④ 确认主工作树 100% 干净停留在最新常驻集成分支，并在多车道波次收尾跑通 `agentdash render digest --strict`、`agentdash stats --host agy` 与 `agentdash archive --strict`（确认退出码均为 `0` 前严禁半途停机交差）。
