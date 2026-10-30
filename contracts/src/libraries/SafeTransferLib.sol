// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Low-level ERC20 helpers that tolerate non-standard tokens (no bool return, USDT-style approve).
library SafeTransferLib {
    error TransferFailed();
    error ApproveFailed();

    function _call(address token, bytes memory data) private returns (bool) {
        (bool ok, bytes memory ret) = token.call(data);
        return ok && (ret.length == 0 || abi.decode(ret, (bool))) && token.code.length > 0;
    }

    function safeTransfer(address token, address to, uint256 amount) internal {
        if (!_call(token, abi.encodeWithSelector(0xa9059cbb, to, amount))) revert TransferFailed();
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        if (!_call(token, abi.encodeWithSelector(0x23b872dd, from, to, amount))) revert TransferFailed();
    }

    /// Approve that works for tokens requiring allowance to be reset to 0 first.
    function forceApprove(address token, address spender, uint256 amount) internal {
        bytes memory data = abi.encodeWithSelector(0x095ea7b3, spender, amount);
        if (!_call(token, data)) {
            if (!_call(token, abi.encodeWithSelector(0x095ea7b3, spender, 0)) || !_call(token, data)) {
                revert ApproveFailed();
            }
        }
    }
}
