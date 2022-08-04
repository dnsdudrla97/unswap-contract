### digraph
``` js
digraph G {
  graph [ ratio = "auto", page = "40" ];
  "Swapper";
  "Ownable";
  "ISwapper";
  "IUniswapV2Pair";
  "Utils";
  "IUniswapV2Router02";
  "IUniswapV2Router01";
  "IWETH";
  "IAdapter";
  "IERC20";
  "console";
  "IERC20Metadata";
  "SafeERC20";
  "IERC20Permit";
  "Address";
  "EnumerableMap";
  "EnumerableSet";
  "Context";
  "Swapper" -> "Ownable";
  "Swapper" -> "ISwapper";
  "IUniswapV2Router02" -> "IUniswapV2Router01";
  "IERC20Metadata" -> "IERC20";
  "Ownable" -> "Context";
}

```

### Test-Net
- Rinkeby: 0x522864625577b80fFaae1B94d703a1913350811d

### Error List

- ERR-01: "Router not registered"
- ERR-02: "Adapter not registered"
- ERR-03: "destToken doesn't match"
- ERR-04: "Value must be non-zero"
- ERR-05: "Value doesn't match"