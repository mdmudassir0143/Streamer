// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {MockAMMVenue} from "../src/venues/MockAMMVenue.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract StreamVaultTest is Test {
    StreamVault vault;
    MockAMMVenue venue;
    MockERC20 usdt;
    MockERC20 weth;
    MockERC20 wbtc;

    address alice = makeAddr("alice"); // stream owner
    address bob = makeAddr("bob"); // agent
    address carol = makeAddr("carol"); // random keeper

    uint128 constant RATE = 1e6; // 1 USDT / sec

    function setUp() public {
        vm.warp(1_700_000_000);
        usdt = new MockERC20("Mock USDT", "USDT", 6);
        weth = new MockERC20("Mock WETH", "WETH", 18);
        wbtc = new MockERC20("Mock WBTC", "WBTC", 8);
        venue = new MockAMMVenue(address(usdt));
        vault = new StreamVault(address(venue));
        vault.setAllowedToken(address(weth), true);
        vault.setAllowedToken(address(wbtc), true);

        _seed(weth, 2_000_000e6, uint256(2_000_000e18) / 2235); // ETH ~2235
        _seed(wbtc, 2_000_000e6, uint256(2_000_000e8) / 76800); // BTC ~76800

        usdt.mint(alice, 100_000e6);
        vm.prank(alice);
        usdt.approve(address(vault), type(uint256).max);
    }

    function _seed(MockERC20 asset, uint256 baseAmt, uint256 assetAmt) internal {
        usdt.mint(address(this), baseAmt);
        asset.mint(address(this), assetAmt);
        usdt.approve(address(venue), baseAmt);
        asset.approve(address(venue), assetAmt);
        venue.seedPool(address(asset), baseAmt, assetAmt);
    }

    function _risk(uint16 slip, uint16 maxTrade, uint16 dd, uint32 cooldown)
        internal
        pure
        returns (StreamVault.Risk memory)
    {
        return StreamVault.Risk({maxSlippageBps: slip, maxTradeBps: maxTrade, maxDrawdownBps: dd, cooldownSec: cooldown});
    }

    function _defaultRisk() internal pure returns (StreamVault.Risk memory) {
        return _risk(100, 5000, 1000, 60);
    }

    function _create(uint8 mode, uint64 duration, uint128 maxTotal) internal returns (uint256 id) {
        vm.prank(alice);
        id = vault.createStream(bob, address(usdt), address(weth), mode, RATE, duration, maxTotal, _defaultRisk());
    }

    function _agentTrade(uint256 id, address tIn, address tOut, uint256 amt) internal returns (uint256) {
        uint256 m = _minOut(tIn, tOut, amt, 100);
        address agent = vault.getStream(id).agent;
        vm.prank(agent);
        return vault.trade(id, tIn, tOut, amt, m, 0);
    }

    function _minOut(address tIn, address tOut, uint256 amt, uint256 slipBps) internal view returns (uint256) {
        return venue.quote(tIn, tOut, amt) * (1e4 - slipBps) / 1e4;
    }

    // ------------------------------------------------------------ accrual

    function test_createAndViews() public {
        uint256 id = _create(0, 0, 0);
        assertEq(id, 1);
        StreamVault.StreamView memory s = vault.getStream(id);
        assertEq(s.owner, alice);
        assertEq(s.agent, bob);
        assertEq(s.baseToken, address(usdt));
        assertEq(s.targetToken, address(weth));
        assertEq(s.ratePerSec, RATE);
        assertEq(s.startTime, block.timestamp);
        assertEq(s.endTime, 0);
        assertEq(s.risk.maxTradeBps, 5000);
        assertEq(vault.streamsOf(alice).length, 1);
        assertEq(vault.allowedTokens().length, 2);
        assertEq(vault.venue(), address(venue));
    }

    function test_accrualMath() public {
        uint256 id = _create(0, 0, 0);
        vm.warp(block.timestamp + 100);
        assertEq(vault.owed(id), 100e6);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.Accrued(id, 100e6, 100e6);
        uint256 pulled = vault.accrue(id);
        assertEq(pulled, 100e6);
        assertEq(vault.balanceOf(id, address(usdt)), 100e6);
        assertEq(usdt.balanceOf(alice), 100_000e6 - 100e6);
        assertEq(vault.owed(id), 0);
        assertEq(vault.equity(id), 100e6);
        vm.warp(block.timestamp + 7);
        vm.prank(carol); // anyone can accrue
        vault.accrue(id);
        assertEq(vault.getStream(id).totalStreamed, 107e6);
    }

    function test_pauseResume() public {
        uint256 id = _create(0, 0, 0);
        vm.warp(block.timestamp + 50);
        vm.prank(alice);
        vault.pause(id);
        assertEq(vault.balanceOf(id, address(usdt)), 50e6); // accrued on pause
        vm.warp(block.timestamp + 1000);
        assertEq(vault.owed(id), 0);
        assertEq(vault.accrue(id), 0);
        vm.prank(alice);
        vault.resume(id);
        vm.warp(block.timestamp + 10);
        assertEq(vault.owed(id), 10e6); // paused time never accrues
        vault.accrue(id);
        assertEq(vault.getStream(id).totalStreamed, 60e6);
    }

    function test_onlyOwnerLifecycle() public {
        uint256 id = _create(0, 0, 0);
        vm.startPrank(carol);
        vm.expectRevert(StreamVault.NotOwner.selector);
        vault.pause(id);
        vm.expectRevert(StreamVault.NotOwner.selector);
        vault.cancel(id);
        vm.expectRevert(StreamVault.NotOwner.selector);
        vault.setRate(id, 5);
        vm.expectRevert(StreamVault.NotOwner.selector);
        vault.withdraw(id, address(usdt), 1, carol);
        vm.stopPrank();
    }

    function test_allowanceStarvation() public {
        uint256 id = _create(0, 0, 0);
        vm.prank(alice);
        usdt.approve(address(vault), 30e6);
        vm.warp(block.timestamp + 100);
        assertEq(vault.owed(id), 100e6); // owed ignores allowance
        assertEq(vault.accrue(id), 30e6); // pulls what it can, no revert
        assertEq(vault.getStream(id).totalStreamed, 30e6);
        vm.warp(block.timestamp + 10);
        assertEq(vault.accrue(id), 0); // allowance exhausted -> starves
        // revoking allowance is a kill switch for the agent too
        vm.prank(alice);
        usdt.approve(address(vault), 0);
        vm.warp(block.timestamp + 10);
        assertEq(vault.accrue(id), 0);
    }

    function test_balanceStarvation() public {
        uint256 id = _create(0, 0, 0);
        vm.prank(alice);
        usdt.transfer(carol, 100_000e6 - 20e6);
        vm.warp(block.timestamp + 100);
        assertEq(vault.accrue(id), 20e6);
        assertEq(usdt.balanceOf(alice), 0);
    }

    function test_maxTotal() public {
        uint256 id = _create(0, 0, 50e6);
        vm.warp(block.timestamp + 100);
        assertEq(vault.owed(id), 50e6);
        vault.accrue(id);
        vm.warp(block.timestamp + 100);
        assertEq(vault.owed(id), 0);
        assertEq(vault.accrue(id), 0);
        assertEq(vault.getStream(id).totalStreamed, 50e6);
    }

    function test_endTime() public {
        uint256 id = _create(0, 60, 0);
        assertEq(vault.getStream(id).endTime, block.timestamp + 60);
        vm.warp(block.timestamp + 40);
        vault.accrue(id);
        vm.warp(block.timestamp + 1000);
        assertEq(vault.owed(id), 20e6);
        vault.accrue(id);
        assertEq(vault.getStream(id).totalStreamed, 60e6);
        vm.warp(block.timestamp + 1000);
        assertEq(vault.owed(id), 0);
    }

    function test_setRateAccruesFirst() public {
        uint256 id = _create(0, 0, 0);
        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.RateChanged(id, 3e6);
        vault.setRate(id, 3e6);
        assertEq(vault.balanceOf(id, address(usdt)), 10e6);
        vm.warp(block.timestamp + 10);
        assertEq(vault.owed(id), 30e6);
    }

    // ------------------------------------------------------------ trading

    function _fund(uint256 id, uint256 secs) internal {
        vm.warp(block.timestamp + secs);
        vault.accrue(id);
    }

    function test_agentTrade() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000); // 1000 USDT
        uint256 amt = 400e6;
        uint256 minOut = _minOut(address(usdt), address(weth), amt, 100);
        bytes32 rh = keccak256("buy");
        vm.prank(bob);
        uint256 out = vault.trade(id, address(usdt), address(weth), amt, minOut, rh);
        assertGt(out, minOut);
        assertEq(vault.balanceOf(id, address(weth)), out);
        assertEq(vault.balanceOf(id, address(usdt)), 600e6);
        assertEq(weth.balanceOf(address(vault)), out);
        assertEq(usdt.allowance(address(vault), address(venue)), 0);
        assertApproxEqRel(vault.equity(id), 1000e6, 0.005e18);
        assertEq(vault.getStream(id).lastTradeAt, block.timestamp);
    }

    function test_tradeCallsAccrueFirst() public {
        uint256 id = _create(0, 0, 0);
        vm.warp(block.timestamp + 100); // nothing accrued yet
        _agentTrade(id, address(usdt), address(weth), 40e6);
        assertEq(vault.getStream(id).totalStreamed, 100e6);
    }

    function test_onlyAgentTrades() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        vm.prank(alice);
        vm.expectRevert(StreamVault.NotAgent.selector);
        vault.trade(id, address(usdt), address(weth), 10e6, 0, 0);
        vm.prank(alice);
        vault.setAgent(id, carol);
        vm.prank(bob);
        vm.expectRevert(StreamVault.NotAgent.selector);
        vault.trade(id, address(usdt), address(weth), 10e6, 0, 0);
        _agentTrade(id, address(usdt), address(weth), 10e6);
    }

    function test_tokenNotAllowed() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        MockERC20 junk = new MockERC20("J", "J", 18);
        vm.prank(bob);
        vm.expectRevert(StreamVault.TokenNotAllowed.selector);
        vault.trade(id, address(usdt), address(junk), 10e6, 0, 0);
    }

    function test_cooldown() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        vm.startPrank(bob);
        vault.trade(id, address(usdt), address(weth), 10e6, _minOut(address(usdt), address(weth), 10e6, 100), 0);
        vm.warp(block.timestamp + 59);
        vm.expectRevert(StreamVault.Cooldown.selector);
        vault.trade(id, address(usdt), address(weth), 10e6, 0, 0);
        vm.warp(block.timestamp + 1);
        vault.trade(id, address(usdt), address(weth), 10e6, _minOut(address(usdt), address(weth), 10e6, 100), 0);
        vm.stopPrank();
    }

    function test_tradeTooLarge() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000); // equity 1000, max 50% = 500
        vm.prank(bob);
        vm.expectRevert(StreamVault.TradeTooLarge.selector);
        vault.trade(id, address(usdt), address(weth), 501e6, 0, 0);
        _agentTrade(id, address(usdt), address(weth), 500e6);
    }

    function test_tradeTooLarge_nonBaseValuedInBase() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        uint256 out = _agentTrade(id, address(usdt), address(weth), 500e6);
        vm.warp(block.timestamp + 60);
        vm.prank(alice);
        vault.pause(id); // freeze equity ~1000+60
        vm.prank(alice);
        vault.resume(id);
        // selling all WETH (~498 USDT) is < 50% of ~1060 equity, ok; but set maxTrade to 40% -> too large
        vm.prank(alice);
        vault.setRisk(id, _risk(100, 4000, 1000, 60));
        vm.prank(bob);
        vm.expectRevert(StreamVault.TradeTooLarge.selector);
        vault.trade(id, address(weth), address(usdt), out, 0, 0);
    }

    function test_slippageTooLoose() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        uint256 loose = _minOut(address(usdt), address(weth), 100e6, 101); // 1.01% > 1% allowed
        vm.prank(bob);
        vm.expectRevert(StreamVault.SlippageTooLoose.selector);
        vault.trade(id, address(usdt), address(weth), 100e6, loose, 0);
    }

    function test_insufficientBalance() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        vm.prank(alice);
        vault.setRisk(id, _risk(100, 10000, 1000, 0));
        vm.prank(bob);
        vm.expectRevert(StreamVault.InsufficientBalance.selector);
        vault.trade(id, address(weth), address(usdt), 1e18, 0, 0);
    }

    function test_multiHopTrade() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        vm.prank(alice);
        vault.setRisk(id, _risk(100, 10000, 1000, 0));
        uint256 w = _agentTrade(id, address(usdt), address(weth), 400e6);
        uint256 b = _agentTrade(id, address(weth), address(wbtc), w);
        assertEq(vault.balanceOf(id, address(weth)), 0);
        assertEq(vault.balanceOf(id, address(wbtc)), b);
        assertApproxEqRel(vault.equity(id), 1000e6, 0.01e18);
    }

    function test_pausedAndCancelledBlockTrades() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        vm.prank(alice);
        vault.pause(id);
        vm.prank(bob);
        vm.expectRevert(StreamVault.StreamPaused.selector);
        vault.trade(id, address(usdt), address(weth), 10e6, 0, 0);
        vm.prank(alice);
        vault.cancel(id);
        vm.prank(bob);
        vm.expectRevert(StreamVault.StreamCancelled.selector);
        vault.trade(id, address(usdt), address(weth), 10e6, 0, 0);
    }

    function test_drawdownHaltAndResume() public {
        uint256 id = _create(0, 0, 0);
        vm.prank(alice);
        vault.setRisk(id, _risk(100, 10000, 1000, 0)); // 10% dd
        _fund(id, 1000);
        _agentTrade(id, address(usdt), address(weth), 900e6);
        assertFalse(vault.getStream(id).halted);
        uint256 hwm = vault.getStream(id).highWaterMark;
        assertApproxEqRel(hwm, 1000e6, 0.01e18);

        venue.syncPrice(address(weth), 1500e18); // ETH crashes ~33%
        assertApproxEqRel(venue.spotPriceE18(address(weth)), 1500e18, 0.001e18);

        uint256 m = _minOut(address(usdt), address(weth), 10e6, 100);
        vm.prank(bob);
        vm.expectEmit(true, false, false, false);
        emit StreamVault.Halted(id, 0, 0);
        vault.trade(id, address(usdt), address(weth), 10e6, m, 0);
        assertTrue(vault.getStream(id).halted);

        vm.prank(bob);
        vm.expectRevert(StreamVault.StreamHalted.selector);
        vault.trade(id, address(usdt), address(weth), 10e6, 0, 0);

        vm.prank(alice);
        vault.resume(id);
        StreamVault.StreamView memory s = vault.getStream(id);
        assertFalse(s.halted);
        assertEq(s.highWaterMark, vault.equity(id));
        _agentTrade(id, address(usdt), address(weth), 10e6);
    }

    function test_accrualDoesNotMaskDrawdown() public {
        uint256 id = _create(0, 0, 0);
        vm.prank(alice);
        vault.setRisk(id, _risk(100, 10000, 1000, 0));
        _fund(id, 1000);
        _agentTrade(id, address(usdt), address(weth), 900e6);
        venue.syncPrice(address(weth), 1500e18);
        vm.warp(block.timestamp + 300); // +300 USDT inflow would hide the loss if HWM ignored flows
        _agentTrade(id, address(usdt), address(weth), 10e6);
        assertTrue(vault.getStream(id).halted);
    }

    // ------------------------------------------------------------ invest

    function test_investMode() public {
        uint256 id = _create(1, 0, 0);
        vm.warp(block.timestamp + 500);
        vm.prank(carol); // anyone
        uint256 out = vault.invest(id);
        assertGt(out, 0);
        assertEq(vault.balanceOf(id, address(usdt)), 0);
        assertEq(vault.balanceOf(id, address(weth)), out);
        assertApproxEqRel(out, uint256(500e18) / 2235, 0.005e18);
        // agent can't trade invest stream
        vm.prank(bob);
        vm.expectRevert(StreamVault.WrongMode.selector);
        vault.trade(id, address(usdt), address(weth), 1, 0, 0);
        // nothing to invest -> returns 0
        assertEq(vault.invest(id), 0);
        // target change
        vm.prank(alice);
        vault.setTarget(id, address(wbtc));
        vm.warp(block.timestamp + 100);
        assertGt(vault.invest(id), 0);
        assertGt(vault.balanceOf(id, address(wbtc)), 0);
    }

    function test_investWrongModeAndTarget() public {
        uint256 id = _create(0, 0, 0);
        vm.expectRevert(StreamVault.WrongMode.selector);
        vault.invest(id);
        MockERC20 junk = new MockERC20("J", "J", 18);
        vm.prank(alice);
        vm.expectRevert(StreamVault.TokenNotAllowed.selector);
        vault.setTarget(id, address(junk));
        vm.prank(alice);
        vm.expectRevert(StreamVault.TokenNotAllowed.selector);
        vault.createStream(bob, address(usdt), address(junk), 1, RATE, 0, 0, _defaultRisk());
    }

    // ------------------------------------------------------------ exit

    function test_cancelReturnsEverything() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 1000);
        uint256 w = _agentTrade(id, address(usdt), address(weth), 400e6);
        vm.warp(block.timestamp + 10);
        vm.prank(alice);
        vm.expectEmit(true, false, false, false);
        emit StreamVault.Cancelled(id);
        vault.cancel(id);
        // 1010 streamed in total, 400 swapped for WETH
        assertEq(usdt.balanceOf(alice), 100_000e6 - 1010e6 + 610e6);
        assertEq(weth.balanceOf(alice), w);
        assertEq(vault.balanceOf(id, address(usdt)), 0);
        assertEq(vault.balanceOf(id, address(weth)), 0);
        assertTrue(vault.getStream(id).cancelled);
        vm.warp(block.timestamp + 100);
        assertEq(vault.owed(id), 0);
        assertEq(vault.accrue(id), 0);
        vm.prank(alice);
        vm.expectRevert(StreamVault.StreamCancelled.selector);
        vault.cancel(id);
    }

    function test_withdraw() public {
        uint256 id = _create(0, 0, 0);
        _fund(id, 100);
        vm.prank(alice);
        vm.expectRevert(StreamVault.InsufficientBalance.selector);
        vault.withdraw(id, address(usdt), 101e6, alice);
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit StreamVault.Withdrawn(id, address(usdt), 40e6, carol);
        vault.withdraw(id, address(usdt), 40e6, carol);
        assertEq(usdt.balanceOf(carol), 40e6);
        assertEq(vault.balanceOf(id, address(usdt)), 60e6);
        assertEq(vault.getStream(id).highWaterMark, 60e6);
    }

    function test_streamsIsolated() public {
        uint256 a = _create(0, 0, 0);
        uint256 b = _create(1, 0, 0);
        vm.warp(block.timestamp + 10);
        vault.accrue(a);
        vault.accrue(b);
        assertEq(vault.balanceOf(a, address(usdt)), 10e6);
        assertEq(vault.balanceOf(b, address(usdt)), 10e6);
        vault.invest(b);
        assertEq(vault.balanceOf(a, address(usdt)), 10e6);
        assertEq(vault.balanceOf(a, address(weth)), 0);
        assertEq(vault.streamsOf(alice).length, 2);
    }

    function test_adminOnlyAllowlist() public {
        vm.prank(alice);
        vm.expectRevert(StreamVault.NotAdmin.selector);
        vault.setAllowedToken(address(usdt), true);
        vault.setAllowedToken(address(wbtc), false);
        assertEq(vault.allowedTokens().length, 1);
    }

    // ------------------------------------------------------------ mocks

    function test_faucet() public {
        vm.prank(carol);
        usdt.faucet();
        assertEq(usdt.balanceOf(carol), 10_000e6);
        vm.prank(carol);
        vm.expectRevert(MockERC20.FaucetCooldown.selector);
        usdt.faucet();
        vm.warp(block.timestamp + 1 hours);
        vm.prank(carol);
        usdt.faucet();
        assertEq(usdt.balanceOf(carol), 20_000e6);
    }

    function test_venueQuoteAndSync() public {
        assertApproxEqRel(venue.quote(address(weth), address(usdt), 1e18), 2235e6, 0.001e18);
        assertApproxEqRel(venue.quote(address(wbtc), address(usdt), 1e8), 76800e6, 0.001e18);
        venue.syncPrice(address(wbtc), 80000e18);
        assertApproxEqRel(venue.quote(address(wbtc), address(usdt), 1e8), 80000e6, 0.0001e18);
        vm.prank(carol);
        vm.expectRevert(MockAMMVenue.NotOwner.selector);
        venue.syncPrice(address(wbtc), 1e18);
        venue.setKeeper(carol);
        vm.prank(carol);
        venue.syncPrice(address(wbtc), 70000e18);
        assertApproxEqRel(venue.spotPriceE18(address(wbtc)), 70000e18, 0.0001e18);
    }
}
