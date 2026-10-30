// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVenue} from "./interfaces/IVenue.sol";
import {IERC20Minimal} from "./interfaces/IERC20Minimal.sol";
import {SafeTransferLib} from "./libraries/SafeTransferLib.sol";

/// StreamPilot vault: an AI agent (or the INVEST keeper) can only touch capital streamed so far.
/// Unstreamed capital stays in the owner's wallet; `accrue` pulls what is owed via transferFrom.
contract StreamVault {
    using SafeTransferLib for address;

    enum Mode {
        AGENT,
        INVEST
    }

    struct Risk {
        uint16 maxSlippageBps; // minAmountOut must be >= venue.quote * (1 - maxSlippageBps/1e4)
        uint16 maxTradeBps; // amountIn value (in base) <= equity * maxTradeBps / 1e4
        uint16 maxDrawdownBps; // equity < highWaterMark*(1 - dd) => halted = true (0 = breaker disabled)
        uint32 cooldownSec; // min seconds between agent trades
    }

    struct StreamView {
        uint256 id;
        address owner;
        address agent;
        address baseToken;
        address targetToken;
        uint8 mode;
        uint128 ratePerSec;
        uint64 startTime;
        uint64 endTime;
        uint128 maxTotal;
        uint128 totalStreamed;
        uint64 lastAccrual;
        uint64 lastTradeAt;
        bool paused;
        bool halted;
        bool cancelled;
        uint256 highWaterMark;
        Risk risk;
    }

    // ---- events (spec) ----
    event StreamCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed agent,
        uint8 mode,
        address baseToken,
        address targetToken,
        uint128 ratePerSec
    );
    event Accrued(uint256 indexed id, uint256 pulled, uint256 totalStreamed);
    event Traded(
        uint256 indexed id, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, bytes32 reasonHash
    );
    event Invested(uint256 indexed id, address tokenOut, uint256 amountIn, uint256 amountOut);
    event Paused(uint256 indexed id);
    event Resumed(uint256 indexed id);
    event Halted(uint256 indexed id, uint256 equity, uint256 highWaterMark);
    event RateChanged(uint256 indexed id, uint128 ratePerSec);
    event Withdrawn(uint256 indexed id, address token, uint256 amount, address to);
    event Cancelled(uint256 indexed id);

    // ---- errors (spec) ----
    error NotAgent();
    error NotOwner();
    error WrongMode();
    error StreamPaused();
    error StreamHalted();
    error StreamCancelled();
    error TokenNotAllowed();
    error Cooldown();
    error TradeTooLarge();
    error SlippageTooLoose();
    error InsufficientBalance();
    // ---- extra errors ----
    error NotAdmin();
    error NoStream();
    error InvalidParams();
    error Reentrancy();

    address public immutable venue;
    address public immutable admin;

    uint256 public nextId = 1; // stream ids start at 1
    mapping(uint256 => StreamView) internal _streams;
    mapping(address => uint256[]) internal _streamsOf;
    mapping(uint256 => mapping(address => uint256)) internal _bal;

    mapping(address => bool) public isAllowed;
    address[] internal _tokenList; // every token ever allowed (for cancel sweeps)
    mapping(address => bool) internal _listed;

    uint256 private _lock = 1;

    constructor(address venue_) {
        venue = venue_;
        admin = msg.sender;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier onlyStreamOwner(uint256 id) {
        if (_streams[id].owner == address(0)) revert NoStream();
        if (_streams[id].owner != msg.sender) revert NotOwner();
        _;
    }

    // ------------------------------------------------------------------ admin

    function setAllowedToken(address token, bool allowed) external {
        if (msg.sender != admin) revert NotAdmin();
        if (token == address(0)) revert InvalidParams();
        isAllowed[token] = allowed;
        if (!_listed[token]) {
            _listed[token] = true;
            _tokenList.push(token);
        }
    }

    // -------------------------------------------------------------- lifecycle

    function createStream(
        address agent,
        address baseToken,
        address targetToken,
        uint8 mode,
        uint128 ratePerSec,
        uint64 durationSec,
        uint128 maxTotal,
        Risk calldata risk
    ) external nonReentrant returns (uint256 id) {
        if (mode > uint8(Mode.INVEST) || baseToken == address(0) || ratePerSec == 0) revert InvalidParams();
        if (targetToken == baseToken) revert InvalidParams();
        if (targetToken != address(0) && !isAllowed[targetToken]) revert TokenNotAllowed();
        if (mode == uint8(Mode.INVEST) && targetToken == address(0)) revert TokenNotAllowed();
        _validateRisk(risk);

        id = nextId++;
        StreamView storage s = _streams[id];
        s.id = id;
        s.owner = msg.sender;
        s.agent = agent;
        s.baseToken = baseToken;
        s.targetToken = targetToken;
        s.mode = mode;
        s.ratePerSec = ratePerSec;
        s.startTime = uint64(block.timestamp);
        s.endTime = durationSec == 0 ? 0 : uint64(block.timestamp) + durationSec;
        s.maxTotal = maxTotal;
        s.lastAccrual = uint64(block.timestamp);
        s.risk = risk;
        _streamsOf[msg.sender].push(id);
        emit StreamCreated(id, msg.sender, agent, mode, baseToken, targetToken, ratePerSec);
    }

    function pause(uint256 id) external nonReentrant onlyStreamOwner(id) {
        StreamView storage s = _streams[id];
        if (s.cancelled) revert StreamCancelled();
        _accrue(id);
        s.paused = true;
        emit Paused(id);
    }

    /// Unpauses, clears `halted`, resets the high-water mark to current equity.
    function resume(uint256 id) external nonReentrant onlyStreamOwner(id) {
        StreamView storage s = _streams[id];
        if (s.cancelled) revert StreamCancelled();
        if (s.paused) {
            s.paused = false;
            s.lastAccrual = uint64(block.timestamp); // time while paused never accrues
        } else {
            _accrue(id);
        }
        s.halted = false;
        s.highWaterMark = _equity(id);
        emit Resumed(id);
    }

    function setRate(uint256 id, uint128 ratePerSec) external nonReentrant onlyStreamOwner(id) {
        if (ratePerSec == 0) revert InvalidParams();
        StreamView storage s = _streams[id];
        if (s.cancelled) revert StreamCancelled();
        _accrue(id);
        s.ratePerSec = ratePerSec;
        emit RateChanged(id, ratePerSec);
    }

    function setAgent(uint256 id, address agent) external onlyStreamOwner(id) {
        _streams[id].agent = agent;
    }

    function setRisk(uint256 id, Risk calldata risk) external onlyStreamOwner(id) {
        _validateRisk(risk);
        _streams[id].risk = risk;
    }

    function setTarget(uint256 id, address targetToken) external onlyStreamOwner(id) {
        if (!isAllowed[targetToken]) revert TokenNotAllowed();
        if (targetToken == _streams[id].baseToken) revert InvalidParams();
        _streams[id].targetToken = targetToken;
    }

    function withdraw(uint256 id, address token, uint256 amount, address to)
        external
        nonReentrant
        onlyStreamOwner(id)
    {
        if (to == address(0)) revert InvalidParams();
        StreamView storage s = _streams[id];
        uint256 b = _bal[id][token];
        if (amount > b) revert InsufficientBalance();
        // keep the drawdown breaker flow-neutral: withdrawn value comes off the high-water mark
        uint256 value = token == s.baseToken ? amount : (isAllowed[token] ? _quote(token, s.baseToken, amount) : 0);
        s.highWaterMark = s.highWaterMark > value ? s.highWaterMark - value : 0;
        _bal[id][token] = b - amount;
        token.safeTransfer(to, amount);
        emit Withdrawn(id, token, amount, to);
    }

    /// Accrue, mark cancelled, send every held token to the owner.
    function cancel(uint256 id) external nonReentrant onlyStreamOwner(id) {
        StreamView storage s = _streams[id];
        if (s.cancelled) revert StreamCancelled();
        _accrue(id);
        s.cancelled = true;
        address owner_ = s.owner;
        _sweep(id, s.baseToken, owner_);
        uint256 n = _tokenList.length;
        for (uint256 i; i < n; ++i) {
            _sweep(id, _tokenList[i], owner_);
        }
        s.highWaterMark = 0;
        emit Cancelled(id);
    }

    // -------------------------------------------------------------- streaming

    function accrue(uint256 id) external nonReentrant returns (uint256 pulled) {
        if (_streams[id].owner == address(0)) revert NoStream();
        return _accrue(id);
    }

    function owed(uint256 id) external view returns (uint256) {
        return _owed(_streams[id]);
    }

    // ------------------------------------------------------------- AGENT mode

    function trade(
        uint256 id,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes32 reasonHash
    ) external nonReentrant returns (uint256 amountOut) {
        StreamView storage s = _streams[id];
        if (s.owner == address(0)) revert NoStream();
        if (msg.sender != s.agent) revert NotAgent();
        if (s.mode != uint8(Mode.AGENT)) revert WrongMode();
        if (s.cancelled) revert StreamCancelled();
        if (s.paused) revert StreamPaused();
        if (s.halted) revert StreamHalted();
        address base = s.baseToken;
        if (tokenIn == tokenOut || amountIn == 0) revert InvalidParams();
        if ((tokenIn != base && !isAllowed[tokenIn]) || (tokenOut != base && !isAllowed[tokenOut])) {
            revert TokenNotAllowed();
        }
        Risk memory r = s.risk;
        if (s.lastTradeAt != 0 && block.timestamp < uint256(s.lastTradeAt) + r.cooldownSec) revert Cooldown();

        _accrue(id);

        if (amountIn > _bal[id][tokenIn]) revert InsufficientBalance();
        uint256 valueIn = tokenIn == base ? amountIn : _quote(tokenIn, base, amountIn);
        if (valueIn * 1e4 > _equity(id) * r.maxTradeBps) revert TradeTooLarge();
        uint256 q = IVenue(venue).quote(tokenIn, tokenOut, amountIn);
        if (minAmountOut < q * (1e4 - r.maxSlippageBps) / 1e4) revert SlippageTooLoose();

        amountOut = _swap(id, tokenIn, tokenOut, amountIn, minAmountOut);
        s.lastTradeAt = uint64(block.timestamp);
        emit Traded(id, tokenIn, tokenOut, amountIn, amountOut, reasonHash);

        // drawdown circuit breaker
        uint256 eq = _equity(id);
        uint256 hwm = s.highWaterMark;
        if (eq > hwm) {
            s.highWaterMark = eq;
        } else if (r.maxDrawdownBps != 0 && eq * 1e4 < hwm * (1e4 - r.maxDrawdownBps)) {
            s.halted = true;
            emit Halted(id, eq, hwm);
        }
    }

    // ------------------------------------------------------------ INVEST mode

    /// Anyone: swaps all held base -> targetToken with minOut = quote*(1-maxSlippage). Returns 0 if nothing to invest.
    function invest(uint256 id) external nonReentrant returns (uint256 amountOut) {
        StreamView storage s = _streams[id];
        if (s.owner == address(0)) revert NoStream();
        if (s.mode != uint8(Mode.INVEST)) revert WrongMode();
        if (s.cancelled) revert StreamCancelled();
        if (s.paused) revert StreamPaused();
        address target = s.targetToken;
        if (!isAllowed[target]) revert TokenNotAllowed();

        _accrue(id);

        address base = s.baseToken;
        uint256 amountIn = _bal[id][base];
        if (amountIn == 0) return 0;
        uint256 q = IVenue(venue).quote(base, target, amountIn);
        uint256 minOut = q * (1e4 - s.risk.maxSlippageBps) / 1e4;
        amountOut = _swap(id, base, target, amountIn, minOut);
        uint256 eq = _equity(id);
        if (eq > s.highWaterMark) s.highWaterMark = eq;
        emit Invested(id, target, amountIn, amountOut);
    }

    // ------------------------------------------------------------------ views

    function getStream(uint256 id) external view returns (StreamView memory) {
        return _streams[id];
    }

    function streamsOf(address owner) external view returns (uint256[] memory) {
        return _streamsOf[owner];
    }

    function balanceOf(uint256 id, address token) external view returns (uint256) {
        return _bal[id][token];
    }

    function equity(uint256 id) external view returns (uint256) {
        return _equity(id);
    }

    function allowedTokens() external view returns (address[] memory out) {
        uint256 n = _tokenList.length;
        uint256 c;
        for (uint256 i; i < n; ++i) {
            if (isAllowed[_tokenList[i]]) c++;
        }
        out = new address[](c);
        c = 0;
        for (uint256 i; i < n; ++i) {
            if (isAllowed[_tokenList[i]]) out[c++] = _tokenList[i];
        }
    }

    // --------------------------------------------------------------- internal

    function _validateRisk(Risk calldata r) internal pure {
        if (r.maxSlippageBps > 1e4 || r.maxTradeBps > 1e4 || r.maxDrawdownBps > 1e4) revert InvalidParams();
    }

    function _effNow(StreamView storage s) internal view returns (uint64 t) {
        t = uint64(block.timestamp);
        if (s.endTime != 0 && t > s.endTime) t = s.endTime;
    }

    function _owed(StreamView storage s) internal view returns (uint256 amt) {
        if (s.owner == address(0) || s.paused || s.cancelled) return 0;
        uint64 t = _effNow(s);
        if (t <= s.lastAccrual) return 0;
        amt = uint256(t - s.lastAccrual) * s.ratePerSec;
        if (s.maxTotal != 0) {
            uint256 rem = s.maxTotal > s.totalStreamed ? s.maxTotal - s.totalStreamed : 0;
            if (amt > rem) amt = rem;
        }
    }

    function _accrue(uint256 id) internal returns (uint256 pulled) {
        StreamView storage s = _streams[id];
        if (s.paused || s.cancelled) return 0;
        uint256 amt = _owed(s);
        uint64 t = _effNow(s);
        if (t > s.lastAccrual) s.lastAccrual = t; // starved time is forfeited, never reverts
        if (amt == 0) return 0;

        address base = s.baseToken;
        address owner_ = s.owner;
        uint256 a = IERC20Minimal(base).allowance(owner_, address(this));
        uint256 b = IERC20Minimal(base).balanceOf(owner_);
        if (a < amt) amt = a;
        if (b < amt) amt = b;
        if (amt == 0) return 0;

        uint256 before = IERC20Minimal(base).balanceOf(address(this));
        (bool ok, bytes memory ret) =
            base.call(abi.encodeWithSelector(0x23b872dd, owner_, address(this), amt));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) return 0; // starve, never revert
        pulled = IERC20Minimal(base).balanceOf(address(this)) - before;

        s.totalStreamed += uint128(amt);
        _bal[id][base] += pulled;
        s.highWaterMark += pulled; // inflows are not gains
        emit Accrued(id, pulled, s.totalStreamed);
    }

    function _swap(uint256 id, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256 out)
    {
        _bal[id][tokenIn] -= amountIn;
        tokenIn.forceApprove(venue, amountIn);
        uint256 before = IERC20Minimal(tokenOut).balanceOf(address(this));
        IVenue(venue).swapExactIn(tokenIn, tokenOut, amountIn, minOut, address(this));
        out = IERC20Minimal(tokenOut).balanceOf(address(this)) - before;
        if (out < minOut) revert SlippageTooLoose();
        if (IERC20Minimal(tokenIn).allowance(address(this), venue) != 0) tokenIn.forceApprove(venue, 0);
        _bal[id][tokenOut] += out;
    }

    function _sweep(uint256 id, address token, address to) internal {
        uint256 b = _bal[id][token];
        if (b == 0) return;
        _bal[id][token] = 0;
        token.safeTransfer(to, b);
        emit Withdrawn(id, token, b, to);
    }

    function _quote(address tokenIn, address tokenOut, uint256 amount) internal view returns (uint256) {
        if (amount == 0) return 0;
        try IVenue(venue).quote(tokenIn, tokenOut, amount) returns (uint256 q) {
            return q;
        } catch {
            return 0;
        }
    }

    function _equity(uint256 id) internal view returns (uint256 eq) {
        address base = _streams[id].baseToken;
        eq = _bal[id][base];
        uint256 n = _tokenList.length;
        for (uint256 i; i < n; ++i) {
            address t = _tokenList[i];
            if (t == base || !isAllowed[t]) continue;
            eq += _quote(t, base, _bal[id][t]);
        }
    }
}
