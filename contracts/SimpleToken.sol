// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract SimpleToken is ERC20 {
    address public owner;
    bool public paused = true;
    mapping(address => uint) public map;

    uint public f = 2 ** 32;

    struct MyStruct {
        uint256 i01;
        uint256 i02;
        uint256 i03;
        uint256 i04;
        uint256 i05;
        uint256 i06;
        uint256 i07;
        uint256 i08;
        uint256 i09;
        uint256 i10;
        uint256 i11;
        uint256 i12;
        uint256 i13;
        uint256 i14;
    }

    MyStruct public s = MyStruct({
        i01: f,
        i02: f,
        i03: f,
        i04: f,
        i05: f,
        i06: f,
        i07: f,
        i08: f,
        i09: f,
        i10: f,
        i11: f,
        i12: f,
        i13: f,
        i14: f
    });

    event LightEvent();

    event ByteEvent(uint8 indexed a);

    event HeavyStructEvent(MyStruct s1, MyStruct s2, MyStruct s3, MyStruct s4, MyStruct s5, MyStruct s6);

    event HeavyEvent(
        uint256 indexed i00,
        uint256 indexed i01,
        uint256 indexed i02,
        uint256 i03,
        uint256 i04,
        uint256 i05,
        uint256 i06,
        uint256 i07,
        uint256 i08,
        uint256 i09,
        uint256 i10,
        uint256 i11,
        uint256 i12,
        uint256 i13,
        uint256 i14,
        uint256 i15,
        uint256 i16
    );

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

    function pause() public {
        require(msg.sender == owner, "Only owner can pause it.");
        paused = true;
    }

    function mintTo(address _to, uint _amount) public whenNotPaused {
        _mint(_to, _amount);
    }

    // n=1      55k
    // n=10     66k
    // n=100    355k
    // n=250    833k
    // n=500    1.63M
    // n=1000   3.23M
    function transferLoop(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            transfer(_to, _amount);
        }
    }

    // n=1      27k
    // n=10     46k
    // n=100    240k
    // n=250    561k
    // n=500    1.10M
    // n=1000   2.17M
    function eventLoop(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            emit Transfer(msg.sender, _to, _amount);
        }
    }

    // n=1      25k
    // n=10     33k
    // n=100    115k
    // n=250    252k
    // n=500    480k
    // n=1000   934k
    function eventLoopLight(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            emit LightEvent();
        }
    }

    // n=1      25k
    // n=10     37k
    // n=100    153k
    // n=250    347k
    // n=500    670k
    // n=1000   1.32M
    function eventLoopByte(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            emit ByteEvent(uint8(i));
        }
    }

    // n=1      35k
    // n=10     110k
    // n=100    860k
    // n=250    2.08k
    // n=500    4.13M
    // n=1000   8.22M
    function eventLoopHeavy(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            emit HeavyEvent(
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f,
                f
            );
        }
    }

    // n=1      35k
    // n=10     110k
    // n=100    860k
    // n=250    2.08k
    // n=500    4.13M
    // n=1000   8.22M
    function eventLoopHeavyStruct(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            emit HeavyStructEvent(s, s, s, s, s, s);
        }
    }

    // n=1      30k
    // n=10     37k
    // n=100    100k
    // n=250    205k
    // n=500    380k
    // n=1000   745k
    function storageLoop(
        uint16 n,
        address _to,
        uint _amount
    ) public whenNotPaused {
        for (uint16 i = 0; i < n; i++) {
            map[_to] += _amount;
        }
    }
}
