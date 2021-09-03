export type TokenAddress = string;

export type Pair = {
  tokenA: TokenAddress;
  tokenB: TokenAddress;
};

export type PairIndex = {
  indexTokenA: number;
  indexTokenB: number;
};

export function buildSwapInput(pairs: Pair[]): { tokens: TokenAddress[]; indexes: PairIndex[] } {
  const tokens: TokenAddress[] = getUniqueTokens(pairs);
  const indexes = getIndexes(pairs, tokens);
  assertValid(indexes);
  return { tokens, indexes };
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
function getUniqueTokens(pairs: Pair[]): TokenAddress[] {
  const tokenSet: Set<TokenAddress> = new Set();
  for (const { tokenA, tokenB } of pairs) {
    tokenSet.add(tokenA);
    tokenSet.add(tokenB);
  }

  return [...tokenSet].sort();
}
