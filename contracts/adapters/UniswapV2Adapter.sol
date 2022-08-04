// SPDX-License-Identifier: UNLICENSE
pragma solidity ^0.8.0;

import "../interfaces/IAdapter.sol";
import "../interfaces/IUniswapV2Router02.sol";
import "../interfaces/IWETH.sol";
import "../libraries/Utils.sol";
import "../interfaces/ISwapper.sol";
// import "../libraries/UniswapV2Library.sol";
import "./AdapterStorage.sol";
// import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniswapV2Adapter is AdapterStorage {
    event Received(address, uint256);

    ISwapper internal swapper;

    constructor(address swapContract) {
        swapper = ISwapper(swapContract);
    }

    /// @notice Swaps multiple tokens
    /// @dev Swaps tokens that have a path greater or equal to two
    /// @return amounts The amounts returned for each token.
    function swapExactInput(
        uint256 routerId,
        uint256 amountIn,
        uint256 amountOut,
        address[] memory path,
        address from,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts) {
        require(routers[routerId] != address(0), "ERR-01");
        IUniswapV2Router02 router = IUniswapV2Router02(routers[routerId]);
        IERC20 tokenToSell = IERC20(path[0]);
        swapper.transferFrom(tokenToSell, from, address(this), amountIn);
        assert(tokenToSell.approve(address(router), amountIn));

        amounts = router.swapExactTokensForTokens(
            amountIn,
            amountOut,
            path,
            to,
            deadline
        );
    }


    /// @notice Swaps tokens that have a direct path.
    /// @dev Swaps tokens where the path includes only two tokens.
    /// @return amountSwapped The amount swapped
    function swapExactInputSingle(
        uint256 routerId,
        uint256 amountIn,
        uint256 amountOut,
        address srcToken,
        address destToken,
        address from,
        address to,
        uint256 deadline
    ) external returns (uint256 amountSwapped) {
        require(routers[routerId] != address(0), "ERR-01");
        IUniswapV2Router02 router = IUniswapV2Router02(routers[routerId]);
        IERC20 tokenToSell = IERC20(srcToken);
        swapper.transferFrom(tokenToSell, from, address(this), amountIn);

        address[] memory path = new address[](2);
        path[0] = address(srcToken);
        path[1] = address(destToken);
        assert(tokenToSell.approve(address(router), amountIn));

        amountSwapped = router.swapExactTokensForTokens(
            amountIn,
            amountOut,
            path,
            to,
            deadline
        )[1];
    }
}
