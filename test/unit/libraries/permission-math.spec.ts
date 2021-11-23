import { PermissionMathMock, PermissionMathMock__factory } from '@typechained';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { when, then } from '@test-utils/bdd';
import { Permission } from 'js-lib/types';

describe('Permission Math', () => {
  let permissionMath: PermissionMathMock;

  before('Setup accounts and contracts', async () => {
    const permissionMathFactory: PermissionMathMock__factory = await ethers.getContractFactory(
      'contracts/mocks/libraries/PermissionMath.sol:PermissionMathMock'
    );
    permissionMath = await permissionMathFactory.deploy();
  });

  describe('toUInt8', () => {
    toUInt8Test({
      when: 'permission array is empty',
      permissions: [],
      expectedNibble: '0000',
    });
    toUInt8Test({
      when: 'all permissions are passed',
      permissions: [Permission.INCREASE, Permission.REDUCE, Permission.WITHDRAW, Permission.TERMINATE],
      expectedNibble: '1111',
    });
    toUInt8Test({
      when: 'some permissions are passed',
      permissions: [Permission.INCREASE, Permission.WITHDRAW],
      expectedNibble: '0101',
    });
    toUInt8Test({
      when: 'repeated permissions are passed',
      permissions: [Permission.INCREASE, Permission.INCREASE, Permission.INCREASE],
      expectedNibble: '0001',
    });
    function toUInt8Test({ when: title, permissions, expectedNibble }: { when: string; permissions: Permission[]; expectedNibble: string }) {
      when(title, () => {
        then('uint8 representation is calculated correctly', async () => {
          const uint8Representation = await permissionMath.toUInt8(permissions);
          expect(uint8Representation).to.equal(parseInt('0000' + expectedNibble, 2));
        });
      });
    }
  });

  describe('hasPermission', () => {
    hasPermissionTest({
      when: 'nibble has no permissions',
      nibble: '0000',
      result: [
        { permission: Permission.INCREASE, expected: false },
        { permission: Permission.REDUCE, expected: false },
        { permission: Permission.WITHDRAW, expected: false },
        { permission: Permission.TERMINATE, expected: false },
      ],
    });
    hasPermissionTest({
      when: 'nibble has all permissions',
      nibble: '1111',
      result: [
        { permission: Permission.INCREASE, expected: true },
        { permission: Permission.REDUCE, expected: true },
        { permission: Permission.WITHDRAW, expected: true },
        { permission: Permission.TERMINATE, expected: true },
      ],
    });
    hasPermissionTest({
      when: 'nibble has some permissions',
      nibble: '1001',
      result: [
        { permission: Permission.INCREASE, expected: true },
        { permission: Permission.REDUCE, expected: false },
        { permission: Permission.WITHDRAW, expected: false },
        { permission: Permission.TERMINATE, expected: true },
      ],
    });
    function hasPermissionTest({
      when: title,
      nibble,
      result,
    }: {
      when: string;
      nibble: string;
      result: { permission: Permission; expected: boolean }[];
    }) {
      when(title, () => {
        then('hasPermission returns the correct value', async () => {
          for (const { permission, expected } of result) {
            const hasPermission = await permissionMath.hasPermission(parseInt('0000' + nibble, 2), permission);
            expect(hasPermission).to.equal(expected);
          }
        });
      });
    }
  });
});
