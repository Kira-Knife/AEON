// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// ÆON — capital-in-the-loop, demo version (Base Sepolia).
/// An agent declares a spending limit X for a period and locks bond = K * X.
/// If it spends more than X, ANYONE calls flag(); the contract re-checks the
/// arithmetic and burns M * excess from the bond. No owner, no admin, no oracle.
///
/// Deploy ONLY BondVault (constructor: token address). It deploys its own
/// Verifier; read its address from the `verifier()` getter.

contract BondVault {
    IERC20  public immutable token;
    Verifier public immutable verifier;

    uint256 public constant K = 1;                 // bond = K * limit
    uint256 public constant M = 1;                 // penalty = M * excess
    uint64  public constant CHALLENGE_WINDOW = 600; // 10 min after period end
    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    struct Deposit {
        address depositor;
        uint256 bond;
        uint256 limit;
        uint64  periodEnd;
        bool    slashed;
        bool    released;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Deposit) public deposits;
    mapping(uint256 => mapping(address => bool)) public isLinked;

    event Declared(uint256 indexed depositId, address indexed depositor, uint256 bond, uint256 limit, uint64 periodEnd);
    event WalletLinked(uint256 indexed depositId, address wallet);
    event ToppedUp(uint256 indexed depositId, uint256 amount, uint256 newBond, uint256 newLimit);
    event Slashed(uint256 indexed depositId, uint256 excess, uint256 penalty, uint256 remaining);
    event Released(uint256 indexed depositId, uint256 amount);

    constructor(IERC20 _token) {
        token = _token;
        verifier = new Verifier(this);
    }

    /// Publish limit X for `periodSeconds` and lock K*X. Needs approve(vault, K*X) first.
    function declare(uint256 limit, uint64 periodSeconds) external returns (uint256 id) {
        require(limit > 0 && periodSeconds > 0, "bad params");
        uint256 bond = limit * K;
        require(token.transferFrom(msg.sender, address(this), bond), "transfer failed");
        id = nextId++;
        uint64 end = uint64(block.timestamp) + periodSeconds;
        deposits[id] = Deposit(msg.sender, bond, limit, end, false, false);
        isLinked[id][msg.sender] = true;
        emit Declared(id, msg.sender, bond, limit, end);
    }

    /// Add another wallet whose payments count toward the same limit.
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

    /// Only the Verifier can slash, and only after it re-checked spent > limit.
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

    function info(uint256 id) external view returns (address depositor, uint256 limit, uint64 periodEnd, bool slashed, bool released) {
        Deposit storage d = deposits[id];
        return (d.depositor, d.limit, d.periodEnd, d.slashed, d.released);
    }
}

contract Verifier {
    BondVault public immutable vault;
    mapping(uint256 => uint256) public spent;

    event Payment(uint256 indexed depositId, address indexed from, address indexed to, uint256 amount, uint256 spentTotal);
    event Violation(uint256 indexed depositId, uint256 spent, uint256 limit);

    constructor(BondVault _vault) { vault = _vault; }

    /// Agent pays through here so spending is counted. Needs approve(verifier, amount) first.
    function pay(uint256 depositId, address to, uint256 amount) external {
        (, , uint64 periodEnd, , ) = vault.info(depositId);
        require(vault.isLinked(depositId, msg.sender), "wallet not linked");
        require(block.timestamp < periodEnd, "period over");
        require(vault.token().transferFrom(msg.sender, to, amount), "transfer failed");
        spent[depositId] += amount;
        emit Payment(depositId, msg.sender, to, amount, spent[depositId]);
    }

    /// Anyone can call. Reverts unless spent > limit. No judgment — just arithmetic.
    function flag(uint256 depositId) external {
        (, uint256 limit, uint64 periodEnd, bool slashed, bool released) = vault.info(depositId);
        require(!slashed && !released, "closed");
        require(block.timestamp < periodEnd + vault.CHALLENGE_WINDOW(), "window over");
        uint256 s = spent[depositId];
        require(s > limit, "no violation");
        emit Violation(depositId, s, limit);
        vault.slash(depositId, s - limit);
    }
}
