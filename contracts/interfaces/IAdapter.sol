pragma solidity ^0.8.0;

import "../libraries/Utils.sol";

interface IAdapter {
    function swapExactInput(
        uint256 routerId,
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address from,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory);

    function swapExactInputSingle(
        uint256 routerId,
        uint256 amountIn,
        uint256 amountOut,
        address srcToken,
        address destToken,
        address from,
        address to,
        uint256 deadline
    ) external returns (uint256);
}
