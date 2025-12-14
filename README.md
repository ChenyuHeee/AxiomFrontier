## ⚠️ UNSAFE DEV AGENTS (HOTPATCH)

> 高风险：该功能允许 LLM 直接写入服务器代码文件，可能导致崩溃、数据丢失或安全问题。仅在隔离环境实验使用。

- `/api/dev/hotpatch`：POST `{intent}`，调用 dev LLM 返回 `{path, content}` 并直接写盘。
- `/api/ruler/dev-intent`：由统治者 LLM 生成 `{intent}`，可再交给 `/api/dev/hotpatch` 使用。
- `/api/dev/rule-patch`: POST `{gap}`，规则工程师 LLM 输出补丁并直接写盘。
- 定时自动多 Agent：设计组（可决定任何系统，鼓励大胆/超现实想法，4-6 项缺口每轮）产出缺口 -> 开发组（coder agents）生成补丁 -> QA 组审批 -> 写盘；开发组多 Agent -> QA 组 -> 写盘；统治者/NPC/事件同 tick 运行。

默认无任何防护、无审批、无测试。生产环境请禁用或隔离运行。
# 项目：Axiom Frontier（纯文本起步 MMO）

英文名：Axiom Frontier
中文名：天道边陲（暂定）
核心标语：“天行有常，不为尧存，不为桀亡。”（《礼记·中庸》）

> **单一持久世界**：规则、治安、经济由 AI “统治者”与“城主”（玩家或 NPC+LLM）动态决定。  
> **纯文本起步**：没有 GUI，玩家用自然语言输入，个人专属 LLM 解析意图并执行。  
> **城内/城外分层风险**：城外高危自由抢劫；城内规则、治安、税费由城主模型设定。  
> **提现点**：指定地点可提现，安全与手续费由城主决定；无全局反黑产/洗钱防护。  
> **极少硬约束**：最大开放性，可热更新规则与事件。

---

## 1) 核心理念 (Core Pillars)
- **Text-first, Natural Language**：玩家随便打字，专属 LLM → 意图解析 → 动作规划 → 风险标记。
- **AI 治理 + 玩家城主**：全球“统治者”（多 LLM 协商）只管宏观；每座城市的城主（玩家或 NPC+LLM）决定本地参数（治安、税、PVP、掉落、提现/仓储费、门禁等）。
- **高危野外，城内自定义**：野外自由抢劫高收益高风险；城内安全/狠毒取决于城主风格。
- **现金流通**：充值→代币→交易/掠夺→提现点兑现；手续费/安全等级由城主定。
- **开放演化**：规则、事件、政策可随时热更新；极少全局硬限制。

---

## 2) 世界与治理分层 (World & Governance)
- **世界**：单一大区，包含多个城市与野外区域。
- **统治者 (Global Ruler, multi-LLM)**：
  - 宏观事件/广播；可选的全局参数上/下限；跨城纠纷兜底仲裁。
  - 可以任命/撤销/竞拍城主权（可配置）。
- **城主 (City Lord, player or NPC+LLM)**：
  - 决定本城参数：治安/守卫、PVP/掉落、税费、门禁、提现点配置、仓储/保险、市场开关等。
  - 可委派副手（治安官/税务官等）。
- **仲裁路径**：本地优先（城主裁定），重大/跨城可上升到统治者。

---

## 3) 经济与提现 (Economy & Cash-Out)
- **资金流**：Fiat → Game Credit(代币) → In-world Trade/Loot → 提现点 → Fiat。
- **提现点**（实体/虚拟据点）：
  - 由城主授权/配置：手续费、额度、高价值限额、安全半径或时间窗、营业时间、冷却。
  - 高费高安全 vs 低费高风险，自由选择。
  - 保护只在点内/时间窗内生效，点外可被埋伏/劫持（若城主允许）。
- **市场**：官方商店 + 玩家拍卖/点对点，可由城主开/关/限流；价格锚可选。
- **通胀与回收**：税、维修、地租、竞拍保证金、维护费等由城主灵活设定；无强制全局回收。
- **无全局风控**：默认不做 AML/反洗钱；掠夺、刷价、操纵都可能发生，纯靠城主与玩家博弈。

---

## 4) 死亡、继承、转生 (Death / Inheritance / Rebirth)
- **遗嘱**：可指定资产（随身/仓储/领地股权/派系职位/AI 代理控制权），执行依赖本地治安与城主司法。
- **转生为 NPC**：治安足够时可按城主规则转生；城主可设条件/费用/冷却与 NPC 权限（顾问/代理/操作者）。
- **死亡惩罚**：城主在区间内自定（none/partial/full 掉落，耐久损耗，罚金/悬赏）；野外可被强制“硬核掉落”。

---

## 5) 城市参数 (由城主或其 LLM 决定)
建议的可扩展模板（示例字段，值域自定）：
```jsonc
{
  "name": "New Bastion",
  "safety_level": 0.0-1.0,
  "guards": { "density": "...", "response_time": "...", "lethality": "..." },
  "pvp": { "on": true, "drop_rule": "none|partial|full", "penalty": "none|fine|bounty" },
  "tax": { "trade": 0.0-?, "withdraw": 0.0-?, "gate_fee": 0.0-?, "storage_fee": 0.0-?, "insurance_rate": 0.0-? },
  "withdraw_point": { "fee": "...", "cooldown": "...", "safe_radius": "...", "hi_value_limit": "...", "hours": "..." },
  "market": { "auction": "on/off/limited", "p2p": "on/off/limited", "price_caps": "optional" },
  "access": { "mode": "open|permit|invite", "contraband_rules": "optional" },
  "broadcast": { "style": "dry|flavor|threatening", "frequency": "..." },
  "law": { "trespass": "penalty", "assault": "penalty", "theft": "penalty" }
}
```
- **门禁/通行**：open/permit/invite；违规是否通缉由城主决定。  
- **仓储/保险**：费率与是否履约由城主定；治安差时可拒赔。  
- **提现点**：费用/安全/限额自定义；可有多个，差异化竞争。  

---

## 6) 玩家体验 (Text-Only UX)
- **输入**：纯自然语言，无需指令。
- **专属 LLM**（每玩家一份）：
  - Intent Parse → Plan → Risk Tag (low/med/high) → 执行或确认。
  - 支持玩家偏好：和平/潜行/暴力/节俭/高效，历史学习。
- **反馈格式**（建议简洁）：
  - 行动摘要
  - 1–3 条关键感官线索（visual/hearing/touch/smell）
  - 结果 + 后果
  - 可选下一步提示
- **风险确认**：
  - Low：直接执行。
  - Medium：短提示（成本/掉落概率）。
  - High：强制确认（如攻击城卫、高额提现经过灰区）。

---

## 7) MVP 纵切范围 (Vertical Slice)
1) **世界基元**：区域/房间图、邻接；NPC/物品/资源/门禁实体。
2) **核心循环**：移动/观察/互动/基础交易/简单战斗/逃跑 → LLM → 状态变更 → 文本反馈。
3) **城市规则加载**：应用城主参数到 PVP/掉落/税费/门禁；每城至少 1 个提现点。
4) **事件/广播**：统治者/城主发布公告；简单动态事件（补给、巡逻、危机）。
5) **死亡&掉落**：野外至少部分或全掉落；城内由城主覆盖。
6) **日志**：行动链、城市参数快照、事件日志，便于回放/调试。

---

## 8) 服务端系统草图 (Server Sketch)
- **State**：世界图、实体属性、玩家状态、城市参数存储、经济余额、日志。
- **Rules Engine**：按城市/野外参数解析并结算行动。
- **LLM 层**：
  - Player LLM：intent→plan→risk。
  - Ruler LLM：宏观事件/广播（可选全局兜底）。
  - Lord LLM：城市参数选择/更新，本地事件与执法风格。
- **执行管线**：
  1) Input Text  
  2) Player LLM → {intent, targets, path, risk}  
  3) Apply Rules (city/wild)  
  4) Mutate State  
  5) Sensory Render (text)  
  6) Log
- **可扩展性**：参数数据驱动，字段可增量添加；规则热更新。

---

## 9) 高风险 / 无安全网 提示
- 城外：抢劫/伏击完全允许，高收益高风险。
- 不做全局 AML/反作弊；货币和物品可被劫走。
- “安全”只取决于城主愿意投入的守卫/规则；提现点保护范围和时窗由城主定义。

---

## 10) 开发路线图 (Suggested)
- **P0**：文本循环、世界图、玩家 LLM、1 城 + 城主参数、1 提现点、基础战斗/交易、野外掉落。
- **P1**：多城、多提现点、城主委派、副本/围攻/任命或竞拍城主、事件/广播、仓储/保险开关。
- **P2**：遗嘱/继承/转生，丰富市场（拍卖/P2P 限制），可配置巡逻/守卫，提现分档。
- **P3**：高级事件、派系政治、赛季奖池、创作者/子世界 Hook。
- **P4**：GUI/客户端（可选），性能与并发优化，更多内容管线。

---

## 11) 协作 (Contribution)
- 欢迎提出/实现：参数 schema 扩展、事件类型、新的规则结算方式。
- 保持服务端决定性（deterministic）；LLM 产出的是 plan，最终结算在服务器。
- 提交日志/回放工具，方便解释“为什么我被抢/被税/被杀/被拒赔”。

---

## 12) 快问快答 (FAQ)
- **为什么纯文本？** 快速上线、设备门槛低，LLM 擅长叙事/规划。  
- **城里安全吗？** 取决于城主投入和规则；可以非常安全，也可以很狠。  
- **能提现吗？** 能，在指定提现点；费用和安全由城主设定。  
- **谁定规则？** 城主（玩家或 NPC+LLM）；统治者只做宏观/兜底。  

---

## 13) 超开放 LLM 优先原则 (LLM-First, Open World)
- **LLM 写规则/模块**：游戏内决策（统治者/城主/玩家代理）最终映射为可执行的“规则片段”或“处理器”，由对应的 LLM 生成/改写，服务器只做装载与沙箱执行。
- **开发者只留接口**：底层提供最小内核（状态存储、事件路由、日志、沙箱执行、安全限速），其它规则/参数/事件逻辑交给 LLM 产出；接口风格保持数据驱动，避免硬编码。
- **插件化/热插拔**：规则片段以清晰 ABI（输入=上下文，输出=状态变更+文本反馈+消耗）注册，可随时热更新；版本化与回滚由内核负责。
- **安全与决定性**：LLM 仅生成方案/代码，执行前由内核做静态/动态审计（资源配额、禁用危险调用、强制 RNG 种子）以保持决定性；失败则回退并记录。
- **可见性与争议处理**：每次加载/执行的 LLM 产物都留存快照（prompt、产出、签名、哈希），配合日志用于申诉和解释“为什么这样裁决”。
- **对齐目标**：尽量少的全局硬约束，更多的本地自治；任何城市、派系或事件都可以用自定义规则片段实现，官方只保证内核健壮、审计可追溯。
- **统治者仲裁一切规则**：全局或本城规则的最终版本由游戏内“统治者”角色决定（可为多 LLM 协商，或未来由玩家夺权后行使）；开发者不写具体规则，只提供承载与审计接口。

---

## 14) 后端框架骨架 (Node/TS)
- **模块**：
  - `src/index.ts`：HTTP 入口，调用玩家 LLM（Deepseek）→ 将 plan 交给引擎。
  - `src/core/state.ts`：世界/城市/房间/玩家的内存状态，`loadDefaultWorld()` 提供示例世界。
  - `src/core/actions.ts`：动作注册表（move/observe/withdraw/attack/trade stub），行动根据城市策略/区域类型决定是否允许与结算。
  - `src/core/engine.ts`：`GameEngine` 持有世界与动作注册表，`applyAction(playerId, plan)` 负责决定性结算。
  - `src/llm/deepseek.ts`：LLM 调用与 JSON 解析。
  - `src/config.ts`：环境变量校验。
- **接口**：`POST /api/session/:playerId/act`，body `{ input: string }`：加载玩家→传上下文（房间+城市策略+玩家状态）给 LLM 得到 plan→调用引擎结算→返回 `{ plan, result }`。`GET /health` 探活。
- **提示词**：约束 LLM 输出 JSON，允许动作 `move/observe/withdraw/attack/trade`；默认建议低/中风险。
- **环境变量**：`.env.example` 里有 `DEESEEK_API_KEY`、`DEESEEK_BASE_URL`、`DEESEEK_MODEL`、`PORT`。需 Node >=18。
- **运行**：`npm install && npm run build && npm start`（或 `npm run dev` 本地热更）。
- **扩展点**：
  1) 在 `actions.ts` 增补城规（税、门禁、守卫响应、掉落规则）和更多动作。
  2) 在 `state.ts` 接入数据库存储与日志表，替换内存实现。
  3) 在 LLM 层加入审计、速率限制、模型切换与多模型协商。

---

## 15) Web 界面（纯静态）
- 路径：`public/index.html`（附 `style.css`），通过 Express 静态资源直接访问根域名即可。
- 用法：在浏览器打开 `http://<服务器>:8787/`，输入玩家 ID、自然语言指令，点击“发送行动”。
- 功能：健康检查按钮；展示 LLM 计划与服务器结算结果；可指定自定义服务器地址（留空则使用当前域名）。

---

## 15) 部署指南（云服务器）
- **前置**：Node 18+；已填好的 `.env`（含 `DEESEEK_API_KEY`）。
- **本地或服务器直接运行**：
  1) `npm install`
  2) `npm run build`
  3) `npm start`
- **Docker 运行**：
  1) 构建：`docker build -t axiom-frontier:latest .`
  2) 运行：`docker run -d --name axiom --env-file .env -p 8787:8787 axiom-frontier:latest`
- **systemd 样例**：见 `deploy/systemd/axiom-frontier.service.example`，放到 `/etc/systemd/system/`，调整路径与密钥后：`sudo systemctl daemon-reload && sudo systemctl enable --now axiom-frontier`。
- **健康探测**：`GET /health` 返回 `{ status: "ok" }`。
- **日志**：当前为 stdout，部署时可用 `journalctl -u axiom-frontier -f` 或 Docker logs 观察。

---
