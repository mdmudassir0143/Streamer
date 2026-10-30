// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVenue {
    /// Swap exact `amountIn` of tokenIn held by msg.sender (pulled via transferFrom) for tokenOut sent to `to`.
    function swapExactIn(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address to)
        external
        returns (uint256 amountOut);

    /// Manipulation-resistant fair output for amountIn (mainnet: pool TWAP over 60s when available, else slot0; mock: spot).
    function quote(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256 amountOut);
}
