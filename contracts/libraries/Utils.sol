pragma solidity ^0.8.0;

library Utils {
    enum SwapType {
        GIVEN_IN,
        GIVEN_OUT
    }

    address public constant WETH =
        address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    address public constant ETH =
        address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE);
}
