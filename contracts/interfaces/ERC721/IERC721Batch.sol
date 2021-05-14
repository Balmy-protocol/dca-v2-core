// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

interface IERC721Batch {
  event TransferBatch(address indexed _from, address indexed _to, uint256[] _ids);

  function safeBatchTransferFrom(
    address _from,
    address _to,
    uint256[] calldata _ids
  ) external;

  function safeBatchTransferFrom(
    address _from,
    address _to,
    uint256[] calldata _ids,
    bytes memory _data
  ) external;
}
