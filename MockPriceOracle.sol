// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockPriceOracle
/// @notice Manually controlled ETH/USD feed for local or testnet demonstrations only.
contract MockPriceOracle {
    address public immutable owner;
    uint256 private _priceUsd8;

    event PriceUpdated(uint256 previousPriceUsd8, uint256 newPriceUsd8);

    error OnlyOwner();
    error InvalidPrice();

    constructor(uint256 initialPriceUsd8) {
        if (initialPriceUsd8 == 0) revert InvalidPrice();
        owner = msg.sender;
        _priceUsd8 = initialPriceUsd8;
    }

    function latestPriceUsd8() external view returns (uint256) {
        return _priceUsd8;
    }

    function setPriceUsd8(uint256 newPriceUsd8) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (newPriceUsd8 == 0) revert InvalidPrice();
        uint256 previous = _priceUsd8;
        _priceUsd8 = newPriceUsd8;
        emit PriceUpdated(previous, newPriceUsd8);
    }
}

/// @title MockUSDC
/// @notice Six-decimal faucet token included only so CommonsVault can be tried in Remix.
/// @dev Anyone may mint. This token has no value and must never be used as real USDC.
contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";
    uint8 public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error InsufficientBalance();
    error InsufficientAllowance();
    error ZeroAddress();

    function mint(address to, uint256 amount) external {
        if (to == address(0)) revert ZeroAddress();
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 available = allowance[from][msg.sender];
        if (available < amount) revert InsufficientAllowance();
        if (available != type(uint256).max) {
            allowance[from][msg.sender] = available - amount;
            emit Approval(from, msg.sender, available - amount);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf[from] < amount) revert InsufficientBalance();
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
