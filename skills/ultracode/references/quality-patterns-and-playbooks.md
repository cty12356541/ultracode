# Ultracode v2 七大质量模式速查表、9 大结构化契约与七大实战剧本参考

本参考手册融合 Claude Code 内置 `workflow-authoring / Ultracode`、`Superpowers`、`Gas Town (Refinery)`、OpenAI `Codex / Symphony` 以及 `Oh My OpenCode (OMO)` 的高阶 Harness 工程范式，供顶层主控在编排复杂工程波次时按需查阅与组合。

---

## 一、七大 Ultracode 质量编排模式选型速查表 (The 7 Quality Patterns Matrix)

| 模式编号与名称 | 触发场景判据 | 拓扑类型 (`Pipeline` vs `Barrier`) | 关键防雷不变量 |
| :--- | :--- | :--- | :--- |
| **1. `Adversarial Verify`**（对抗证伪） | 每次初审报告候选缺陷或高风险架构假设定论后 | 单泳道内 `Streaming Pipeline` | 独立 Skeptic 默认置 `refuted: true`，必须凭精确行号与实跑单测反证失败后才确认为真缺陷（`isRealBug: true`）。 |
| **2. `Perspective-Diverse Lenses`**（三透镜正交审查） | 任何实质性代码改动提交/合入主干前（必选） | 3 路并行扇出 $\to$ 按 `file+line` 去重 `True Barrier` | 严禁同质审查；固定正交三透镜：`Completeness & Backlog` + `Boundary & Static Locks` + `Spec & Runtime Edge-Case`。 |
| **3. `Judge Panel & Grafting`**（方案竞赛嫁接） | 新增复杂交互布局、跨端协议或存在多种架构权衡时 | 3 路提案扇出 $\to$ `Judge` 合成 `True Barrier` | 3 路正交视角（`MVP 最小侵入` / `极致 UX` / `极端防雷`）独立盲写，由 `Judge` 择优主干并嫁接其余防雷亮点产出 `FINAL_SPEC_SCHEMA`。 |
| **4. `Loop-Until-Dry (Seen-Set)`**（穷尽清零循环） | 全仓裸中文清零、裸色值清零、死引用盘点等长尾清零 | 每轮跨探针 `True Barrier` 去重，循环至 `dry >= 2` | **防死循环铁律**：新发现 `fresh` 必须对比历史全量已评估集合 **`seen`**（含被判合法豁免项），严禁仅对比 `confirmed`！ |
| **5. `Multi-Modal Sweep`**（多模态正交盲搜） | 未知复杂调用链取证、历史遗留回归溯源 | 4 路正交维度并行扇出 $\to$ 并集去重 `True Barrier` | 按目录容器（`by-container`）、词法/AST（`by-content`）、实体调用链（`by-entity`）、Git 历史（`by-time`）独立盲搜。 |
| **6. `Completeness Critic`**（终局完整性审计） | 多泳道波次收口、混合脏工作树剥离签收前 | 收尾单点守门员 | 对照实时 `git status --porcelain=v1 -uall` 与需求台账逐项排查漏网文件、hunk、断言与静态校验锁。 |
| **7. `No Silent Caps`**（零静默截断） | 所有扫描、分片批处理、测试采样与审查报告 | 全程全局不变量 | 严禁静默 `.slice()` 截断结果；若跳过目录或设上限，必须显式列出被跳过路径、总数与原因。 |

---

## 二、9 大强制结构化返回契约 (Structured Output JSON Schemas)

在调用 `invoke_subagent` 时，要求子智能体通过 `send_message` 严格按以下 JSON Schema 回传结果（`TypeName: "self"` 分片节点可将大体积 JSON 写入 `<artifactDir>/scratch/<id>.json` 并回传路径指针；`TypeName: "research"` 纯只读节点直接通过 `send_message` 回传精炼 JSON）：

### 1. 波次前置挑刺契约 (`PREFLIGHT_CRITIC_SCHEMA` — `Metis & Momus`)
```json
{
  "waveId": "W15",
  "verdict": "OKAY",
  "verifiedRealPaths": ["packages/web/src/components/ToolCallRow.tsx"],
  "hiddenOverlapsFound": [],
  "aiSlopOrScopeRisks": ["注意保留 tenant-a 与 tenant-b 多租户配置投影及诚实空态降级，勿新增多余抽象层"],
  "blockers": [
    {
      "id": "PF-01",
      "issue": "若 verdict 为 REJECT，最多列出 3 个阻塞开工的硬伤（如目标文件实为死代码、跨车道同改同一热区文件）",
      "requiredAdjustment": "开工前对台账/拆分的精确修正建议"
    }
  ]
}
```

### 2. 子系统深读勘测契约 (`SCOUT_SCHEMA`)
```json
{
  "domain": "子域名称",
  "filesInspected": ["已精读文件列表"],
  "testFilesFound": ["关联单测文件列表"],
  "constraintsAndLocks": [
    "前端构建产物快照锁 (如 packages/web/dist/* 需重跑 npm run build)",
    "静态资产清单与 SHA-256 哈希锁 (如 assets-manifest.json、SHA256SUMS 与 node scripts/check-asset-hashes.mjs)",
    "依赖与 Vendor 冻结守卫 (如 package-lock.json / Cargo.lock / vendor/)",
    "多语种词典对称锁 (如 zh-CN/en/ja/ko/... 键值完全对称且禁跨命名空间冲突)"
  ],
  "filesToModify": [
    {
      "path": "精确相对路径",
      "exactLineRanges": "L120-L165",
      "currentBehavior": "当前代码逻辑与问题根因",
      "requiredChange": "精确改造方案",
      "watchoutsAndTests": "注意点（如区分真实挂载组件 packages/web/src/components/ToolCallRow.tsx 与未挂载死文件 LegacyCard.tsx）"
    }
  ],
  "filesToDelete": []
}
```

### 3. 多视角方案竞赛契约 (`PROPOSAL_SCHEMA` + `FINAL_SPEC_SCHEMA`)
- **单视角架构提案 (`PROPOSAL_SCHEMA`)**：
```json
{
  "angle": "MVP最小侵入角 | 极致UX交互角 | 极端防雷与可测性角",
  "architectureFlow": "核心数据流与状态流转说明",
  "filesAndInterfaces": [
    {
      "path": "精确文件路径",
      "signatureOrContract": "函数/组件/API 契约签名"
    }
  ],
  "edgeCasesHandled": ["重点防御的边界场景"],
  "tradeoffs": "方案取舍与潜在风险"
}
```
- **评委优胜嫁接终版规格 (`FINAL_SPEC_SCHEMA`)**：
```json
{
  "winningSynthesis": "选定的主干方案及从其余提案嫁接的防雷亮点",
  "criticalEdgeCasesAndBugTraps": ["提前锁定的高危陷阱清单"],
  "tddTaskBreakdown": [
    {
      "id": "W15-02",
      "label": "子任务标题",
      "category": "visual-engineering | ultrabrain | deep | quick",
      "exclusiveFiles": ["独占写白名单文件"],
      "redTestsToWriteFirst": ["动笔写实现前必先补齐的失败单测断言"]
    }
  ]
}
```

### 4. 三透镜对抗初审契约 (`REVIEW_SCHEMA`)
```json
{
  "dimension": "completeness | boundary-locks | spec-runtime",
  "gatesRun": ["实跑过的不含全局门禁触发词的只读校验脚本"],
  "allGatesPassed": true,
  "findings": [
    {
      "id": "REV-01",
      "severity": "blocker | major | minor",
      "file": "问题文件路径",
      "line": 142,
      "claim": "具体缺陷描述",
      "failureScenario": "触发该缺陷的真实输入/边界场景",
      "proposedFix": "精确修复建议"
    }
  ],
  "passedChecks": ["已逐行核实无误的检查项"]
}
```

### 5. 对抗证伪批量裁定契约 (`VERDICT_SCHEMA`)
```json
{
  "lane": "W15-02",
  "verdicts": [
    {
      "findingId": "REV-01",
      "refuted": false,
      "isRealBug": true,
      "severityConfirmed": "blocker | major | minor | false_positive",
      "reasoning": "核对源码精确行号与实跑目标单测后的证伪/实锤依据（不确定时默认 refuted: true）",
      "exactFixIfReal": "若 refuted 为 false（真缺陷），给出最小完备修复代码落点；误报则填 null"
    }
  ],
  "approvedForMerge": false
}
```

### 6. 连续 2 轮返修不愈 `Oracle` 根因会诊契约 (`ORACLE_DIAGNOSIS_SCHEMA`)
```json
{
  "taskId": "W15-02",
  "rootCause": "导致连续两轮修复失败的底层架构/状态生命周期根因",
  "whyPriorFixesFailed": "为什么 Round 1 与 Round 2 只是掩盖表象或引入新回归",
  "filesToRevertOrClean": ["建议先回退脏补丁的文件或代码段"],
  "surgicalFixPlan": [
    {
      "path": "精确文件路径",
      "exactLineRanges": "L80-L112",
      "minimalLeverageChange": "最小杠杆点一次性根治方案"
    }
  ],
  "verificationTestToRun": "验证根治效果的精确单测文件命令与新增断言"
}
```

### 7. 结构化批量分片结果契约 (`CHUNK_RESULT_SCHEMA`)
```json
{
  "chunkId": "chunk-01",
  "filesAssigned": 15,
  "processedCount": 15,
  "skippedPathsAndReasons": [],
  "issueCount": 2,
  "items": [
    {
      "key": "src/foo.ts:42:barLabel",
      "file": "src/foo.ts",
      "line": 42,
      "detail": "具体命中项或改造记录"
    }
  ]
}
```

### 8. 多泳道 `Refinery` 合流队列与准入签收契约 (`REFINERY_SIGNOFF_SCHEMA`)
```json
{
  "waveId": "W15",
  "rootRepoClean": true,
  "lanesChecked": [
    {
      "lane": "W15-02",
      "branch": "feat-20261112-engine",
      "cleanWorktree": true,
      "baselineOrRemoteAligned": true,
      "testsAllGreen": true,
      "fixVerifiedSummary": "Round 1 缺陷已闭环验证通过"
    }
  ],
  "overlappingFilesAcrossLanes": ["SHA256SUMS"],
  "refineryMergeOrder": [
    "1. 先合入纯后端泳道 W15-02 (--no-ff)",
    "2. 再合入前端泳道 W15-03 (--no-ff)",
    "3. 在主仓统一运行 npm run build 与 node scripts/check-asset-hashes.mjs --write 刷新资产清单及哈希锁",
    "4. 运行跨模块差分回归与最终门禁"
  ],
  "readyForRefineryMerge": true
}
```

---

## 三、七大实战工程剧本详解（与 `SKILL.md` 剧本 A–G 一一对应）

### 剧本 1（对应剧本 A）：穷尽式扫描与对抗清零循环 (`Loop-Until-Dry Sweep`)
适用于全仓 i18n 裸中文清零、全仓裸色值清零、全仓无数据源键值盘点等未知尾长任务：
1. 维护全局集合 `seen = new Set()`（以 `file:line:symbol` 为唯一 key）与确认列表 `confirmed = []`，设空轮计数 `dry = 0`；
2. 当 `dry < 2` 时，并行派发多路 Finder（采用 `Multi-Modal Sweep` 正交维度）扫描各子系统；
3. 将本轮返回项与 **`seen` 全集**对比过滤出 `fresh`（**严禁只与 `confirmed` 对比**，否则被 Verifier 判为合法豁免的项会在每轮重复出现导致死循环）；
4. 若 `fresh.length === 0`，则 `dry++`；否则重置 `dry = 0`，将 `fresh` 记入 `seen`，派正交 Verifier 核实后将真缺陷并入 `confirmed`。

### 剧本 2（对应剧本 B）：同一 Worktree 内无交集子分轨并行实现 (`Disjoint Sub-Track Parallel Implement`)
当单个 Worktree 内的改造涉及 2~4 个正交子模块时：
1. 先用 `Deep Scout` 锁定各子分轨精确文件集合，数学验证两两交集为空（$\bigcap F_i = \emptyset$）；
2. 并行派发 `TypeName: "self"` 子分轨实现者（严格单层星型，禁调 `invoke_subagent`），硬锁：**专属写白名单**、**每次编辑前先只读重读锚点校验（`Re-Read Anchor Guard`）**、**TDD 先红后绿**、以及 **Git 全局状态禁令**（分轨并发期禁跑 `git commit/checkout/reset/stash/clean`）；
3. 全部分轨跑通各自专属单测并经 `send_message` 回报后，由主控统一审查与提交。

### 剧本 3（对应剧本 C）：混合工作树逐文件/逐 Hunk 剥离审计 (`Audit Worktree Split`)
当某个工作树混入了两个不同功能方向的未提交改动时：
1. **Phase 1 (`Sweep`)**：按目录分组并行扫描 `git diff --unified=5`，标记每个文件为 `ownerA`、`ownerB`、`mixed` 或 `clean` 并记录精确 hunk 行号；
2. **Phase 2 (`Adversarial Verify`)**：派独立复核员**默认怀疑所有被标为单一 owner 的公共热区文件**（如 `src/app/Header.tsx`、`src/server/router.ts`、`packages/web/src/components/ToolCallRow.tsx`），逐 hunk 核查是否夹杂了另一方改动；
3. **Phase 3 (`Completeness Critic`)**：对照最新 `git status --porcelain=v1 -uall` 确认零遗漏文件，输出零误伤剥离剧本。

### 剧本 4（对应剧本 D）：多泳道 `Merge Guard`、`Refinery` 专职串行合流队列与 `Final Signoff`
吸收 Gas Town `Refinery` 合并队列机制，在多条并行 Worktree 收口合入常驻集成分支前：
1. **Worktree 环境引导与冲突矩阵预审 (`Merge Guard`)**：确认各 Worktree 依赖就绪，并行只读检查 `git status --porcelain=v1 -uall --branch`，识别跨泳道共享热区与构建锁；
2. **`Refinery` 串行精炼入干**：按 `REFINERY_SIGNOFF_SCHEMA.refineryMergeOrder` 严格串行推进（**先底层/纯后端泳道 $\to$ 后前端业务泳道 $\to$ 合流点主仓统一重跑构建与资产哈希锁刷新 $\to$ 跨模块差分集成测试**），杜绝语义断链；
3. **准入核验 (`Final Signoff`)**：对需推远端分支核验双远端（如 `origin` / `upstream`）同 SHA，对本地隔离临时特性分支（如 `feat-20261112-engine`）核验基线无偏移，确认 `cleanWorktree === true` 且目标单测全绿。

### 剧本 5（对应剧本 E）：跨波次只增不减智慧便签 (`Append-Only Scratch Wave Notepads`)
吸收 Oh My OpenCode / Oh My ClaudeCode 的防失忆机制，在多波次战役（Wave $1 \to N$）中：
1. 主控统一在会话隔离目录 **`<artifactDir>/scratch/<wave>-notepad.md`**（切勿写进 `.agentdash/` 以保持主仓 `git status -uall` 100% 干净）维护三栏只增不减记录（严禁覆写清空历史条目）：
   - `## 1. Verified Mount Paths & Dead-Code Traps`（真实挂载组件 vs 死代码黑名单）
   - `## 2. Frozen Contracts & Architectural Decisions`（已冻结接口签名与数据口径）
   - `## 3. Build/Hash Locks & Gotchas`（本仓必刷静态锁命令与前序泳道踩坑记录）
2. 每条泳道收口或 `Oracle` 会诊后，主控提取 `newLearningsForNotepad` 追加至便签末尾，并择要注入下一波次子智能体的 `Task-Brief`。

### 剧本 6（对应剧本 F）：结构化工作项批量扇出归并 (`Work-List Map-Reduce`)
吸收 OpenAI Codex 批量扇出与 Anthropic 磁盘直写范式，处理全仓几十个模块的同构审计或批量改造：
1. **Map 清单固化**：主控通过 `run_command`（如 `git ls-files`、PowerShell `Get-ChildItem -Recurse` 或 Node/Python 脚本）枚举完整无截断列表并通过 `write_file` 固化 `<artifactDir>/scratch/work-list.json`（含 `totalCount`，严守 `No Silent Caps`），切分为互不重叠的 `chunk-01 .. chunk-K`；
2. **受控分批并发**：按每批 3~5 路调用 `invoke_subagent(TypeName: "self")`，每个分片 Worker 处理对应 `chunk-i`，用 `write_file` 将符合 `CHUNK_RESULT_SCHEMA` 的结果落盘至 `<artifactDir>/scratch/result-chunk-i.json`，经 `send_message` 仅回传路径指针与计数摘要；
3. **Reduce 确定性汇总**：主控用脚本合并全部 `result-chunk-*.json`，核验 $\sum \text{processedCount} === \text{totalCount}$ 确认 100% 零遗漏。

### 剧本 7（对应剧本 G）：`2-Strike Oracle` 熔断 + 真机视觉门禁 + 防 `done ?` 台账收口 + 多级分支清场
1. **2 轮不愈 `Oracle` 熔断**：同一缺陷在原实现会话经 `send_message` 连续 2 轮 `fix-round` 未愈时，立即暂停原会话（跑偏失控时用 `manage_subagents(Action: "kill")` 回收），派全新只读 `[<Task-ID>-Oracle]` 产出 `ORACLE_DIAGNOSIS_SCHEMA` 外科手术方案完成根治；
2. **真机浏览器多视口核验**：涉及界面改动时，启动真实应用服务核验桌面（`1440×900` / `1280×800`）、移动（`375×812` 及嵌入式壳层视口）、浅深双主题与多语种切换（如 `zh-CN/en/ja/ko/...`）的计算样式与真实渲染；
3. **防 `done ?` 收口与多级分支四步清场**：① 先在 `.agentdash/ledger.json` 置 `"state": "done"` 并写入当前 RFC 3339 `"done_at"`，**紧接着由顶层主控在主仓实跑真实门禁**确保 `last_gate_passed >= done_at`；② 执行多级分支四步清场（移除 Worktree 并 `git worktree prune` $\to$ 删除本地及远端如 `origin` / `upstream` 已合入的临时特性分支 `feat-20261112-engine` $\to$ 同步更新 `docs/BACKLOG.md` 需求台账状态 $\to$ 确认主工作树 100% 干净停留在最新常驻集成分支）；③ 波次收尾跑通 `agentdash render digest --strict`、`agentdash stats --host agy` 与 `agentdash archive --strict`（确认退出码均为 `0` 前严禁半途停机交差）。
