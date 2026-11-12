<!-- ultracode:begin v2 -->
## Ultracode v2 多智能体高阶编排与零信任对抗复核约定(本机全局常驻 · Standing Opt-In)

1. **常态启动与顶层作用域隔离(Standing Opt-In & Top-Level Scope Guard)**:
   - **仅顶层主控会话生效**:除纯闲聊或单行机械微调外,凡实质性研发、跨模块修复、架构设计、审计或波次编排,**顶层主控默认无条件启用 Ultracode v2**(主动激活并读取当前会话 `<skills>` 注册的 `ultracode` 技能（`~/.gemini/config/plugins/ultracode/skills/ultracode/SKILL.md` 或 `~/.gemini/config/skills/ultracode/SKILL.md`）及按需查阅同目录 `references/`),严禁单兵串行手写复杂变更。
   - **子智能体免读防套娃**:若当前会话处于被派生的**子智能体态**(含 `<subagent_reminder>`),免读 `SKILL.md`、**严禁调用 `invoke_subagent` 套娃派生**,直接单兵闭环父会话下发的 `Task-Brief`,并通过 `send_message` 回传结果后立即结束回合(普通文本不会自动回传父会话)。
2. **前置挑刺、反懒惰切片、流式/屏障与扁平星型封顶(Pre-Flight, Pipeline & Depth-1 Cap)**:
   - **Hybrid Scout → Metis/Momus Pre-Flight → Task-Brief**:扇出前先内联轻量只读摸底,大波次开工前排查隐含假设/死代码/路径真伪;主控必须将勘测结果消化为自包含单任务切片(`Task-Brief`:精确 `file + line`、契约、单测与禁区),严禁下发“根据前文发现修复”等懒惰指令。
   - **Streaming Pipeline vs True Barrier & Depth-1 封顶**:无跨项依赖默认流式无屏障推进(先回先审),仅在跨探针按 `file+line` 去重、`0 findings` 早退、`Judge Panel` 或跨泳道合流(`Merge Guard`)时设同步屏障;严格保持**单层扁平星型(`Depth-1`)**,禁止任何子智能体再次调用 `invoke_subagent`(防止 `--host agy` `is_dispatcher` 守卫吞没父子会话闭合事件)。
3. **语义载荷、上下文经济学与 `--host agy` 钩子安全铁律**:
   - **算力与语义载荷**:`invoke_subagent` 默认 `Model: "inherit"`,按任务语义(`visual-engineering`/`ultrabrain`/`deep` 静默深读/`quick`/`audit-sweep`/`writing-spec`)注入行为纪律;高重合度追问与 `fix-round` 必须用 `send_message` 复用原实现者 `conversationId` 命中缓存,审查(`Reviewer`)与证伪(`Verifier`)必须用 `invoke_subagent` 派生全新无偏见会话。
   - **防 Context Rot 与波次便签**:`self` 分片工作节点大体积产物直写 `<artifactDir>/scratch/` 仅回传路径指针(`research` 纯只读不写盘,仅回传精炼摘要);跨波次防雷经验以只增不减方式维护于 `<artifactDir>/scratch/<wave>-notepad.md`(严禁写入 `.agentdash/` 污染工作树)。
   - **`--host agy` 归因与防污染**:严格保持 `Workspace: "inherit"`、`Role` 与 `Prompt` 首行前 80 字符带唯一 `[<Task-ID>]` 前缀、锁死 Worktree 绝对路径与独占写白名单(`zeroForbiddenFilesTouched: true`);同树零交集子分轨($\bigcap F_i = \emptyset$)并发禁跑全局 Git 命令且编辑前必先只读核对上下文锚点;只读会话严禁在命令行(含引号参数内)出现验证门触发词。
4. **零信任七大质量模式、2 轮 `Oracle` 熔断与 `Refinery` 收口闭环**:
   - **零信任反撒谎(`Subagents Lie`)**:默认不采信子智能体口头报捷,合流前强制核验硬物证(`Proof-of-Work`:`git status/diff` + 实跑单测退出码),并行派 3 路正交 Reviewer(`Completeness & Backlog`、`Boundary & Static Locks`、`Spec & Runtime`) → 独立 Verifier **默认怀疑误报(`refuted=true`)**实跑反证。
   - **2 轮熔断与串行精炼合流**:实锤 `blocker/major` 经 `send_message` 打回原会话 `fix-round`(上限 3 轮;连续 2 轮未愈强制暂停并派只读 `Oracle` 做根因重审,跑偏会话用 `manage_subagents(kill)` 回收);按需组合 `Judge Panel`、`Loop-Until-Dry`(`seen` 全集去重)、`Multi-Modal Sweep`、`Completeness Critic` 与 `No Silent Caps`;多泳道按 `Refinery` 队列串行合流、过真机视觉门禁,并严守“先写 `done_at` 紧接主仓实跑真门禁”(`last_gate_passed >= done_at`)与 `digest/archive --strict` 零告警前严禁早退。
<!-- ultracode:end -->
