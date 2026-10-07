# BRD: Capital-in-the-Loop

Version 0.1 | TOKEN2049 Origins Hackathon, Singapore (6-8 Oct 2026) | Chain: Base Sepolia (testnet only)
Owner: Polina (data, demo, pitch). Contributor: Phantom (contracts, frontend).

Status legend used in tables:
- **Source seen**: a page we opened or read in search results.
- **Secondary**: reported by an aggregator or vendor, find the primary before quoting.
- **Team claim**: from the team's own research, needs a link or query before it goes on a slide.

## 1. One-liner

Autonomous AI agents already move real money, but nothing economically backs their behavior. Capital-in-the-Loop lets an agent publish an on-chain spending limit and back it with a cash bond. If the agent overspends, anyone can prove it with arithmetic, and the penalty is burned.

## 2. Problem

| # | Problem | Evidence |
|---|---------|----------|
| P1 | Agent reputation is cheap to fake (new identities cost nothing, registries are gameable). | Team claim (Sybil and registry research, ERC-8004 family threads) |
| P2 | Spending policies are private settings with no money behind them. A cap lives in a config file or a provider dashboard, so a counterparty cannot rely on it. | Team claim; x402 security write-ups (Halborn, o-mega) |
| P3 | The industry answer is a hard cap plus a human approving anything above roughly $100 per day. That is de-automation, and human attention does not scale. | Team claim; 63% of leaders now require human validation of agent output (KPMG Q1 2026, secondary) |
| P4 | x402 has no built-in budgets, no refund or dispute path, final settlement, double pay on retry, and no audit trail across agent chains. | Source seen: A2A-x402 issue #60, Halborn, o-mega, Blue Manakin |
| P5 | Without a floor on exposure, nobody can price agent risk, so credit, clearing and insurance markets cannot form. | Team claim (reasoning, not a statistic) |

## 3. Market data and demand

### 3.1 What the volume data says

| Data point | Source | Status |
|------------|--------|--------|
| About $28K daily x402 volume, average payment about $0.20, roughly half of transactions artificial (Mar 2026) | CoinDesk citing Artemis | Source seen |
| Early growth on Base driven largely by meme coin farming | Chainalysis | Source seen |
| Headline: 165M transactions and about $50M cumulative volume by Apr 2026 | eco.com summary of Coinbase figures | Secondary |
| Real AI agent spend only about $5K-11K per month after removing wash and test flows | TRM Labs via spotedcrypto | Secondary (find the TRM original) |
| Volume down about 77%, from $5.15M (Nov 2025) to $1.19M (May 2026). Real demand sits in agent-consumed data and LLM or inference gateways. | x402 Inc (vendor note) | Secondary |
| Agent payment market about $44M nominal, 99% self-payments, real demand under 0.5% | Polina's own Dune query | Team claim, publish the query and link |

### 3.2 Demand for spending controls (adjacent evidence)

These surveys cover AI agents and fiat payments in general, not crypto or x402.

| Finding | Source | Status |
|---------|--------|--------|
| 24% of consumers will never delegate purchases to AI. Top non-negotiables: spending caps 30%, instant revocation 29%, easy cancellation 28%. | Checkout.com, Jun 2026 | Source seen |
| 80% of consumers open to AI shopping would let an agent play some role in payment, but most want limits. Few will give full authority. | Worldpay Agentic Commerce Report 2026 (7 markets incl. Singapore) | Source seen |
| 87% of organizations encourage agent use, only 47% have clear governance and controls. | OneTrust 2026 (1,200+ leaders) | Source seen |
| 52.4% plan to spend more on agent cost-management tools, 62.4% on tools that monitor agent actions. | AvePoint State of AI 2026 (750 IT leaders) | Source seen |
| Only 20% trust agents with financial transactions. | PwC AI Agent Survey (2025) | Source seen (older) |
| Over 40% of agentic AI projects forecast to be cancelled by 2027 on cost, unclear value or weak risk controls. | Gartner via gravity.fast | Secondary |

### 3.3 Honest reading

- The need for enforceable controls is well supported by surveys.
- Real x402 buyer volume is small and mostly synthetic, so the market is early.
- Pitch framing: this is the primitive that has to exist before agent payment volume scales. Do not claim a large current market.

## 4. Who needs it

| Segment | Pain | What they get |
|---------|------|---------------|
| Agent operators | Stuck at a low cap with a human approving the rest | The bond turns the cap into a credit limit, so spend above it can be allowed |
| API providers selling to agents | Cannot tell which agent is good for the money | A public, bond-backed ceiling per agent |
| Facilitators (Coinbase, Cloudflare class) | Carry settlement risk | Verifiable commitments from counterparties |
| Underwriters, insurers, agent registries | Cannot price risk with no floor, reputation is gameable | A capital-weighted signal where unsecured volume counts as zero |

## 5. Differentiation

| Existing approach | Gap | Capital-in-the-Loop |
|-------------------|-----|---------------------|
| Private wallet caps (agent wallets with spending caps from big providers) | Private setting, not a public commitment | Public on-chain declaration backed by the agent's own capital |
| Client-side policy wrappers for x402 (PaySentry, PolicyLayer type tools) | Enforced by the operator, counterparties cannot rely on them | Economic consequence visible to everyone |
| Bond and slashing systems (EigenLayer style, t54) | Rely on a human judge or committee | Overspend proven by arithmetic, no oracle, no judge |
| Reputation registries (ERC-8004 family) | Gameable | Volume without a bond carries zero weight in the index |

Competitor claims are Team claims. Verify each against its source code or docs before the pitch.

## 6. Business model (hypotheses, not built)

The penalty is burned, so the protocol has no beneficiary by design. Possible value capture later: data and scoring API on top of the index, integrations with facilitators, pricing data for insurers.

## 7. Objectives and success criteria

Hackathon:
1. End-to-end demo works: declare, bond, spend, overspend, flag, burn visible on Basescan.
2. Main invariant fuzzed: funds only ever return to the fixed return address or are burned.
3. Contracts deployed and verified on Base Sepolia.
4. Every number on a slide has a source link.
5. Submission complete before 23:59 on 7 Oct.

Later KPIs: bonded agents, bonded volume, share of agent volume that is secured, violations proven per period.

## 8. Scope boundaries and assumptions

- Testnet only, mock USDC, no real funds.
- Full inclusion-proof coverage is out of scope for v0 and is marked "in development".
- Base is not a partner track, so we compete in the main track only.
- All code is written during the 36-hour window. Specs and designs made earlier are fine, code is not.

## 9. Risks and open questions

| Risk or question | Owner | Mitigation |
|------------------|-------|------------|
| Market numbers on slides are unverified | Polina | Publish the Dune query, link every source, drop what cannot be sourced |
| Agent can pay from an address the verifier does not watch | Both | State the limit openly, "in development", show the roadmap |
| Judges ask why a bond and not a hard cap | Polina | Caps are private and block upside. A bond is a public commitment that allows a higher limit |
| Why burn, not pay the flagger | Polina | No beneficiary means no incentive to entrap agents. Flagger incentive is a roadmap item |
| Scope too large for 2 people in 36 hours | Both | Follow the cut list in PRD section 8 |

## 10. Sources

Volume and demand
- https://www.coindesk.com/markets/2026/03/11/coinbase-backed-ai-payments-protocol-wants-to-fix-micropayment-but-demand-is-just-not-there-yet
- https://www.chainalysis.com/blog/x402-agentic-payments-adoption/
- https://www.spotedcrypto.com/trm-labs-x402-ai-agent-payments-report-2026/
- https://note.com/x402inc/n/nfd6227f13b55?hl=en-US
- https://eco.com/support/en/articles/14839402-x402-protocol-explained
- https://majormatters.co/x402

Problems
- https://github.com/google-agentic-commerce/a2a-x402/issues/60
- https://www.halborn.com/blog/post/x402-explained-security-risks-and-controls-for-http-402-micropayments
- https://o-mega.ai/articles/x402-the-ai-agent-payments-guide-2026
- https://thebluemanakin.com/en/blog/x402-irreversible-payments-for-ai-agents-that-still-break/
- https://dev.to/l_x_1/securing-the-x402-protocol-why-autonomous-agent-payments-need-spending-controls-a90
- https://dev.to/mkmkkkkk/x402-v2-security-deep-dive-new-attack-vectors-in-ai-agent-payments-2cp2

Surveys
- https://www.checkout.com/newsroom/consumer-demand-for-ai-shopping-is-forming-fast-but-trust-for-agentic-commerce-is-still-catching-up
- https://worldpay.com/en/insights/articles/agentic-commerce-report-2026-out-now
- https://www.onetrust.com/resources/onetrust-2026-ai-ready-governance-report/
- https://www.avepoint.com/blog/manage/state-of-ai-2026-report
- https://www.pwc.com/us/en/tech-effect/ai-analytics/ai-agent-survey.html
- https://gravity.fast/blog/ai-agent-adoption-statistics-2026/