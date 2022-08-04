pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AdapterStorage is Ownable {
    mapping(uint256 => address) internal routers;

    function registerRouter(uint256 routerId, address routerAddress)
        external
        onlyOwner
    {
        routers[routerId] = routerAddress;
    }
}
