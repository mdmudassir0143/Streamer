// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IVenue} from "../interfaces/IVenue.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {FullMath} from "../libraries/FullMath.sol";
import {TickMath} from "../libraries/TickMath.sol";

interface IUniswapV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

/// SwapRouter02 (no deadline in params). HSKSwap mainnet: 0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

/// IVenue over HSKSwap (Uniswap v3 fork). Quotes from 60s TWAP when the pool has >1 observation, else slot0.
/// Asset->asset routes through base.
contract UniV3Venue is IVenue {
    using SafeTransferLib for address;

    uint32 public constant TWAP_WINDOW = 60;

    address public immutable factory;
    address public immutable router;
    address public immutable baseToken;
    uint24 public immutable fee;

    error NoPool();
    error SameToken();
    error InsufficientOutput();

    constructor(address factory_, address router_, address baseToken_, uint24 fee_) {
        factory = factory_;
        router = router_;
        baseToken = baseToken_;
        fee = fee_;
    }

    function poolFor(address a, address b) public view returns (address pool) {
        pool = IUniswapV3Factory(factory).getPool(a, b, fee);
        if (pool == address(0)) revert NoPool();
    }

    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        if (tokenIn == tokenOut) return amountIn;
        if (tokenIn == baseToken || tokenOut == baseToken) return _quotePool(tokenIn, tokenOut, amountIn);
        return _quotePool(baseToken, tokenOut, _quotePool(tokenIn, baseToken, amountIn));
    }

    /// Spot (slot0) quote, for sanity checks / dashboards.
    function spotQuote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        (uint160 sqrtP,,,,,,) = IUniswapV3Pool(poolFor(tokenIn, tokenOut)).slot0();
        return _quoteAtSqrt(sqrtP, amountIn, tokenIn < tokenOut);
    }

    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut)
    {
        if (tokenIn == tokenOut) revert SameToken();
        tokenIn.safeTransferFrom(msg.sender, address(this), amountIn);
        if (tokenIn == baseToken || tokenOut == baseToken) {
            amountOut = _swap(tokenIn, tokenOut, amountIn, minAmountOut, to);
        } else {
            uint256 mid = _swap(tokenIn, baseToken, amountIn, 0, address(this));
            amountOut = _swap(baseToken, tokenOut, mid, minAmountOut, to);
        }
        if (amountOut < minAmountOut) revert InsufficientOutput();
    }

    function _swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, address to)
        internal
        returns (uint256)
    {
        tokenIn.forceApprove(router, amountIn);
        uint256 out = ISwapRouter02(router).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: to,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );
        tokenIn.forceApprove(router, 0);
        return out;
    }

    function _quotePool(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        if (amountIn == 0) return 0;
        IUniswapV3Pool pool = IUniswapV3Pool(poolFor(tokenIn, tokenOut));
        (uint160 sqrtP,,, uint16 card,,,) = pool.slot0();
        if (card > 1) {
            uint32[] memory ago = new uint32[](2);
            ago[0] = TWAP_WINDOW;
            try pool.observe(ago) returns (int56[] memory tc, uint160[] memory) {
                int56 delta = tc[1] - tc[0];
                int24 tick = int24(delta / int56(uint56(TWAP_WINDOW)));
                if (delta < 0 && (delta % int56(uint56(TWAP_WINDOW)) != 0)) tick--;
                sqrtP = TickMath.getSqrtRatioAtTick(tick);
            } catch {}
        }
        return _quoteAtSqrt(sqrtP, amountIn, tokenIn < tokenOut);
    }

    /// OracleLibrary.getQuoteAtTick logic, from a sqrt price. zeroForOne: tokenIn is token0.
    function _quoteAtSqrt(uint160 sqrtP, uint256 amountIn, bool zeroForOne) internal pure returns (uint256) {
        if (sqrtP <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtP) * sqrtP;
            return zeroForOne ? FullMath.mulDiv(ratioX192, amountIn, 1 << 192) : FullMath.mulDiv(1 << 192, amountIn, ratioX192);
        }
        uint256 ratioX128 = FullMath.mulDiv(sqrtP, sqrtP, 1 << 64);
        return zeroForOne ? FullMath.mulDiv(ratioX128, amountIn, 1 << 128) : FullMath.mulDiv(1 << 128, amountIn, ratioX128);
    }
}
