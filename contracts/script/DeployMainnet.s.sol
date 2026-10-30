// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {StreamVault} from "../src/StreamVault.sol";
import {UniV3Venue} from "../src/venues/UniV3Venue.sol";

/// HSK mainnet (177). DO NOT broadcast without sign-off.
/// forge script script/DeployMainnet.s.sol --rpc-url https://mainnet.hsk.xyz --broadcast --legacy --slow
contract DeployMainnet is Script {
    address constant FACTORY = 0x972cA9D1662F5e029cD18327D29026532E84c742;
    address constant ROUTER = 0x2c16f75b95Cf1390c328aB70e2CEE7f4b80bD8F3; // HSKSwap SwapRouter02 (verified on Blockscout)
    address constant USDT = 0xF1B50eD67A9e2CC94Ad3c477779E2d4cBfFf9029;
    address constant WETH = 0xefd4bC9afD210517803f293ABABd701CaeeCdfd0;
    address constant WBTC = 0x6119CA49a79f5825C8B345F8d7aC36B272565b14;
    address constant WHSK = 0xB210D2120d57b758EE163cFfb43e73728c471Cf1;

    function run() external {
        require(block.chainid == 177, "not HSK mainnet");
        uint256 pk = vm.envUint("DEPLOYER_KEY");
        uint256 startBlock = block.number;

        vm.startBroadcast(pk);
        UniV3Venue venue = new UniV3Venue(FACTORY, ROUTER, USDT, 3000);
        StreamVault vault = new StreamVault(address(venue));
        vault.setAllowedToken(WETH, true);
        vault.setAllowedToken(WBTC, true);
        vault.setAllowedToken(WHSK, true);
        vm.stopBroadcast();

        string memory o = "d";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeAddress(o, "vault", address(vault));
        vm.serializeAddress(o, "venue", address(venue));
        vm.serializeAddress(o, "deployer", vm.addr(pk));
        vm.serializeUint(o, "startBlock", startBlock);

        string memory t = "tokens";
        vm.serializeAddress(t, "USDT", USDT);
        vm.serializeAddress(t, "WETH", WETH);
        vm.serializeAddress(t, "WBTC", WBTC);
        string memory tokens = vm.serializeAddress(t, "WHSK", WHSK);

        string memory d = "decimals";
        vm.serializeUint(d, "USDT", 6);
        vm.serializeUint(d, "WETH", 18);
        vm.serializeUint(d, "WBTC", 8);
        string memory decs = vm.serializeUint(d, "WHSK", 18);

        vm.serializeString(o, "tokens", tokens);
        string memory json = vm.serializeString(o, "decimals", decs);
        vm.writeJson(json, string.concat(vm.projectRoot(), "/../deployments/177.json"));
        console2.log("vault", address(vault));
        console2.log("venue", address(venue));
    }
}
