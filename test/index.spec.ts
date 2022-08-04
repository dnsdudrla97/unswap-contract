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
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers, waffle } from "hardhat";
import { IERC20, IWETH, Swapper, UniswapV2Adapter, Utils } from "../typechain";
import createUniswapTrade from "./utils/createUniswapTrade";
import tokens from "./utils/tokens";

const provider = waffle.provider;
const createFixtureLoader = waffle.createFixtureLoader;

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
};

async function fixture() {
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
  // const Executor = await ethers.getContractFactory("Executor");
  const UniswapV2Adapter = await ethers.getContractFactory("UniswapV2Adapter");
  // const ExampleContract = await ethers.getContractFactory("ExampleContract");
  // exampleContract = await ExampleContract.deploy();
  // const executor = await Executor.deploy();
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

describe("Swap", function () {
  let swap: Swapper;
  let DAIContract: IERC20;
  let USDCContract: IERC20;
  let WETHContractIWETH: IWETH;
  let WETHContractIERC20: IERC20;
  const chainId = ChainId.MAINNET;
  const DAI = new Token(chainId, addresses.DAI, 18);
  const USDC = new Token(chainId, addresses.USDC, 6);
  let uniswapV2Adapter: UniswapV2Adapter;
  let utils: Utils;
  let wallet: Wallet;
  let other: Wallet;
  let loadFixture: ReturnType<typeof createFixtureLoader>;
  before("create fixture loader", async () => {
    [wallet, other] = (await ethers.getSigners()) as any;
    loadFixture = createFixtureLoader([wallet, other]);
  });
  beforeEach("deploy fixture", async function () {
    ({
      DAIContract,
      USDCContract,
      WETHContractIWETH,
      WETHContractIERC20,
      utils,
      swap,
      uniswapV2Adapter,
    } = await loadFixture(fixture));
  });
  it("should revert when the adapter does not exist", async function () {
    const [owner] = await ethers.getSigners();

    await expect(
      swap.multiSwapExactInput({
        to: owner.address,
        amountIn: 0,
        srcToken: addresses.WETH,
        destToken: addresses.USDC,
        swaps: [
          {
            adapterId: 999,
            amountOut: 0,
            deadline: 0,
            path: [addresses.WETH, addresses.USDC],
            percent: 10000,
            routerId: 0,
          },
        ],
      })
    ).revertedWith("Adapter not registered");
  });
  it("should swap tokens given ETH", async function () {
    const [owner] = await ethers.getSigners();
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
    await swap.multiSwapExactInput(
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
    const DAIBalance = await DAIContract.balanceOf(owner.address);
    const trade2 = new Trade(
      route2,
      new TokenAmount(USDC, ethers.utils.parseUnits("1000", 6).toString()),
      TradeType.EXACT_OUTPUT
    );
    const amountOutMin2 = trade2.minimumAmountOut(slippageTolerance).raw;
    await DAIContract.approve(swap.address, DAIBalance);
    await swap.multiSwapExactInput({
      to: owner.address,
      amountIn: DAIBalance,
      srcToken: path2[0],
      destToken: path2[path2.length - 1],
      swaps: [
        {
          adapterId: 0,
          routerId: 0,
          amountOut: amountOutMin2.toString(),
          deadline,
          path: path2,
          percent: 10000,
        },
      ],
    });
  });
  // it.skip("should execute simple swaps from uniswap", async function () {
  //   const [owner] = await ethers.getSigners();
  //   const amountIn = ethers.utils.parseEther("1");
  //   const slippageTolerance = new Percent("50", "10000");
  //   const pair = await Fetcher.fetchPairData(DAI, WETH[DAI.chainId]);
  //   const uniswapV2Router = await ethers.getContractAt(
  //     "IUniswapV2Router02",
  //     addresses.UniswapV2Router
  //   );
  //   const route = new Route([pair], WETH[DAI.chainId]);
  //   const trade = new Trade(
  //     route,
  //     new TokenAmount(WETH[DAI.chainId], amountIn.toString()),
  //     TradeType.EXACT_INPUT
  //   );
  //   const path = [WETH[DAI.chainId].address, addresses.DAI];
  //   const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw; // needs to be converted to e.g. hex
  //   const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
  //   WETHContractIWETH.deposit({ value: ethers.utils.parseEther("1") });
  //   await WETHContractIERC20.approve(addresses.UniswapV2Router, amountIn);
  //   const tx = await uniswapV2Router.swapExactTokensForTokens(
  //     amountIn,
  //     amountOutMin.toString(),
  //     path,
  //     owner.address,
  //     deadline
  //   );
  //   const receipt = await tx.wait();
  //   console.log(receipt.gasUsed.toNumber());
  //   expect(receipt.gasUsed.toNumber()).to.be.lessThanOrEqual(162789);
  // });
  it("should execute simple swaps from WETH to DAI from single swap function", async function () {
    const [owner] = await ethers.getSigners();
    const amountIn = ethers.utils.parseEther("1");
    const slippageTolerance = new Percent("50", "10000");
    const pair = await Fetcher.fetchPairData(DAI, WETH[DAI.chainId]);
    const route = new Route([pair], WETH[DAI.chainId]);
    const trade = new Trade(
      route,
      new TokenAmount(WETH[DAI.chainId], amountIn.toString()),
      TradeType.EXACT_INPUT
    );
    const path = [WETH[DAI.chainId].address, addresses.DAI];
    const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw; // needs to be converted to e.g. hex
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    WETHContractIWETH.deposit({ value: ethers.utils.parseEther("2") });
    await WETHContractIERC20.approve(
      swap.address,
      ethers.utils.parseEther("2")
    );

    const txMultiDex = await swap.multiSwapExactInput({
      to: owner.address,
      amountIn,
      srcToken: WETH[DAI.chainId].address,
      destToken: addresses.DAI,
      swaps: [
        {
          adapterId: 0,
          routerId: 0,
          deadline,
          path,
          amountOut: amountOutMin.toString(),
          percent: 10000,
        },
      ],
    });
    const txSingle = await swap.simpleSwapExactInputSingle(
      0,
      0,
      amountIn,
      amountOutMin.toString(),
      WETH[DAI.chainId].address,
      addresses.DAI,
      owner.address,
      deadline
    );
    // const receiptMulti = await tx.wait();
    const receiptMultiDex = await txMultiDex.wait();
    const receiptSingle = await txSingle.wait();
    // console.log(
    //   `\tSwap single: Gas ${receiptSingle.gasUsed.toNumber()}
    //     Swap multi dex: Gas ${receiptMultiDex.gasUsed.toNumber()}`
    // );
    expect(receiptSingle.gasUsed.toNumber()).to.be.lessThan(
      receiptMultiDex.gasUsed.toNumber()
    );
  });
  it("should execute simple swaps from ETH to DAI from single swap function", async function () {
    const [owner] = await ethers.getSigners();
    const amountIn = ethers.utils.parseEther("1");
    const slippageTolerance = new Percent("50", "10000");
    const pair = await Fetcher.fetchPairData(DAI, WETH[DAI.chainId]);
    const route = new Route([pair], WETH[DAI.chainId]);
    const trade = new Trade(
      route,
      new TokenAmount(WETH[DAI.chainId], amountIn.toString()),
      TradeType.EXACT_INPUT
    );
    const path = [addresses.ETH, addresses.DAI];
    const amountOutMin = trade.minimumAmountOut(slippageTolerance).raw; // needs to be converted to e.g. hex
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    // const tx = await swap.simpleSwapExactInput(
    //   0,
    //   0,
    //   amountIn,
    //   amountOutMin.toString(),
    //   path,
    //   owner.address,
    //   deadline,
    //   { value: amountIn }
    // );

    const tx = await swap.multiSwapExactInput(
      {
        to: owner.address,
        amountIn: amountIn,
        srcToken: path[0],
        destToken: path[path.length - 1],
        swaps: [
          {
            adapterId: 0,
            routerId: 0,
            amountOut: amountOutMin.toString(),
            deadline,
            path: [addresses.WETH, addresses.DAI],
            percent: 10000,
          },
        ],
      },
      { value: amountIn }
    );
    const txSingle = await swap.simpleSwapExactInputSingle(
      0,
      0,
      amountIn,
      amountOutMin.toString(),
      addresses.ETH,
      // addresses.DAI,
      addresses.DAI,
      owner.address,
      deadline,
      { value: amountIn }
    );
    const receiptMulti = await tx.wait();
    const receiptSingle = await txSingle.wait();
    // console.log(
    //   `Swap single: Gas ${receiptSingle.gasUsed.toNumber()} | Swap multi: Gas ${receiptMulti.gasUsed.toNumber()}`
    // );
    expect(receiptSingle.gasUsed.toNumber()).to.be.lessThan(
      receiptMulti.gasUsed.toNumber()
    );
  });
  it("should multi swaps on a single DEX. ETH => USDC", async function () {
    // Overview: Swap ETH to USDC
    // Swap WETH to USDC via WETH => USDC (40%)
    // Swap WETH to USDC via WETH => USDT => USDC (30%)
    // Swap WETH to USDC via WETH => DAI => USDC (30%)

    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };

    /* eslint-disable camelcase */

    const WETH_USDC_path = [tokens.WETH, tokens.USDC];
    const WETH_USDT_USDC_path = [tokens.WETH, tokens.USDT, tokens.USDC];
    const WETH_DAI_USDC_path = [tokens.WETH, tokens.DAI, tokens.USDC];

    const adapterId = 0;
    const routerId = 0;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time

    const metadata = {
      adapterId,
      routerId,
      deadline,
    };
    const percentsSplit = [4000, 3000, 3000];

    const WETH_USDC_trade = await createUniswapTrade({
      path: WETH_USDC_path,
      amount: amountInEthers.div(10000).mul(percentsSplit[0]).toString(),
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });

    const WETH_USDT_USDC_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(percentsSplit[1]).toString(),
      path: WETH_USDT_USDC_path,
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });

    const WETH_DAI_USDC_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(percentsSplit[2]).toString(),
      path: WETH_DAI_USDC_path,
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });
    /* eslint-enable camelcase */

    const [owner] = await ethers.getSigners();
    const totalMinimumOut = WETH_USDC_trade.minimumAmountOut(slippageTolerance)
      .add(WETH_USDT_USDC_trade.minimumAmountOut(slippageTolerance))
      .add(WETH_DAI_USDC_trade.minimumAmountOut(slippageTolerance));

    await swap.multiSwapExactInput(
      {
        amountIn: amountInEthers,
        srcToken: addresses.ETH,
        destToken: addresses.USDC,
        swaps: [
          {
            ...metadata,
            percent: percentsSplit[0],
            amountOut: getMinimumAmountOut(WETH_USDC_trade),
            path: WETH_USDC_path.map((val) => val.address),
          },
          {
            ...metadata,
            percent: percentsSplit[1],
            amountOut: getMinimumAmountOut(WETH_USDT_USDC_trade),
            path: WETH_USDT_USDC_path.map((val) => val.address),
          },
          {
            ...metadata,
            percent: percentsSplit[2],
            amountOut: getMinimumAmountOut(WETH_DAI_USDC_trade),
            path: WETH_DAI_USDC_path.map((val) => val.address),
          },
        ],
        to: owner.address,
      },
      { value: amountInEthers }
    );

    const formattedFinalBalance = ethers.utils.formatUnits(
      await USDCContract.balanceOf(owner.address),
      6
    );
    const formattedTotalMinimumOut = ethers.utils.formatUnits(
      totalMinimumOut.raw.toString(),
      6
    );

    expect(+formattedFinalBalance).to.be.greaterThanOrEqual(
      +formattedTotalMinimumOut
    );
  });

  it("should not revert when source and destination tokens are ETH", async () => {
    // Swap ETH to another token and swap back to ETH
    // Steps:
    // Swap ETH => WETH => USDC => DAI => WETH => ETH (60%)
    // Swap ETH => WETH => USDT => DAI => WETH => ETH (40%)
    const [owner] = await ethers.getSigners();

    const amountInEthers = ethers.utils.parseEther("1");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const adapterId = 0;
    const routerId = 0;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time

    const metadata = {
      adapterId,
      routerId,
      deadline,
    };

    const percentsSplit = [6000, 4000];

    /* eslint-disable camelcase */
    const WETH_USDC_DAI_WETH_path = [
      tokens.WETH,
      tokens.USDC,
      tokens.DAI,
      tokens.WETH,
    ];
    const WETH_USDT_DAI_WETH_path = [
      tokens.WETH,
      tokens.USDT,
      tokens.DAI,
      tokens.WETH,
    ];

    const WETH_USDC_DAI_WETH_trade = await createUniswapTrade({
      path: WETH_USDC_DAI_WETH_path,
      amount: amountInEthers.div(10000).mul(percentsSplit[0]).toString(),
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });

    const WETH_USDT_DAI_WETH_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(percentsSplit[1]).toString(),
      path: WETH_USDT_DAI_WETH_path,
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });

    await expect(
      swap.multiSwapExactInput(
        {
          amountIn: amountInEthers,
          srcToken: addresses.ETH,
          destToken: addresses.ETH,
          swaps: [
            {
              ...metadata,
              percent: percentsSplit[0],
              amountOut: getMinimumAmountOut(WETH_USDC_DAI_WETH_trade),
              path: WETH_USDC_DAI_WETH_path.map((val) => val.address),
            },
            {
              ...metadata,
              percent: percentsSplit[1],
              amountOut: getMinimumAmountOut(WETH_USDT_DAI_WETH_trade),
              path: WETH_USDT_DAI_WETH_path.map((val) => val.address),
            },
          ],
          to: owner.address,
        },
        { value: amountInEthers }
      )
    ).to.not.be.reverted;
  });
  it("should perform multi swaps where the destination token is ETH", async () => {
    // Wrap ETH
    // Swap WETH to USDC via WETH => USDC (40%)
    // Swap WETH to USDT via WETH => USDT (60%)
    // Swap USDC to ETH
    // Swap USDT to ETH

    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const adapterId = 0;
    const routerId = 0;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time

    const metadata = {
      adapterId,
      routerId,
      deadline,
    };

    const [owner] = await ethers.getSigners();

    const percentsSplit = [6000, 4000];

    await WETHContractIWETH.deposit({ value: amountInEthers });
    const WETHBalance = await WETHContractIERC20.balanceOf(owner.address);
    expect(WETHBalance.toString()).to.equal(amountInEthers.toString());
    await WETHContractIERC20.approve(swap.address, amountInEthers);

    /* eslint-disable camelcase */
    const WETH_USDC_DAI_WETH_path = [
      tokens.WETH,
      tokens.USDC,
      tokens.DAI,
      tokens.WETH,
    ];
    const WETH_USDT_DAI_WETH_path = [
      tokens.WETH,
      tokens.USDT,
      tokens.DAI,
      tokens.WETH,
    ];

    const WETH_USDC_DAI_WETH_trade = await createUniswapTrade({
      path: WETH_USDC_DAI_WETH_path,
      amount: amountInEthers.div(10000).mul(percentsSplit[0]).toString(),
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });

    const WETH_USDT_DAI_WETH_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(percentsSplit[1]).toString(),
      path: WETH_USDT_DAI_WETH_path,
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });

    const totalMinimumOut = WETH_USDC_DAI_WETH_trade.minimumAmountOut(
      slippageTolerance
    ).add(WETH_USDT_DAI_WETH_trade.minimumAmountOut(slippageTolerance));

    await swap.multiSwapExactInput({
      amountIn: amountInEthers,
      srcToken: addresses.WETH,
      destToken: addresses.ETH,
      swaps: [
        {
          ...metadata,
          percent: percentsSplit[0],
          amountOut: getMinimumAmountOut(WETH_USDC_DAI_WETH_trade),
          path: WETH_USDC_DAI_WETH_path.map((val) => val.address),
        },
        {
          ...metadata,
          percent: percentsSplit[1],
          amountOut: getMinimumAmountOut(WETH_USDT_DAI_WETH_trade),
          path: WETH_USDT_DAI_WETH_path.map((val) => val.address),
        },
      ],
      to: owner.address,
    });

    /* eslint-enable camelcase */
    const swapBalance = await provider.getBalance(swap.address);
    const newOwnerBalance = await owner.getBalance();
    const formattedFinalBalance = ethers.utils.formatEther(newOwnerBalance);
    const formattedTotalMinimumOut = ethers.utils.formatEther(
      totalMinimumOut.raw.toString()
    );

    expect(+formattedFinalBalance).to.be.greaterThanOrEqual(
      +formattedTotalMinimumOut
    );

    expect(swapBalance.toString()).to.equal("0");
  });
  it("should revert given a wrong router to the adapter and using a direct swap", async () => {
    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    const [owner] = await ethers.getSigners();
    const WETH_DAI_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(1000).toString(),
      path: [tokens.WETH, tokens.DAI],
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });
    await expect(
      swap.simpleSwapExactInputSingle(
        0,
        99,
        amountInEthers,
        getMinimumAmountOut(WETH_DAI_trade).toString(),
        addresses.WETH,
        addresses.DAI,
        owner.address,
        deadline
      )
    ).to.be.revertedWith("Router not registered");
  });
  // it("should not perform multi swaps where ETH is in the middle path", async () => {});
  it("should revert given a wrong router to the adapter and using multi swap", async () => {
    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    const [owner] = await ethers.getSigners();
    const WETH_DAI_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(1000).toString(),
      path: [tokens.WETH, tokens.DAI],
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });
    await expect(
      swap.multiSwapExactInput({
        to: owner.address,
        amountIn: amountInEthers,
        srcToken: addresses.WETH,
        destToken: addresses.DAI,
        swaps: [
          {
            adapterId: 0,
            routerId: 99,
            deadline,
            amountOut: getMinimumAmountOut(WETH_DAI_trade).toString(),
            path: [addresses.WETH, addresses.DAI],
            percent: 10000,
          },
        ],
      })
    ).to.be.revertedWith("Router not registered");
  });

  it("should revert when the destination doesn't match on multi swap", async () => {
    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    const [owner] = await ethers.getSigners();
    const WETH_DAI_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(1000).toString(),
      path: [tokens.WETH, tokens.DAI],
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });
    await expect(
      swap.multiSwapExactInput({
        to: owner.address,
        amountIn: amountInEthers,
        srcToken: addresses.WETH,
        destToken: addresses.DAI,
        swaps: [
          {
            adapterId: 0,
            routerId: 0,
            deadline,
            amountOut: getMinimumAmountOut(WETH_DAI_trade).toString(),
            path: [addresses.WETH, addresses.USDC],
            percent: 10000,
          },
        ],
      })
    ).to.be.revertedWith("destToken doesn't match");
  });
  it("should revert if the source token is not ETH and some ETH was sent along with the transaction", async () => {
    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    const [owner] = await ethers.getSigners();
    const WETH_DAI_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(1000).toString(),
      path: [tokens.WETH, tokens.DAI],
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });
    await expect(
      swap.multiSwapExactInput(
        {
          to: owner.address,
          amountIn: amountInEthers,
          srcToken: addresses.WETH,
          destToken: addresses.DAI,
          swaps: [
            {
              adapterId: 0,
              routerId: 0,
              deadline,
              amountOut: getMinimumAmountOut(WETH_DAI_trade).toString(),
              path: [addresses.WETH, addresses.USDC],
              percent: 10000,
            },
          ],
        },
        { value: amountInEthers }
      )
    ).to.be.revertedWith("destToken doesn't match");
  });
  it("should revert if ETH is the token input and no value is sent", async () => {
    const amountInEthers = ethers.utils.parseEther("10");
    const slippageTolerance = new Percent("50", "10000");
    const getMinimumAmountOut = (trade: Trade) => {
      return trade.minimumAmountOut(slippageTolerance).raw.toString();
    };
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from the current Unix time
    const [owner] = await ethers.getSigners();
    const WETH_DAI_trade = await createUniswapTrade({
      amount: amountInEthers.div(10000).mul(1000).toString(),
      path: [tokens.WETH, tokens.DAI],
      tradeType: TradeType.EXACT_INPUT,
      provider,
    });
    await expect(
      swap.multiSwapExactInput({
        to: owner.address,
        amountIn: amountInEthers,
        srcToken: addresses.ETH,
        destToken: addresses.DAI,
        swaps: [
          {
            adapterId: 0,
            routerId: 0,
            deadline,
            amountOut: getMinimumAmountOut(WETH_DAI_trade).toString(),
            path: [addresses.WETH, addresses.USDC],
            percent: 10000,
          },
        ],
      })
    ).to.be.revertedWith("Value must be non-zero");
  });
});
