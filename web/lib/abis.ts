export const MOCK_USDC_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "totalSupply",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const BOND_VAULT_ABI = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "returnTo", type: "address" },
      { name: "verifier", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "limit", type: "uint256" },
      { name: "periodLength", type: "uint64" },
      { name: "challengeWindow", type: "uint64" },
      { name: "mBps", type: "uint32" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    name: "topUp",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "newLimit", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "release",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "deposits",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "agent", type: "address" },
      { name: "returnTo", type: "address" },
      { name: "verifier", type: "address" },
      { name: "bond", type: "uint256" },
      { name: "limit", type: "uint256" },
      { name: "pendingLimit", type: "uint256" },
      { name: "periodStart", type: "uint64" },
      { name: "periodLength", type: "uint64" },
      { name: "challengeWindow", type: "uint64" },
      { name: "mBps", type: "uint32" },
      { name: "periodIndex", type: "uint64" },
      { name: "slashedExcess", type: "uint256" },
      { name: "closed", type: "bool" },
    ],
  },
  {
    name: "currentPeriod",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "index", type: "uint64" },
      { name: "start", type: "uint64" },
      { name: "end", type: "uint64" },
      { name: "limit", type: "uint256" },
    ],
  },
  {
    name: "nextId",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "Deposited",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "returnTo", type: "address", indexed: false },
      { name: "verifier", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "limit", type: "uint256", indexed: false },
      { name: "periodStart", type: "uint64", indexed: false },
      { name: "periodLength", type: "uint64", indexed: false },
      { name: "challengeWindow", type: "uint64", indexed: false },
      { name: "mBps", type: "uint32", indexed: false },
    ],
  },
  {
    name: "Slashed",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "periodIndex", type: "uint64", indexed: true },
      { name: "newExcess", type: "uint256", indexed: false },
      { name: "penalty", type: "uint256", indexed: false },
      { name: "bondLeft", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Returned",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    name: "ToppedUp",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "newBond", type: "uint256", indexed: false },
      { name: "newLimit", type: "uint256", indexed: false },
    ],
  },
] as const;

export const VERIFIER_V0_ABI = [
  {
    name: "pay",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    name: "flag",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    name: "spent",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "periodIndex", type: "uint64" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  // Events
  {
    name: "Spent",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "periodIndex", type: "uint64", indexed: true },
      { name: "to", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "periodTotal", type: "uint256", indexed: false },
    ],
  },
  {
    name: "Flagged",
    type: "event",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "periodIndex", type: "uint64", indexed: true },
      { name: "totalSpent", type: "uint256", indexed: false },
      { name: "limit", type: "uint256", indexed: false },
      { name: "excess", type: "uint256", indexed: false },
      { name: "flagger", type: "address", indexed: true },
    ],
  },
] as const;
