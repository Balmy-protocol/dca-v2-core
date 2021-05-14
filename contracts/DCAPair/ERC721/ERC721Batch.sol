// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;

import '../../interfaces/ERC721/IERC721Batch.sol';
import './ERC721.sol';

abstract contract ERC721Batch is ERC721, IERC721Batch {
  function safeBatchTransferFrom(
    address _from,
    address _to,
    uint256[] calldata _ids
  ) public virtual override {
    safeBatchTransferFrom(_from, _to, _ids, '');
  }

  function safeBatchTransferFrom(
    address _from,
    address _to,
    uint256[] calldata _ids,
    bytes memory _data
  ) public virtual override {
    require(_to != address(0), 'ERC721Batch: transfer to the zero address');
    require(_ids.length > 0, 'ERC721Batch: you need to transfer at least one token');

    for (uint256 i = 0; i < _ids.length; i++) {
      uint256 _tokenId = _ids[i];
      require(_isApprovedOrOwner(_msgSender(), _tokenId), 'ERC721Batch: transfer caller is not owner nor approved');
      _internalTransfer(_from, _to, _tokenId);
    }

    require(_checkOnERC721Received(_from, _to, _ids[0], _data), 'ERC721: transfer to non ERC721Receiver implementer');

    emit TransferBatch(_from, _to, _ids);
  }
}
