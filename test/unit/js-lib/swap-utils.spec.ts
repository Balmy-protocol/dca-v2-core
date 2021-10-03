import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { buildGetNextSwapInfoInput, buildSwapInput } from '../../../js-lib/swap-utils';
import { when, then } from '@test-utils/bdd';

describe('Swap Utils', () => {
  describe('buildGetNextSwapInfoInput', () => {
    const TOKEN_A = 'tokenA';
    const TOKEN_B = 'tokenB';
    when('no pairs are given', () => {
      then('the result is empty', () => {
        const { tokens, pairIndexes } = buildGetNextSwapInfoInput([], []);
        expect(tokens).to.be.empty;
        expect(pairIndexes).to.be.empty;
      });
    });

    when('one pair has the same token', () => {
      then('an error is thrown', () => {
        const pair = { tokenA: 'token', tokenB: 'token' };
        expect(() => buildGetNextSwapInfoInput([pair], [])).to.throw('Found duplicates in same pair');
      });
    });

    when('there are duplicated pairs', () => {
      then('an error is thrown', () => {
        const pair = { tokenA: TOKEN_A, tokenB: TOKEN_B };
        expect(() => buildGetNextSwapInfoInput([pair, pair], [])).to.throw('Found duplicates');
      });
    });

    when('there are duplicated pairs', () => {
      then('an error is thrown', () => {
        const pair1 = { tokenA: TOKEN_A, tokenB: TOKEN_B };
        const pair2 = { tokenA: TOKEN_B, tokenB: TOKEN_A };
        expect(() => buildGetNextSwapInfoInput([pair1, pair2], [])).to.throw('Found duplicates');
      });
    });

    when('one pair is provided', () => {
      then('the result is returned correctly', () => {
        const pair = { tokenA: TOKEN_B, tokenB: TOKEN_A };
        const { tokens, pairIndexes } = buildGetNextSwapInfoInput([pair], []);
        expect(tokens).to.eql([TOKEN_A, TOKEN_B]);
        expect(pairIndexes).to.eql([{ indexTokenA: 0, indexTokenB: 1 }]);
      });
    });

    when('multiple pairs are provided', () => {
      const TOKEN_C = 'tokenC';
      const TOKEN_D = 'tokenD';

      then('the result is returned correctly', () => {
        const { tokens, pairIndexes } = buildGetNextSwapInfoInput(
          [
            { tokenA: TOKEN_C, tokenB: TOKEN_A },
            { tokenA: TOKEN_B, tokenB: TOKEN_A },
            { tokenA: TOKEN_D, tokenB: TOKEN_B },
            { tokenA: TOKEN_D, tokenB: TOKEN_C },
            { tokenA: TOKEN_B, tokenB: TOKEN_C },
          ],
          []
        );
        expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_D]);
        expect(pairIndexes).to.eql([
          { indexTokenA: 0, indexTokenB: 1 },
          { indexTokenA: 0, indexTokenB: 2 },
          { indexTokenA: 1, indexTokenB: 2 },
          { indexTokenA: 1, indexTokenB: 3 },
          { indexTokenA: 2, indexTokenB: 3 },
        ]);
      });
    });

    when('extra tokens are passed to check how much is available to borrow', () => {
      const TOKEN_C = 'tokenC';
      const TOKEN_D = 'tokenD';

      then('the result is returned correctly', () => {
        const { tokens, pairIndexes } = buildGetNextSwapInfoInput(
          [
            { tokenA: TOKEN_C, tokenB: TOKEN_A },
            { tokenA: TOKEN_B, tokenB: TOKEN_A },
          ],
          [TOKEN_C, TOKEN_D]
        );
        expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_D]);
        expect(pairIndexes).to.eql([
          { indexTokenA: 0, indexTokenB: 1 },
          { indexTokenA: 0, indexTokenB: 2 },
        ]);
      });
    });
  });

  describe('buildSwapInput', () => {
    const TOKEN_A = 'tokenA';
    const TOKEN_B = 'tokenB';
    const TOKEN_C = 'tokenC';
    const ZERO = BigNumber.from(0);
    when('borrowing tokens that are also being swapped', () => {
      const BORROW_TOKEN_A = BigNumber.from(30);
      const BORROW_TOKEN_B = BigNumber.from(40);
      then('the result is returned correctly', () => {
        const { tokens, pairIndexes, borrow } = buildSwapInput(
          [
            { tokenA: TOKEN_C, tokenB: TOKEN_A },
            { tokenA: TOKEN_B, tokenB: TOKEN_A },
          ],
          [
            { token: TOKEN_A, amount: BORROW_TOKEN_A },
            { token: TOKEN_B, amount: BORROW_TOKEN_B },
          ]
        );
        expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C]);
        expect(pairIndexes).to.eql([
          { indexTokenA: 0, indexTokenB: 1 },
          { indexTokenA: 0, indexTokenB: 2 },
        ]);
        expect(borrow).to.eql([BORROW_TOKEN_A, BORROW_TOKEN_B, ZERO]);
      });
    });

    when('borrowing tokens that are not being swapped', () => {
      const TOKEN_D = 'tokenD';
      const BORROW_TOKEN_D = BigNumber.from(40);
      then('the result is returned correctly', () => {
        const { tokens, pairIndexes, borrow } = buildSwapInput(
          [
            { tokenA: TOKEN_C, tokenB: TOKEN_A },
            { tokenA: TOKEN_B, tokenB: TOKEN_A },
          ],
          [{ token: TOKEN_D, amount: BORROW_TOKEN_D }]
        );
        expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_D]);
        expect(pairIndexes).to.eql([
          { indexTokenA: 0, indexTokenB: 1 },
          { indexTokenA: 0, indexTokenB: 2 },
        ]);
        expect(borrow).to.eql([ZERO, ZERO, ZERO, BORROW_TOKEN_D]);
      });
    });
  });
});
