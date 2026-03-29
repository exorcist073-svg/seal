// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {SEAL} from "../src/SEAL.sol";

contract DeploySEAL is Script {
    function run() external {
        uint256 minStake = 0.01 ether;

        vm.startBroadcast();

        SEAL seal = new SEAL(minStake);

        console.log("SEAL deployed at:", address(seal));
        console.log("Min stake:", minStake);
        console.log("Owner:", seal.owner());

        vm.stopBroadcast();
    }
}
