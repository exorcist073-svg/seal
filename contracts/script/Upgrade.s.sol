// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/SEAL.sol";

contract UpgradeSEAL is Script {
    function run() external {
        // Existing proxy address on Base Sepolia
        address proxy = 0x9af9C6fe2a845354EcC3bDCe1af9c427Fb42Ed70;

        vm.startBroadcast();

        // 1. Deploy new implementation
        SEAL newImpl = new SEAL();
        console.log("New implementation:", address(newImpl));

        // 2. Upgrade proxy to new implementation (no reinit needed)
        SEAL seal = SEAL(payable(proxy));
        seal.upgradeToAndCall(address(newImpl), "");

        // 3. Verify new function exists
        bool result = seal.isRegisteredStaker(address(0));
        console.log("isRegisteredStaker(0x0):", result);
        console.log("Owner:", seal.owner());

        vm.stopBroadcast();
    }
}
