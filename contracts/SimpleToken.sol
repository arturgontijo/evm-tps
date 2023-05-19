// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleToken is ERC20 {
    address public owner;
    bool public paused = true;

    modifier whenNotPaused() {
        require(!paused, "Onwer has not started the contract yet.");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        owner = msg.sender;
    }

    // Dummy logic just to get revert msg here and in the mintTo() if wanted.
    function start() public {
        require(msg.sender == owner, "Only owner can start it.");
        paused = false;
    }

    function mintTo(address _to, uint _amount) public whenNotPaused {
        _mint(_to, _amount);
    }

    function transferLoop(
        uint8 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint8 i = 0; i < n; i++) {
            transfer(_to, _amount);
        }
    }
}
