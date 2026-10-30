// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {MockAMMVenue} from "../src/venues/MockAMMVenue.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

/// forge script script/DeployTestnet.s.sol --rpc-url <rpc> --broadcast
/// Env: DEPLOYER_KEY (required), AGENT_KEY (optional: agent address becomes MockAMMVenue keeper for syncPrice)
contract DeployTestnet is Script {
    uint256 constant POOL_USDT = 2_000_000e6;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        address deployer = vm.addr(pk);
        uint256 agentPk = vm.envOr("AGENT_KEY", uint256(0));
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        MockERC20 usdt = new MockERC20("Mock USDT", "USDT", 6);
        MockERC20 weth = new MockERC20("Mock WETH", "WETH", 18);
        MockERC20 wbtc = new MockERC20("Mock WBTC", "WBTC", 8);
        MockERC20 whsk = new MockERC20("Mock WHSK", "WHSK", 18);
        MockAMMVenue venue = new MockAMMVenue(address(usdt));
        StreamVault vault = new StreamVault(address(venue));
        vault.setAllowedToken(address(weth), true);
        vault.setAllowedToken(address(wbtc), true);
        vault.setAllowedToken(address(whsk), true);

        usdt.mint(deployer, POOL_USDT * 3 + 100_000e6);
        usdt.approve(address(venue), type(uint256).max);
        _seed(venue, weth, deployer, uint256(POOL_USDT) * 1e18 / 2235e6); // ETH ~2235
        _seed(venue, wbtc, deployer, uint256(POOL_USDT) * 1e8 / 76800e6); // BTC ~76800
        _seed(venue, whsk, deployer, uint256(POOL_USDT) * 1e18 * 10_000 / 873e6); // HSK ~0.0873
        if (agentPk != 0) venue.setKeeper(vm.addr(agentPk));
        vm.stopBroadcast();

        string memory o = "d";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "vault", address(vault));
        vm.serializeAddress(o, "venue", address(venue));
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeUint(o, "startBlock", startBlock);

        string memory t = "tokens";
        vm.serializeAddress(t, "USDT", address(usdt));
        vm.serializeAddress(t, "WETH", address(weth));
        vm.serializeAddress(t, "WBTC", address(wbtc));
        string memory tokens = vm.serializeAddress(t, "WHSK", address(whsk));

        string memory d = "decimals";
        vm.serializeUint(d, "USDT", 6);
        vm.serializeUint(d, "WETH", 18);
        vm.serializeUint(d, "WBTC", 8);
        string memory decs = vm.serializeUint(d, "WHSK", 18);

        vm.serializeString(o, "tokens", tokens);
        string memory json = vm.serializeString(o, "decimals", decs);
        string memory path = string.concat(vm.projectRoot(), "/../deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console2.log("vault", address(vault));
        console2.log("venue", address(venue));
        console2.log("wrote", path);
    }

    function _seed(MockAMMVenue venue, MockERC20 asset, address deployer, uint256 assetAmt) internal {
        asset.mint(deployer, assetAmt);
        asset.approve(address(venue), assetAmt);
        venue.seedPool(address(asset), POOL_USDT, assetAmt);
    }
}
