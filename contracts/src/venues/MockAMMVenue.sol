// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVenue} from "../interfaces/IVenue.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {FullMath} from "../libraries/FullMath.sol";

/// Testnet AMM: one constant-product pool per (base, asset), 0.3% fee. quote = spot (no fee).
/// Asset->asset routes through base.
contract MockAMMVenue is IVenue {
    using SafeTransferLib for address;

    struct Pool {
        uint256 reserveBase;
        uint256 reserveAsset;
    }

    address public immutable baseToken;
    address public owner;
    address public keeper; // may call syncPrice (price-sync keeper)
    mapping(address => Pool) public pools; // asset => pool

    event PoolSeeded(address indexed asset, uint256 baseAmt, uint256 assetAmt);
    event PriceSynced(address indexed asset, uint256 priceE18, uint256 reserveBase, uint256 reserveAsset);
    event Swap(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, address to);
    event KeeperSet(address keeper);

    error NotOwner();
    error NoPool();
    error SameToken();
    error InsufficientOutput();
    error ZeroAmount();

    constructor(address baseToken_) {
        baseToken = baseToken_;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setKeeper(address k) external onlyOwner {
        keeper = k;
        emit KeeperSet(k);
    }

    function transferOwnership(address o) external onlyOwner {
        owner = o;
    }

    /// Adds liquidity (pulled from owner) to the asset pool.
    function seedPool(address asset, uint256 baseAmt, uint256 assetAmt) external onlyOwner {
        if (asset == baseToken) revert SameToken();
        baseToken.safeTransferFrom(msg.sender, address(this), baseAmt);
        asset.safeTransferFrom(msg.sender, address(this), assetAmt);
        Pool storage p = pools[asset];
        p.reserveBase += baseAmt;
        p.reserveAsset += assetAmt;
        emit PoolSeeded(asset, baseAmt, assetAmt);
    }

    /// Rebalances reserves to a target price (whole base per whole asset, 1e18-scaled) keeping k constant.
    function syncPrice(address asset, uint256 priceE18) external {
        if (msg.sender != owner && msg.sender != keeper) revert NotOwner();
        if (priceE18 == 0) revert ZeroAmount();
        Pool storage p = pools[asset];
        if (p.reserveBase == 0 || p.reserveAsset == 0) revert NoPool();
        uint256 bd = 10 ** uint256(IERC20Minimal(baseToken).decimals());
        uint256 ad = 10 ** uint256(IERC20Minimal(asset).decimals());
        uint256 k = p.reserveBase * p.reserveAsset;
        // raw price P = rb/ra = priceE18*bd/(ad*1e18)  =>  ra = sqrt(k*ad*1e18/(priceE18*bd))
        uint256 ra = _sqrt(FullMath.mulDiv(k, ad * 1e18, priceE18 * bd));
        if (ra == 0) revert NoPool();
        uint256 rb = k / ra;
        p.reserveAsset = ra;
        p.reserveBase = rb;
        emit PriceSynced(asset, priceE18, rb, ra);
    }

    /// Spot price of `asset` in whole base per whole asset, 1e18-scaled.
    function spotPriceE18(address asset) external view returns (uint256) {
        Pool memory p = pools[asset];
        if (p.reserveAsset == 0) return 0;
        uint256 bd = 10 ** uint256(IERC20Minimal(baseToken).decimals());
        uint256 ad = 10 ** uint256(IERC20Minimal(asset).decimals());
        return FullMath.mulDiv(p.reserveBase, ad * 1e18, p.reserveAsset * bd);
    }

    function getPool(address asset) external view returns (uint256 reserveBase, uint256 reserveAsset) {
        Pool memory p = pools[asset];
        return (p.reserveBase, p.reserveAsset);
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        if (tokenIn == tokenOut) return amountIn;
        if (tokenIn == baseToken) return _spot(pools[tokenOut], true, amountIn);
        if (tokenOut == baseToken) return _spot(pools[tokenIn], false, amountIn);
        return _spot(pools[tokenOut], true, _spot(pools[tokenIn], false, amountIn));
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut)
    {
        if (tokenIn == tokenOut) revert SameToken();
        if (amountIn == 0) revert ZeroAmount();
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (tokenIn == baseToken) {
            amountOut = _swap(pools[tokenOut], true, amountIn);
        } else if (tokenOut == baseToken) {
            amountOut = _swap(pools[tokenIn], false, amountIn);
        } else {
            amountOut = _swap(pools[tokenOut], true, _swap(pools[tokenIn], false, amountIn));
        }
        if (amountOut < minAmountOut || amountOut == 0) revert InsufficientOutput();
        tokenOut.safeTransfer(to, amountOut);
        emit Swap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, to);
    }

    function _spot(Pool memory p, bool baseIn, uint256 amountIn) internal pure returns (uint256) {
        if (p.reserveBase == 0 || p.reserveAsset == 0) return 0;
        return baseIn
            ? FullMath.mulDiv(amountIn, p.reserveAsset, p.reserveBase)
            : FullMath.mulDiv(amountIn, p.reserveBase, p.reserveAsset);
    }

    function _swap(Pool storage p, bool baseIn, uint256 amountIn) internal returns (uint256 out) {
        (uint256 rIn, uint256 rOut) = baseIn ? (p.reserveBase, p.reserveAsset) : (p.reserveAsset, p.reserveBase);
        if (rIn == 0 || rOut == 0) revert NoPool();
        uint256 inFee = amountIn * 997;
        out = FullMath.mulDiv(inFee, rOut, rIn * 1000 + inFee);
        if (baseIn) {
            p.reserveBase = rIn + amountIn;
            p.reserveAsset = rOut - out;
        } else {
            p.reserveAsset = rIn + amountIn;
            p.reserveBase = rOut - out;
        }
    }

    function _sqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = x / 2 + 1;
        while (y < z) {
            z = y;
            y = (x / y + y) / 2;
        }
    }
}
