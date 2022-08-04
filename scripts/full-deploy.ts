import {
  ChainId,
  Fetcher,
  Percent,
  Route,
  Token,
  TokenAmount,
  Trade,
  TradeType,
  WETH,
} from "@uniswap/sdk";
import { BigNumber } from "ethers";
const { ethers, upgrades } = require("hardhat");
const dotenv = require("dotenv");
dotenv.config({ path: "./.env.local" });

const addresses = {
  DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  DEAD: "0x000 000000000000000000000000000000000dEaD",
  USDT: ethers.utils.getAddress("0xdac17f958d2ee523a2206206994597c13d831ec7"),
  ETH: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  WETH: WETH[1].address,
  UniswapV2Router: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  SushiSwapRouter: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  ShibaSwapRouter: "0x03f7724180AA6b939894B5Ca4314783B0b36b329",
  SwapperContract: "0x522864625577b80fFaae1B94d703a1913350811d",
};

async function main() {
  const DAIContract = await ethers.getContractAt("IERC20", addresses.DAI);
  const USDCContract = await ethers.getContractAt("IERC20", addresses.USDC);
  const WETHContractIWETH = await ethers.getContractAt("IWETH", addresses.WETH);
  const WETHContractIERC20 = await ethers.getContractAt(
    "IERC20",
    addresses.WETH
  );
  const Utils = await ethers.getContractFactory("Utils");
  const utils = await Utils.deploy();
  await utils.deployed();
  const Swapper = await ethers.getContractFactory("Swapper");
  const UniswapV2Adapter = await ethers.getContractFactory("UniswapV2Adapter");
  const swap = await Swapper.deploy();
  const uniswapV2Adapter = await UniswapV2Adapter.deploy(swap.address);
  await swap.deployed();
  console.log(`Swap contract deployed at: ${swap.address}`);
  await uniswapV2Adapter.deployed();
  console.log(
    `UniswapV2Adapter contract deployed at: ${uniswapV2Adapter.address}`
  );

  const adaptersRouters = [
    {
      adapterAddress: uniswapV2Adapter.address,
      routers: [
        addresses.UniswapV2Router,
        addresses.SushiSwapRouter,
        addresses.ShibaSwapRouter,
      ],
    },
  ];

  for (let i = 0; i < adaptersRouters.length; i++) {
    await swap.registerAdapter(i, adaptersRouters[i].adapterAddress);

    // Register routers for adapters to use
    for (let j = 0; j < adaptersRouters[i].routers.length; j++) {
      // console.log(`Index: ${j} - Address: ${adaptersRouters[i].routers[j]}`);
      await uniswapV2Adapter.registerRouter(j, adaptersRouters[i].routers[j]);
    }
  }
  return {
    DAIContract,
    USDCContract,
    WETHContractIWETH,
    WETHContractIERC20,
    utils,
    swap,
    uniswapV2Adapter,
  };
}

async function multiSwapp() {
  const chainId = ChainId.RINKEBY;
  const DAI = new Token(chainId, addresses.DAI, 18);
  const USDC = new Token(chainId, addresses.USDC, 6);

  const [owner] = await ethers.getSigners();
  console.log(`Owner: ${owner.address}`);
  const amountIn = ethers.utils.parseEther("1");
  const slippageTolerance = new Percent("50", "10000");
  const pair = await Fetcher.fetchPairData(DAI, WETH[DAI.chainId]);
  const pair2 = await Fetcher.fetchPairData(DAI, USDC);
  const route = new Route([pair], WETH[DAI.chainId]);
  const route2 = new Route([pair2], DAI);
  const trade = new Trade(
    route,
    new TokenAmount(WETH[DAI.chainId], amountIn.toString()),
    TradeType.EXACT_INPUT
  );
  const path = [addresses.ETH, addresses.DAI];
  const path2 = [addresses.DAI, addresses.USDC];
  const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw; // needs to be converted to e.g. hex
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time

  const SwapperFactory = await ethers.getContractFactory("Swapper");
  const Swapper = await SwapperFactory.attach(addresses.SwapperContract);
  console.log("approve Swapper transfer for init..");
  const tx = await Swapper.multiSwapExactInput(
    {
      to: owner.address,
      amountIn,
      srcToken: path[0],
      destToken: path[path.length - 1],
      swaps: [
        {
          routerId: 0,
          adapterId: 0,
          amountOut: amountOutMin.toString(),
          deadline,
          path: [addresses.WETH, addresses.DAI],
          percent: 10000,
        },
      ],
    },
    { value: amountIn }
  );
  console.log(`MultiSwapExactInput tx: ${tx.hash}`);
}

multiSwapp().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
