import { BigNumber } from 'ethers';

export type TokenAddress = string;

export type Pair = {
  tokenA: TokenAddress;
  tokenB: TokenAddress;
};

export type Borrow = {
  token: TokenAddress;
  amount: BigNumber;
};

export type PairIndex = {
  indexTokenA: number;
  indexTokenB: number;
};

export function buildGetNextSwapInfoInput(
  pairsToSwap: Pair[],
  checkAvailableToBorrow: TokenAddress[]
): { tokens: TokenAddress[]; pairIndexes: PairIndex[] } {
  const fakeAmounts = checkAvailableToBorrow.map((token) => ({ token, amount: BigNumber.from(0) }));
  const { tokens, pairIndexes } = buildSwapInput(pairsToSwap, fakeAmounts);
  return { tokens, pairIndexes };
}

export function buildSwapInput(
  pairsToSwap: Pair[],
  borrow: Borrow[]
): { tokens: TokenAddress[]; pairIndexes: PairIndex[]; borrow: BigNumber[] } {
  const tokens: TokenAddress[] = getUniqueTokens(pairsToSwap, borrow);
  const pairIndexes = getIndexes(pairsToSwap, tokens);
  assertValid(pairIndexes);
  const toBorrow = buildBorrowArray(tokens, borrow);
  return { tokens, pairIndexes, borrow: toBorrow };
}

function buildBorrowArray(tokens: TokenAddress[], borrow: Borrow[]): BigNumber[] {
  const borrowMap = new Map(borrow.map(({ token, amount }) => [token, amount]));
  return tokens.map((token) => borrowMap.get(token) ?? BigNumber.from(0));
}

function assertValid(indexes: PairIndex[]) {
  for (const { indexTokenA, indexTokenB } of indexes) {
    if (indexTokenA === indexTokenB) {
      throw Error('Found duplicates in same pair');
    }
  }

  for (let i = 1; i < indexes.length; i++) {
    if (indexes[i - 1].indexTokenA === indexes[i].indexTokenA && indexes[i - 1].indexTokenB === indexes[i].indexTokenB) {
      throw Error('Found duplicates');
    }
  }
}

/**
 * Given a list of pairs and a list of sorted tokens, maps each pair into the index of each token
 * (inside the list of tokens). The list of indexes will also be sorted, first by tokenA and then by tokenB
 */
function getIndexes(pairs: Pair[], tokens: TokenAddress[]): PairIndex[] {
  return pairs
    .map(({ tokenA, tokenB }) => ({ indexTokenA: tokens.indexOf(tokenA), indexTokenB: tokens.indexOf(tokenB) }))
    .map(({ indexTokenA, indexTokenB }) => ({
      indexTokenA: Math.min(indexTokenA, indexTokenB),
      indexTokenB: Math.max(indexTokenA, indexTokenB),
    }))
    .sort((a, b) => a.indexTokenA - b.indexTokenA || a.indexTokenB - b.indexTokenB);
}

/** Given a list of pairs, returns a sorted list of the tokens involved */
function getUniqueTokens(pairs: Pair[], borrow: Borrow[]): TokenAddress[] {
  const tokenSet: Set<TokenAddress> = new Set();
  for (const { tokenA, tokenB } of pairs) {
    tokenSet.add(tokenA);
    tokenSet.add(tokenB);
  }

  for (const { token } of borrow) {
    tokenSet.add(token);
  }

  return [...tokenSet].sort((a, b) => a.localeCompare(b));
}
