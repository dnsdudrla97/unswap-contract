import {
  BigintIsh,
  ChainId,
  Fetcher,
  Pair,
  Route,
  Token,
  TokenAmount,
  Trade,
  TradeType,
} from "@uniswap/sdk";
import { getDefaultProvider } from "ethers";

export interface Path {
  address: string;
  decimals: number;
}

interface CreateTrade {
  amount: BigintIsh;
  path: Path[];
  tradeType: TradeType;
  provider?: ReturnType<typeof getDefaultProvider>;
}

export const createUniswapTrade = async ({
  amount,
  tradeType,
  path,
  provider,
}: CreateTrade) => {
  if (path.length < 2) {
    throw new Error(`Cannot create a pair with ${path.length} tokens`);
  }

  const tokens = path.map(
    (token) => new Token(ChainId.MAINNET, token.address, token.decimals)
  );

  const pairs: Pair[] = [];

  for (let i = 1; i < tokens.length; i++) {
    pairs.push(await Fetcher.fetchPairData(tokens[i], tokens[i - 1], provider));
  }

  return new Trade(
    new Route(pairs, tokens[0], tokens[tokens.length - 1]),
    new TokenAmount(tokens[0], amount),
    tradeType
  );
};

export default createUniswapTrade;
