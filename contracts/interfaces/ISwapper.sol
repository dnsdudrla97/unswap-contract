pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../libraries/Utils.sol";

interface ISwapper {
    function transferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) external;
}
