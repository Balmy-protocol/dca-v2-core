// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.4;

interface IMAPPositionHandler {
  event Deposited(address indexed _user, address _pair, uint256 _amountTokenA, uint256 _amountTokenB);
  event Withdrew(
    address indexed _user,
    address _pair,
    uint256 _withdrewTokenA,
    uint256 _withdrewTokenB,
    uint256 _leftTokenA,
    uint256 _leftTokenB
  );

  function deposit(
    address _pair,
    uint256 _amountTokenA,
    uint256 _amountTokenB
  ) external;

  // TODO: Implement
  // function withdraw(
  //   address _pair,
  //   uint256 _amountTokenA,
  //   uint256 _amountTokenB
  // ) external;

  function calculateOwned(address _pair, address _user) external view returns (uint256 _ownedTokenA, uint256 _ownedTokenB);
}

interface IMAParameters {
  struct PairLiquidity {
    address pair;
    uint256 amountTokenA;
    uint256 amountTokenB;
  }

  /** Returns a list of all pairs that have liquidity on the pool */
  function activePairs() external view returns (PairLiquidity[] memory _activePairs);

  function liquidity(address _pair) external view returns (uint256 _amountTokenA, uint256 _amountTokenB);
}
