
pragma solidity ^0.8.0;

import "./interfaces/IUniswapV2Pair.sol";
import "./libraries/Utils.sol";
import "./interfaces/IUniswapV2Router02.sol";
import "./interfaces/IWETH.sol";
import "./interfaces/IAdapter.sol";
import "./interfaces/ISwapper.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Swapper is Ownable, ISwapper {
    using SafeERC20 for IERC20;

    event Received(address, uint256);
    event Swap(
        address indexed sender,
        address indexed recipient,
        address srcToken,
        address destToken,
        uint256 expectedAmount,
        uint256 receivedAmount,
        uint256 percent
    );

    mapping(uint256 => address) public adapters;

    enum SwapSide {
        BUY,
        SELL
    }

    struct SwapStep {
        uint256 adapterId;
        uint256 routerId;
        address[] path;
        uint256 percent;
        uint256 amountOut;
        uint256 deadline;
    }

    struct MultiSwapParams {
        address to;
        address srcToken;
        address destToken;
        uint256 amountIn;
        SwapStep[] swaps;
    }
    
    struct SingleSwap {
        uint adapterId;
        uint routerId;
        uint amountIn;
        uint amountOut;
        uint deadline;
        address[] path;
        address to;
    }

    function simpleSwapExactInputSingle(
        uint256 adapterId,
        uint256 routerId,
        uint256 amountIn,
        uint256 amountOut,
        address srcToken,
        address destToken,

        address to,
        uint256 deadline
    ) external payable returns (uint256) {
        require(adapters[adapterId] != address(0), "Adapter not registered");
        IAdapter adapter = IAdapter(adapters[adapterId]);
        address from;
        (srcToken, from) = _wrapETH(amountIn, srcToken);

        if (from == address(this)) {
            assert(IERC20(Utils.WETH).approve(address(adapter), amountIn));
        }

        return
            adapter.swapExactInputSingle(
                routerId,
                amountIn,
                amountOut,
                srcToken,
                destToken,
                from,
                to,
                deadline
            );
    }

    function _wrapETH(uint256 amountToWrap, address tokenInput)
        internal
        returns (address tokenOutput, address from)
    {
        if (tokenInput == Utils.ETH) {
            require(msg.value > 0, "Value must be non-zero");
            require(msg.value == amountToWrap, "Value doesn't match");
            IWETH(Utils.WETH).deposit{value: msg.value}();
            tokenOutput = Utils.WETH;
            from = address(this);
        } else {
            tokenOutput = tokenInput;
            from = msg.sender;
        }
    }

    function multiSwapExactInput(MultiSwapParams memory params)
        external
        payable
    {
        address from;
        address to = params.to;

        (params.srcToken, from) = _wrapETH(params.amountIn, params.srcToken);

        if (params.destToken == Utils.ETH) {
    
            to = address(this);
        }
        uint256 totalAmountsOut = 0;
        for (uint256 i = 0; i < params.swaps.length; i++) {
            SwapStep memory swapParams = params.swaps[i];
            require(
                adapters[swapParams.adapterId] != address(0),
                "Adapter not registered"
            );
            address destSwapToken = swapParams.path[swapParams.path.length - 1];

    
            require(
                destSwapToken == params.destToken ||
                    (destSwapToken == Utils.WETH &&
                        params.destToken == Utils.ETH),
                "destToken doesn't match"
            );

    
            uint256 amountIn = (params.amountIn * swapParams.percent) / 10000;
            IAdapter adapter = IAdapter(adapters[swapParams.adapterId]);

            uint256[] memory amounts = adapter.swapExactInput(
                swapParams.routerId,
                amountIn,
                swapParams.amountOut,
                swapParams.path,
                from,
                to,
                swapParams.deadline
            );
            totalAmountsOut += amounts[amounts.length - 1];
            emit Swap(
                msg.sender,
                params.to,
                params.srcToken,
                params.destToken,
                swapParams.amountOut,
                amounts[amounts.length - 1],
                swapParams.percent
            );
        }

        if (params.destToken == Utils.ETH) {
            IWETH(Utils.WETH).withdraw(totalAmountsOut);
            payable(msg.sender).transfer(totalAmountsOut);
        }
    }

    function transferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) external override {
        token.safeTransferFrom(from, to, amount);
    }

    function registerAdapter(uint256 _adapterIdx, address _routerAddress)
        external
        onlyOwner
    {
        adapters[_adapterIdx] = _routerAddress;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }
}
