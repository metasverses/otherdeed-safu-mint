import { BigNumber, Contract, providers } from "ethers";
import { isAddress } from "ethers/lib/utils";
import { TransactionRequest } from "@ethersproject/abstract-provider";
import { Base } from "./Base";

export const ABI = [
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "collectionAddress",
                "type": "address"
            },
            {
                "internalType": "address",
                "name": "recipientAddress",
                "type": "address"
            }
        ],
        "name": "transferAllNFT",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

export class TransferAllNFT extends Base {
  private _sender: string;
  private _recipient: string;
  private _nftAddress: string;
  private _transferContract: Contract;

  constructor(provider: providers.JsonRpcProvider, sender: string, recipient: string, transferContractAddress: string, nftAddress: string) {
    super()
    if (!isAddress(sender)) throw new Error("Bad Address")
    if (!isAddress(recipient)) throw new Error("Bad Address")
    this._sender = sender;
    this._recipient = recipient;
    this._nftAddress = nftAddress;
    this._transferContract = new Contract(transferContractAddress, ABI, provider);
  }

  async description(): Promise<string> {
    return "Transfer all NFTs in the collection to recipient."
  }

  async getSponsoredTransactions(): Promise<Array<TransactionRequest>> {
    return [{
      ...(await this._transferContract.populateTransaction.transferAllNFT(this._nftAddress, this._recipient)),
      gasLimit: 200000
    }]
  }
}