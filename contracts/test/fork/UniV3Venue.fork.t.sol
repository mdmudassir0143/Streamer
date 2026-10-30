// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {UniV3Venue, IUniswapV3Pool} from "../../src/venues/UniV3Venue.sol";
import {StreamVault} from "../../src/StreamVault.sol";
import {TickMath} from "../../src/libraries/TickMath.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// Run: forge test --match-path test/fork/* --fork-url https://mainnet.hsk.xyz -vv
contract UniV3VenueForkTest is Test {
    address constant FACTORY = 0x972cA9D1662F5e029cD18327D29026532E84c742;
    address constant ROUTER = 0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3; // HSKSwap SwapRouter02
    address constant USDT = 0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029;
    address constant WETH = 0xefd4bC9afD210517803f293ABABd701CaeeCdfd0;
    address constant WBTC = 0x6119CA49a79f5825C8B345F8d7aC36B272565b14;
    address constant WHSK = 0xB210D2120d57b758EE163cFfb43e73728c471Cf1;

    UniV3Venue venue;

    function setUp() public {
        if (block.chainid != 177) {
            vm.skip(true);
            return;
        }
        venue = new UniV3Venue(FACTORY, ROUTER, USDT, 3000);
    }

    function test_tickMathMatchesSlot0() public view {
        assertEq(TickMath.getSqrtRatioAtTick(0), uint160(1 << 96));
        (uint160 sqrtP, int24 tick,,,,,) = IUniswapV3Pool(venue.poolFor(WETH, USDT)).slot0();
        uint160 lo = TickMath.getSqrtRatioAtTick(tick);
        uint160 hi = TickMath.getSqrtRatioAtTick(tick + 1);
        assertLe(lo, sqrtP);
        assertGt(hi, sqrtP);
    }

    function test_quoteSanity() public view {
        address[3] memory assets = [WETH, WBTC, WHSK];
        uint256[3] memory units = [uint256(1e18), 1e8, 1e18];
        for (uint256 i; i < 3; ++i) {
            uint256 q = venue.quote(assets[i], USDT, units[i]);
            uint256 s = venue.spotQuote(assets[i], USDT, units[i]);
            console2.log("asset", assets[i]);
            console2.log("  twap/quote USDT(6dp)", q);
            console2.log("  slot0 USDT(6dp)    ", s);
            assertGt(q, 0);
            assertApproxEqRel(q, s, 0.05e18); // TWAP within 5% of spot
            // round trip consistency
            uint256 back = venue.quote(USDT, assets[i], q);
            assertApproxEqRel(back, units[i], 0.001e18);
        }
        // sanity ranges
        uint256 eth = venue.quote(WETH, USDT, 1e18);
        assertGt(eth, 500e6);
        assertLt(eth, 20_000e6);
        // multi-hop via base
        assertGt(venue.quote(WETH, WHSK, 1e18), 0);
    }

    function test_realSwapUsdtToWeth() public {
        uint256 amt = 50e6;
        deal(USDT, address(this), amt);
        assertEq(IERC20(USDT).balanceOf(address(this)), amt);
        IERC20(USDT).approve(address(venue), amt);
        uint256 q = venue.quote(USDT, WETH, amt);
        uint256 minOut = q * 9700 / 10000;
        uint256 out = venue.swapExactIn(USDT, WETH, amt, minOut, address(this));
        console2.log("USDT in", amt, "WETH out", out);
        console2.log("quote", q);
        assertGe(out, minOut);
        assertEq(IERC20(WETH).balanceOf(address(this)), out);
        assertEq(IERC20(USDT).balanceOf(address(venue)), 0);
    }

    function test_vaultEndToEndOnFork() public {
        StreamVault vault = new StreamVault(address(venue));
        vault.setAllowedToken(WETH, true);
        vault.setAllowedToken(WBTC, true);
        vault.setAllowedToken(WHSK, true);
        address owner = makeAddr("owner");
        address agent = makeAddr("agent");
        deal(USDT, owner, 1000e6);
        vm.startPrank(owner);
        IERC20(USDT).approve(address(vault), type(uint256).max);
        uint256 id = vault.createStream(
            agent,
            USDT,
            WETH,
            0,
            1e6,
            0,
            0,
            StreamVault.Risk({maxSlippageBps: 300, maxTradeBps: 5000, maxDrawdownBps: 2000, cooldownSec: 0})
        );
        vm.stopPrank();
        vm.warp(block.timestamp + 100);
        vault.accrue(id);
        uint256 q = venue.quote(USDT, WETH, 40e6);
        vm.prank(agent);
        uint256 out = vault.trade(id, USDT, WETH, 40e6, q * 9700 / 10000, keccak256("fork"));
        assertGt(out, 0);
        assertApproxEqRel(vault.equity(id), 100e6, 0.03e18);
        vm.prank(owner);
        vault.cancel(id);
        assertEq(IERC20(WETH).balanceOf(owner), out);
    }
}
