// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBlackUSD {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @title Black USD Faucet
/// @notice Dispenses exactly 250 BLUSD per address every 24 hours on LiteForge.
/// @dev The token, claim amount, and cooldown are immutable. Fund this contract
///      by transferring BLUSD to its address after deployment.
contract BLUSDFaucet {
    IBlackUSD public immutable BLUSD;
    uint256 public constant CLAIM_AMOUNT = 250 ether;
    uint256 public constant CLAIM_COOLDOWN = 24 hours;

    mapping(address account => uint256 timestamp) public nextClaimAt;

    error InvalidToken();
    error ClaimNotReady(uint256 availableAt);
    error FaucetEmpty();
    error TransferFailed();

    event Claimed(address indexed account, uint256 amount, uint256 nextClaimAt);

    constructor(address blusdAddress) {
        if (blusdAddress == address(0)) revert InvalidToken();
        BLUSD = IBlackUSD(blusdAddress);
    }

    function claim() external {
        uint256 availableAt = nextClaimAt[msg.sender];
        if (block.timestamp < availableAt) revert ClaimNotReady(availableAt);
        if (BLUSD.balanceOf(address(this)) < CLAIM_AMOUNT) revert FaucetEmpty();

        uint256 nextClaim = block.timestamp + CLAIM_COOLDOWN;
        nextClaimAt[msg.sender] = nextClaim;

        if (!BLUSD.transfer(msg.sender, CLAIM_AMOUNT)) revert TransferFailed();
        emit Claimed(msg.sender, CLAIM_AMOUNT, nextClaim);
    }
}

