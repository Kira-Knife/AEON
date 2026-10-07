// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// ÆON v1 — a separate deployment, not an upgrade of v0.
///
/// v0 (AEON.sol) stays exactly where it is and keeps working. A version here is a
/// deployment, not a flag: BondVaultV1 deploys its own VerifierV1 in the constructor,
/// both are immutable, and neither has an owner, a role or a pause. Nothing in v0 is
/// touched, so nothing already deployed, indexed or recorded can break.
///
/// What changes against v0. The v0 verifier only counts payments routed through its own
/// pay(), so a transfer straight from the agent's wallet is invisible. v1 counts the
/// agent's own EIP-3009 authorizations instead: the signature the agent produced for an
/// x402-style payment is the evidence, whoever submits it.
///
/// Where the evidence comes from. The payee holds the signed authorization — it is what
/// it presented to the token to get paid. A payee that wants the agent's bond to mean
/// anything has every reason to publish it. The contract does not care who submits.
///
/// Deploy ONLY BondVaultV1 (constructor: token address) and read verifier() for the other.

contract BondVaultV1 {
    IERC20 public immutable token;
    VerifierV1 public immutable verifier;

    uint256 public constant K = 1;                  // bond = K * limit
    uint256 public constant M = 1;                  // penalty = M * excess
    uint64  public constant CHALLENGE_WINDOW = 600; // 10 min after period end
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    struct Deposit {
        address depositor;
        uint256 bond;
        uint256 limit;
        uint64  periodStart; // v1 needs it: an authorization is tied to the period by its own validity window
        uint64  periodEnd;
        bool    slashed;
        bool    released;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Deposit) public deposits;
    mapping(uint256 => mapping(address => bool)) public isLinked;

    event Declared(uint256 indexed depositId, address indexed depositor, uint256 bond, uint256 limit, uint64 periodStart, uint64 periodEnd);
    event WalletLinked(uint256 indexed depositId, address wallet);
    event ToppedUp(uint256 indexed depositId, uint256 amount, uint256 newBond, uint256 newLimit);
    event Slashed(uint256 indexed depositId, uint256 excess, uint256 penalty, uint256 remaining);
    event Released(uint256 indexed depositId, uint256 amount);

    constructor(IERC20 _token) {
        token = _token;
        verifier = new VerifierV1(this);
    }

    /// Publish limit X for `periodSeconds` and lock K*X. Needs approve(vault, K*X) first.
    function declare(uint256 limit, uint64 periodSeconds) external returns (uint256 id) {
        require(limit > 0 && periodSeconds > 0, "bad params");
        uint256 bond = limit * K;
        require(token.transferFrom(msg.sender, address(this), bond), "transfer failed");
        id = nextId++;
        uint64 start = uint64(block.timestamp);
        uint64 end = start + periodSeconds;
        deposits[id] = Deposit(msg.sender, bond, limit, start, end, false, false);
        isLinked[id][msg.sender] = true;
        emit Declared(id, msg.sender, bond, limit, start, end);
    }

    /// Add another wallet whose authorizations count toward the same limit.
    function linkWallet(uint256 id, address wallet) external {
        Deposit storage d = deposits[id];
        require(msg.sender == d.depositor, "not depositor");
        require(!d.slashed && !d.released, "closed");
        isLinked[id][wallet] = true;
        emit WalletLinked(id, wallet);
    }

    /// More bond -> higher limit (limit = bond / K). Needs approve first.
    function topUp(uint256 id, uint256 amount) external {
        Deposit storage d = deposits[id];
        require(msg.sender == d.depositor, "not depositor");
        require(!d.slashed && !d.released && block.timestamp < d.periodEnd, "closed");
        // Can't raise the limit after overspending to escape flag().
        require(verifier.spent(id) <= d.limit, "already over limit");
        require(token.transferFrom(msg.sender, address(this), amount), "transfer failed");
        d.bond += amount;
        d.limit = d.bond / K;
        emit ToppedUp(id, amount, d.bond, d.limit);
    }

    /// Only this vault's verifier can slash, and only after it re-checked spent > limit.
    function slash(uint256 id, uint256 excess) external {
        require(msg.sender == address(verifier), "only verifier");
        Deposit storage d = deposits[id];
        require(!d.slashed && !d.released, "closed");
        d.slashed = true;
        uint256 penalty = excess * M;
        if (penalty > d.bond) penalty = d.bond;
        d.bond -= penalty;
        require(token.transfer(BURN, penalty), "burn failed");
        emit Slashed(id, excess, penalty, d.bond);
    }

    /// After period end + challenge window, the depositor gets the rest back.
    function release(uint256 id) external {
        Deposit storage d = deposits[id];
        require(msg.sender == d.depositor, "not depositor");
        require(!d.released, "already released");
        require(block.timestamp >= d.periodEnd + CHALLENGE_WINDOW, "wait");
        d.released = true;
        uint256 amount = d.bond;
        d.bond = 0;
        require(token.transfer(d.depositor, amount), "transfer failed");
        emit Released(id, amount);
    }

    function info(uint256 id)
        external view
        returns (address depositor, uint256 limit, uint64 periodStart, uint64 periodEnd, bool slashed, bool released)
    {
        Deposit storage d = deposits[id];
        return (d.depositor, d.limit, d.periodStart, d.periodEnd, d.slashed, d.released);
    }
}

interface IERC3009 {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

contract VerifierV1 {
    BondVaultV1 public immutable vault;

    // keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 public constant TRANSFER_TYPEHASH =
        0x7c7c6cdb67a18743f49ec6fa9b35f50d52ed05cbed4cc592e13b44501c1a2267;
    // keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
    bytes32 public constant RECEIVE_TYPEHASH =
        0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8;
    // secp256k1n / 2 — signatures above this are the malleable twin of a valid one
    uint256 private constant HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    mapping(uint256 => uint256) public spent;                    // depositId => counted total
    mapping(address => mapping(bytes32 => bool)) public counted;  // signer => nonce => already counted

    event Counted(uint256 indexed depositId, address indexed signer, address indexed to, uint256 value, bytes32 nonce, uint256 spentTotal);
    event Violation(uint256 indexed depositId, uint256 spent, uint256 limit);

    struct Auth {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8   v;
        bytes32 r;
        bytes32 s;
        bool    isReceive; // the agent signed ReceiveWithAuthorization rather than Transfer
    }

    constructor(BondVaultV1 _vault) { vault = _vault; }

    /// Submit one executed authorization as evidence. Anyone may call this.
    function submit(uint256 depositId, Auth calldata a) public {
        (, , uint64 periodStart, uint64 periodEnd, bool slashed, bool released) = vault.info(depositId);
        require(!slashed && !released, "closed");
        require(block.timestamp < periodEnd + vault.CHALLENGE_WINDOW(), "window over");

        // The token records THAT an authorization was executed, never WHEN. The signature's
        // own validity window is what ties the payment to this period: an authorization that
        // could only be valid inside [periodStart, periodEnd] could only have run inside it.
        require(a.validAfter >= periodStart, "before period");
        require(a.validBefore <= periodEnd, "after period");

        require(uint256(a.s) <= HALF_N, "malleable s");
        require(a.v == 27 || a.v == 28, "bad v");

        bytes32 structHash = keccak256(abi.encode(
            a.isReceive ? RECEIVE_TYPEHASH : TRANSFER_TYPEHASH,
            a.from, a.to, a.value, a.validAfter, a.validBefore, a.nonce
        ));
        address tok = address(vault.token());
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", IERC3009(tok).DOMAIN_SEPARATOR(), structHash));

        address signer = ecrecover(digest, a.v, a.r, a.s);
        require(signer != address(0) && signer == a.from, "bad signature");
        require(vault.isLinked(depositId, signer), "wallet not linked");

        // Proof the money actually moved: the token marks the nonce used on execution.
        require(IERC3009(tok).authorizationState(signer, a.nonce), "not executed");

        require(!counted[signer][a.nonce], "already counted");
        counted[signer][a.nonce] = true;

        uint256 total = spent[depositId] + a.value;
        spent[depositId] = total;
        emit Counted(depositId, signer, a.to, a.value, a.nonce, total);
    }

    /// An overspend is usually many small payments, so the batch is the normal path.
    function submitBatch(uint256 depositId, Auth[] calldata list) public {
        for (uint256 i = 0; i < list.length; i++) submit(depositId, list[i]);
    }

    /// Anyone can call. Reverts unless spent > limit. No judgment — just arithmetic.
    function flag(uint256 depositId) public {
        (, uint256 limit, , uint64 periodEnd, bool slashed, bool released) = vault.info(depositId);
        require(!slashed && !released, "closed");
        require(block.timestamp < periodEnd + vault.CHALLENGE_WINDOW(), "window over");
        uint256 sp = spent[depositId];
        require(sp > limit, "no violation");
        emit Violation(depositId, sp, limit);
        vault.slash(depositId, sp - limit);
    }

    /// Evidence and the flag in one transaction, so a flagger needs no second call.
    function submitAndFlag(uint256 depositId, Auth[] calldata list) external {
        submitBatch(depositId, list);
        flag(depositId);
    }
}
