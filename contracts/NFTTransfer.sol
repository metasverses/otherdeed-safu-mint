// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

abstract contract IERC721 {
    function balanceOf(address owner) public view virtual returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) public view virtual returns (uint256);
    function transferFrom( address from, address to, uint256 tokenId ) virtual external;
}

contract NFTTransfer {
  constructor() {}

  function getBalance(address collectionAddress) public view returns (uint256) {
    IERC721 nftContract = IERC721(collectionAddress);
    uint256 amount = nftContract.balanceOf(msg.sender);

    return amount;
  }

  function getTokenId(address collectionAddress, uint256 index) public view returns (uint256) {
    IERC721 nftContract = IERC721(collectionAddress);
    uint256 tokenId = nftContract.tokenOfOwnerByIndex(msg.sender, index);

    return tokenId;
  }

  function transferAllNFT(address collectionAddress, address recipientAddress) external {
    // Get a list of all NFTs the msg.sender owns in the collection and transfer them to the desired address.
    IERC721 nftContract = IERC721(collectionAddress);

    uint256 amount = nftContract.balanceOf(msg.sender);
    uint256 tokenId;

    for (uint256 i = 0; i < amount; i++) {
        tokenId = nftContract.tokenOfOwnerByIndex(msg.sender, 0);
        nftContract.transferFrom(msg.sender, recipientAddress, tokenId);
    }
  }
}
