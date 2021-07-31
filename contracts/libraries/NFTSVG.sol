// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.6;

import '@openzeppelin/contracts/utils/Strings.sol';

/// @title NFTSVG
/// @notice Provides a function for generating an SVG associated with a DCA NFT. Based on Uniswap's NFTDescriptor. Background by bgjar.com
library NFTSVG {
  using Strings for uint256;
  using Strings for uint32;

  struct SVGParams {
    string tokenA;
    string tokenB;
    string tokenASymbol;
    string tokenBSymbol;
    string interval;
    uint32 swapsExecuted;
    uint32 swapsLeft;
    uint256 tokenId;
    string swapped;
    string averagePrice;
    string remaining;
    string rate;
  }

  function generateSVG(SVGParams memory params) internal pure returns (string memory svg) {
    return
      string(
        abi.encodePacked(
          _generateSVGDefs(),
          _generateSVGBorderText(params.tokenA, params.tokenB, params.tokenASymbol, params.tokenBSymbol),
          _generateSVGCardMantle(params.tokenASymbol, params.tokenBSymbol, params.interval),
          _generageSVGProgressArea(params.swapsExecuted, params.swapsLeft),
          _generateSVGPositionData(params.tokenId, params.swapped, params.averagePrice, params.remaining, params.rate),
          '</svg>'
        )
      );
  }

  function _generateSVGDefs() private pure returns (string memory svg) {
    svg = string(
      abi.encodePacked(
        '<svg width="290" height="560" viewBox="0 0 290 560" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">',
        '<defs><linearGradient x1="118.1%" y1="10.5%" x2="-18.1%" y2="89.5%" gradientUnits="userSpaceOnUse" id="LinearGradient"><stop stop-color="rgba(13, 5, 20, 1)" offset="0"></stop><stop stop-color="rgba(47, 19, 66, 1)" offset="0.7"></stop><stop stop-color="rgba(35, 17, 51, 1)" offset="1"></stop></linearGradient><clipPath id="corners"><rect width="290" height="560" rx="40" ry="40" /></clipPath><path id="text-path-a" d="M40 12 H250 A28 28 0 0 1 278 40 V520 A28 28 0 0 1 250 548 H40 A28 28 0 0 1 12 520 V40 A28 28 0 0 1 40 12 z" /><mask id="none" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="white" /></mask><linearGradient id="grad-symbol"><stop offset="0.8" stop-color="white" stop-opacity="1" /><stop offset=".95" stop-color="white" stop-opacity="0" /></linearGradient><mask id="fade-symbol" maskContentUnits="userSpaceOnUse"><rect width="290px" height="200px" fill="url(#grad-symbol)" /></mask></defs>',
        '<g clip-path="url(#corners)">',
        '<rect width="290" height="560" x="0" y="0" fill="url(#LinearGradient)"></rect>',
        '<path d="M290 0L248.61 0L290 61.48z" fill="rgba(255, 255, 255, .1)"></path>',
        '<path d="M248.61 0L290 61.48L290 189.35999999999999L200.75 0z" fill="rgba(255, 255, 255, .075)"></path>',
        '<path d="M200.75 0L290 189.35999999999999L290 294.91999999999996L112.52 0z" fill="rgba(255, 255, 255, .05)"></path>',
        '<path d="M112.51999999999998 0L290 294.91999999999996L290 357.79999999999995L32.78999999999998 0z" fill="rgba(255, 255, 255, .025)"></path>',
        '<path d="M0 560L40.27 560L0 402.35z" fill="rgba(0, 0, 0, .1)"></path>',
        '<path d="M0 402.35L40.27 560L137.96 560L0 221.89000000000001z" fill="rgba(0, 0, 0, .075)"></path>',
        '<path d="M0 221.89L137.96 560L153.85600000000002 560L0 183.92z" fill="rgba(0, 0, 0, .05)"></path>',
        '<path d="M0 183.91999999999996L153.85000000000002 560L156.66000000000003 560L0 151.61999999999995z" fill="rgba(0, 0, 0, .025)"></path>',
        '</g>'
      )
    );
  }

  function _generateSVGBorderText(
    string memory _tokenA,
    string memory _tokenB,
    string memory _tokenASymbol,
    string memory _tokenBSymbol
  ) private pure returns (string memory svg) {
    string memory _tokenAText = string(abi.encodePacked(_tokenA, unicode' • ', _tokenASymbol));
    string memory _tokenBText = string(abi.encodePacked(_tokenB, unicode' • ', _tokenBSymbol));
    svg = string(
      abi.encodePacked(
        '<text text-rendering="optimizeSpeed"><textPath startOffset="-100%" fill="white" font-family="\'Courier New\', monospace" font-size="10px" xlink:href="#text-path-a">',
        _tokenAText,
        '<animate additive="sum" attributeName="startOffset" from="0%" to="100%" begin="0s" dur="30s" repeatCount="indefinite" /></textPath><textPath startOffset="0%" fill="white" font-family="\'Courier New\', monospace" font-size="10px" xlink:href="#text-path-a">',
        _tokenAText,
        '<animate additive="sum" attributeName="startOffset" from="0%" to="100%" begin="0s" dur="30s" repeatCount="indefinite" /></textPath><textPath startOffset="50%" fill="white" font-family="\'Courier New\', monospace" font-size="10px" xlink:href="#text-path-a">',
        _tokenBText,
        '<animate additive="sum" attributeName="startOffset" from="0%" to="100%" begin="0s" dur="30s" repeatCount="indefinite" /></textPath><textPath startOffset="-50%" fill="white" font-family="\'Courier New\', monospace" font-size="10px" xlink:href="#text-path-a">',
        _tokenBText,
        '<animate additive="sum" attributeName="startOffset" from="0%" to="100%" begin="0s" dur="30s" repeatCount="indefinite" /></textPath></text>'
      )
    );
  }

  function _generateSVGCardMantle(
    string memory _tokenASymbol,
    string memory _tokenBSymbol,
    string memory _interval
  ) private pure returns (string memory svg) {
    svg = string(
      abi.encodePacked(
        '<g mask="url(#fade-symbol)">'
        '<rect fill="none" x="0px" y="0px" width="290px" height="200px" />'
        '<text y="70px" x="32px" fill="white" font-family="\'Courier New\', monospace" font-weight="200" font-size="35px">',
        _tokenASymbol,
        '/',
        _tokenBSymbol,
        '</text>',
        '<text y="115px" x="32px" fill="white" font-family="\'Courier New\', monospace" font-weight="200" font-size="28px">',
        _interval,
        '</text>'
        '</g>'
      )
    );
  }

  function _generageSVGProgressArea(uint32 _swapsExecuted, uint32 _swapsLeft) private pure returns (string memory svg) {
    uint256 _positionNow = 170 + ((314 - 170) / (_swapsExecuted + _swapsLeft)) * _swapsExecuted;
    svg = string(
      abi.encodePacked(
        '<rect x="16" y="16" width="258" height="528" rx="26" ry="26" fill="rgba(0,0,0,0)" stroke="rgba(255,255,255,0.2)" />',
        '<g mask="url(#none)" style="transform:translate(80px,169px)"><rect x="-16px" y="-16px" width="180px" height="180px" fill="none" /><path d="M1 1 L1 145" stroke="rgba(0,0,0,0.3)" stroke-width="32px" fill="none" stroke-linecap="round" /></g>',
        '<g mask="url(#none)" style="transform:translate(80px,169px)"><rect x="-16px" y="-16px" width="180px" height="180px" fill="none" /><path d="M1 1 L1 145" stroke="rgba(255,255,255,1)" fill="none" stroke-linecap="round" /></g>',
        '<circle cx="81px" cy="170px" r="4px" fill="#dddddd" />',
        '<circle cx="81px" cy="',
        _positionNow.toString(),
        'px" r="5px" fill="white" />',
        '<circle cx="81px" cy="314px" r="4px" fill="#dddddd" /><text x="100px" y="174px" font-family="\'Courier New\', monospace" font-size="12px" fill="white"><tspan fill="rgba(255,255,255,0.6)">Executed*: </tspan>',
        _swapsExecuted.toString(),
        ' swaps</text><text x="40px" y="',
        (_positionNow + 4).toString(),
        'px" font-family="\'Courier New\', monospace" font-size="12px" fill="white">Now</text><text x="100px" y="318px" font-family="\'Courier New\', monospace" font-size="12px" fill="white"><tspan fill="rgba(255,255,255,0.6)">Left: </tspan>',
        _swapsLeft.toString(),
        ' swaps</text>'
      )
    );
  }

  function _generateSVGPositionData(
    uint256 _tokenId,
    string memory _swapped,
    string memory _averagePrice,
    string memory _remaining,
    string memory _rate
  ) private pure returns (string memory svg) {
    svg = string(
      abi.encodePacked(
        _generateData('Id', _tokenId.toString(), 364),
        _generateData('Swapped*', _swapped, 394),
        _generateData('Avg Price', _averagePrice, 424),
        _generateData('Remaining', _remaining, 454),
        _generateData('Rate', _rate, 484),
        '<g style="transform:translate(25px, 514px)">',
        '<text x="12px" y="17px" font-family="\'Courier New\', monospace" font-size="10px" fill="white">',
        '<tspan fill="rgba(255,255,255,0.8)">* since start or last edit/withdraw</tspan>',
        '</text>',
        '</g>'
      )
    );
  }

  function _generateData(
    string memory _title,
    string memory _data,
    uint256 _yCoord
  ) private pure returns (string memory svg) {
    uint256 _strLength = bytes(_title).length + bytes(_data).length + 2;
    svg = string(
      abi.encodePacked(
        '<g style="transform:translate(29px, ',
        _yCoord.toString(),
        'px)">',
        '<rect width="',
        uint256(7 * (_strLength + 4)).toString(),
        'px" height="26px" rx="8px" ry="8px" fill="rgba(0,0,0,0.6)" />',
        '<text x="12px" y="17px" font-family="\'Courier New\', monospace" font-size="12px" fill="white">',
        '<tspan fill="rgba(255,255,255,0.6)">',
        _title,
        ': </tspan>',
        _data,
        '</text>',
        '</g>'
      )
    );
  }
}
