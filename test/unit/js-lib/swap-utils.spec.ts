import { expect } from 'chai';
import { buildSwapInput } from '../../../js-lib/swap-utils';
import { when, then } from '../../utils/bdd';

describe('Swap Utils', () => {
  describe('buildSwapInput', () => {
    const TOKEN_A = 'tokenA';
    const TOKEN_B = 'tokenB';
    when('no pairs are given', () => {
      then('the result is empty', () => {
        const { tokens, indexes } = buildSwapInput([]);
        expect(tokens).to.be.empty;
        expect(indexes).to.be.empty;
      });
    });

    when('one pair has the same token', () => {
      then('an error is thrown', () => {
        const pair = { tokenA: 'token', tokenB: 'token' };
        expect(() => buildSwapInput([pair])).to.throw('Found duplicates in same pair');
      });
    });

    when('there are duplicated pairs', () => {
      then('an error is thrown', () => {
        const pair = { tokenA: TOKEN_A, tokenB: TOKEN_B };
        expect(() => buildSwapInput([pair, pair])).to.throw('Found duplicates');
      });
    });

    when('there are duplicated pairs', () => {
      then('an error is thrown', () => {
        const pair1 = { tokenA: TOKEN_A, tokenB: TOKEN_B };
        const pair2 = { tokenA: TOKEN_B, tokenB: TOKEN_A };
        expect(() => buildSwapInput([pair1, pair2])).to.throw('Found duplicates');
      });
    });

    when('one pair is provided', () => {
      then('the result is returned correctly', () => {
        const pair = { tokenA: TOKEN_B, tokenB: TOKEN_A };
        const { tokens, indexes } = buildSwapInput([pair]);
        expect(tokens).to.eql([TOKEN_A, TOKEN_B]);
        expect(indexes).to.eql([{ indexTokenA: 0, indexTokenB: 1 }]);
      });
    });

    when('multiple pairs are provided', () => {
      const TOKEN_C = 'tokenC';
      const TOKEN_D = 'tokenD';

      then('the result is returned correctly', () => {
        const { tokens, indexes } = buildSwapInput([
          { tokenA: TOKEN_C, tokenB: TOKEN_A },
          { tokenA: TOKEN_B, tokenB: TOKEN_A },
          { tokenA: TOKEN_D, tokenB: TOKEN_B },
          { tokenA: TOKEN_D, tokenB: TOKEN_C },
          { tokenA: TOKEN_B, tokenB: TOKEN_C },
        ]);
        expect(tokens).to.eql([TOKEN_A, TOKEN_B, TOKEN_C, TOKEN_D]);
        expect(indexes).to.eql([
          { indexTokenA: 0, indexTokenB: 1 },
          { indexTokenA: 0, indexTokenB: 2 },
          { indexTokenA: 1, indexTokenB: 2 },
          { indexTokenA: 1, indexTokenB: 3 },
          { indexTokenA: 2, indexTokenB: 3 },
        ]);
      });
    });
  });
});
