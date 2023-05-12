// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleToken is ERC20 {
    address public owner;
    bool public _canMint = false;

    constructor(
        string memory _name,
        string memory _symbol
    ) ERC20(_name, _symbol) {
        owner = msg.sender;
    }

    // Dummy logic just to get revert msg here and in the mintTo() if wanted.
    function start() public {
        require(msg.sender == owner, "Only owner can start it.");
        _canMint = true;
    }

    function mintTo(address _to, uint _amount) public {
        require(_canMint, "Onwer has not started the minting yet.");
        _mint(_to, _amount);
    }

}