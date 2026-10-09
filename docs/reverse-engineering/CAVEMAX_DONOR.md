# CAVEMAX donor dossier

Tracking issue: #60  
Portfolio branch: `codex/token-saving-portfolio-20261006`  
Donor: `Nixus-security/Cavemax-Skills`  
Source snapshot: `17cef823a48dcb7be6e210f4da9137e5f5cba36e`  
Observed release: `0.1.0` on 2026-10-06  
License: MIT

## Decision

CAVEMAX is a useful **response-density policy donor**, not a standalone product to clone.

Token Intelligence should absorb the measurable behavior pattern behind it:

- configurable response-density profiles;
- explicit classes that must remain exact;
- policy-persistence/drift evidence;
- automatic fallback to clearer output for ambiguity or high-risk content;
- full-session token economics that charge instruction overhead, retries and clarification turns;
- quality-gated paired evaluation before any savings claim.

Do **not** copy CAVEMAX branding, mode names, glyph dictionary, installer, hooks, statusline, command syntax or generated agent-rule files.

## 1. Source identification

### Canonical sources

- Reddit launch post: `https://www.reddit.com/r/claudeskills/comments/1wz1qgn/`
- Canonical repository: `https://github.com/Nixus-security/Cavemax-Skills`
- Exact source snapshot reviewed: `17cef823a48dcb7be6e210f4da9137e5f5cba36e`
- Ruleset source of truth: `skills/cavemax/SKILL.md`
- Claude Code persistence hooks: `src/hooks/cavemax-activate.js`, `src/hooks/cavemax-tracker.js`
- Security disclosure: `SECURITY.md`

Source identity is **verified**.

## 2. Evidence collection

Observed from source, rather than accepted as marketing claims:

1. CAVEMAX is primarily a prompt/rules intervention. It instructs the model to remove filler, articles, hedging, repetition and connective prose while using denser syntax.
2. It defines multiple density levels and an off path.
3. It explicitly exempts code blocks, error strings, identifiers/API names, file paths, commands/flags, numbers/versions, security warnings, irreversible-action confirmations and order-sensitive sequences from compression.
4. Claude Code uses a `SessionStart` hook plus `UserPromptSubmit` hook so the active policy can be reinforced across turns.
5. The active state is stored as a small local flag; the security document says the runtime scripts do not make network requests and do not store prompts.
6. Cursor, Gemini CLI and Codex receive generated/native rule files instead of Claude-specific hook persistence.
7. The project itself states that its tests cover rules, hooks, installation and a preservation heuristic, **not model behavior**.
8. The project explicitly says the technique is not a safety boundary and may not always be followed by the model.

### Upstream claims that remain unverified by Token Intelligence

- ~70% reduction for the readable/safe-style profile.
- ~85–90% reduction for the default aggressive profile.
- ~90%+ reduction for its most compressed profile.
- “zero accuracy loss.”

These remain donor claims until paired Token Intelligence session receipts and outcome-equivalent evaluation prove them independently.

## 3. Product / user workflow reconstruction

Observed donor workflow:

1. User installs the local package/rules.
2. A target coding agent receives the response-density instruction in its native configuration surface.
3. In Claude Code, user activates or changes a mode and a local flag stores the current state.
4. Each prompt submission re-injects a compact policy reminder while the mode remains active.
5. Model attempts to answer with less redundant prose while preserving selected exact-content classes.
6. User can switch back to normal output when needed.
7. For security, destructive actions, ambiguity or order-sensitive instructions, the rules request a temporary return to plain language.

The economically relevant unit is therefore **the whole successful session**, not one reply.

## 4. Capability and failure-mode decomposition

### Useful capability primitives

- response-density policy profile;
- profile activation/deactivation;
- policy persistence across turns;
- preservation-class contract;
- clarity fallback / risk override;
- output-token measurement;
- session-token measurement;
- clarification/retry accounting;
- quality-equivalence gate.

### Failure modes

1. **Prompt drift** — model gradually ignores density rules.
2. **Instruction overhead** — repeatedly injecting the policy consumes input tokens and can erase visible output savings.
3. **Ambiguity regression** — aggressive shorthand causes clarification turns or incorrect interpretation.
4. **Critical-content loss** — errors, paths, numbers, commands or warnings are abbreviated or omitted.
5. **Quality regression hidden by shortness** — fewer tokens look good while the task outcome gets worse.
6. **Readability failure** — dense notation becomes expensive for humans even when model token use falls.
7. **Provider/tool variance** — persistence strength differs because Claude Code has hooks while other tools rely on static rule files.
8. **Safety misclassification** — a high-risk response stays terse when it should expand.
9. **False economics** — output-only percentage is presented as session savings without counting input, retries or rework.
10. **Installer/config interference** — modifying shared agent settings can conflict with another hook or ruleset.

## 5. User feedback and pain-point analysis

The launch post is same-day and public feedback is still sparse. The author explicitly asks for examples where compression loses information or becomes unclear. The visible launch discussion does not yet provide a meaningful failure corpus.

That absence is itself an evidence constraint: do not infer broad user acceptance from launch engagement.

Adjacent Reddit discussions around token-saving skills show recurring questions and concerns that are relevant to our evaluation design:

- whether behavior remains effective in subagents;
- whether these tools are merely prompt bundles rather than real optimization layers;
- readability / “AI slop” concerns;
- whether tool-output waste matters more than response prose;
- whether claimed savings include the whole session.

These become explicit benchmark dimensions rather than informal comments.

## 6. Competitive comparison

### CAVEMAX

Strength: explicit response-density contract, preservation floor, multi-level density, opt-out, anti-drift reinforcement.

Weakness: prompt-level; visible-reply compression is not equivalent to full-session token savings; model compliance is not mechanically enforced.

### RDXmin

Observed public positioning adds tool-output/log compression, ANSI stripping, duplicate-output removal and prose/YAGNI policies. This covers token sources CAVEMAX does not directly reduce. Its public discussion also illustrates the need to separate original capability from bundled prompt ideas and to benchmark subagent behavior.

### current Caveman line

Current public Caveman materials extend beyond terse prose into typed tool-output compression, context packing, browsing/context reduction, recoverability and full accounting. That makes it a broader session-economics comparator than CAVEMAX.

### Portfolio conclusion

CAVEMAX should not become “Token Intelligence Cavemax.” Its differentiating idea belongs as one experimentable policy family alongside tool-output reduction, context virtualization, prompt/context compression, repository retrieval, caching and routing.

## 7. Existing internal primitive audit

Reuse from Token Intelligence / current portfolio branch:

- canonical run and usage receipts;
- paired before/after experiment semantics;
- output-reduction evidence gates;
- retry and reducer-overhead accounting;
- quality gates;
- required-signal preservation checks;
- verified-savings non-claim rules;
- existing policy/gateway surfaces;
- existing benchmark-integrity and harness evidence work.

New bounded primitive added for this donor:

- `src/lib/optimization/response-density-policy.ts`

It evaluates prompt/rules-based response-density interventions separately from mechanical tool-output reducers.

## 8. Product thesis and target boundary

### Thesis

Token Intelligence should answer:

> “Does a denser response policy reduce **successful-session** token use without losing required information, increasing clarification/retries, or reducing task quality?”

### In scope

- owned response-density profile metadata;
- policy version identity;
- density level;
- preservation classes;
- persistence verification;
- baseline/candidate output tokens;
- baseline/candidate session tokens;
- instruction overhead;
- retry tokens;
- clarification-turn delta;
- outcome-equivalent quality result;
- claimability decision.

### Out of scope

- cloning CAVEMAX mode names or glyph dictionary;
- copying its prompt text;
- copying its installer or agent-specific hooks;
- changing user config files merely to reproduce donor behavior;
- claiming donor percentages as ours;
- treating prompt instructions as a security enforcement mechanism.

## 9. Behavior contracts and acceptance tests

Implemented clean-room contract requirements:

1. Shorter visible replies alone produce `output_reduction_only`, never verified savings.
2. Instruction overhead and retry tokens are charged to the candidate session.
3. Missing required exact-content classes fail closed.
4. Policy persistence must be verified across the evaluated session.
5. Extra clarification turns are treated as an ambiguity regression.
6. Task-quality failure blocks promotion even when token counts improve.
7. Historical observations and modeled estimates remain candidates, not proof.
8. A minimum comparable sample cohort is required.
9. Only paired measured full-session evidence can become `verified_savings`.

Tests: `tests/response-density-policy.test.ts`.

## 10. Clean-room implementation

Started on the existing portfolio branch.

Implemented:

- `ResponseDensityCandidate` evidence contract;
- `ResponseDensityEvaluation` result contract;
- full-session economics with policy-overhead and retry accounting;
- preservation-class failure detection;
- persistence/drift gate;
- ambiguity/clarification regression gate;
- quality and evidence-type gates;
- deterministic savings calculations;
- negative and positive tests.

This implementation contains no donor prompt text, command syntax, installer code, hook code, branding or copied dictionary.

## 11. Independent verification

Pending after hosted CI runs on the exact new head. Required checks:

- repository test suite;
- TypeScript/build checks required by the repo;
- exact-head CI status;
- independent review that no donor-specific source text or behavior claim was copied as product proof.

## 12. Hosted/browser/recovery certification

Not yet applicable to the evidence-contract slice. No new hosted UI or production configuration is claimed.

When a user-facing Response Density experiment surface is added, certification must include:

- profile on/off recovery;
- stale/unknown policy version behavior;
- failed quality gate visibility;
- no “verified savings” badge from output-only evidence;
- browser/API evidence tied to the exact deployed SHA.

## 13. Evidence-backed tracker update

Current disposition: **integrated capability candidate; implementation started, verification pending**.

Do not mark CAVEMAX complete, parity-achieved, production-ready or savings-verified until stages 11–12 produce exact-head evidence.

## Next bounded slice

1. Enroll CAVEMAX in the machine donor registry as a verified source identity.
2. Wire `ResponseDensityEvaluation` into the existing experiment/verified-savings evidence path.
3. Add paired synthetic workloads for readable vs dense response policies.
4. Add critical-content fixtures covering errors, commands, file paths, versions, warnings and ordered procedures.
5. Add subagent/multi-turn drift workloads.
6. Run full-session benchmarks against baseline, response-density-only, tool-output-reduction-only and combined policies without summing overlapping savings.
