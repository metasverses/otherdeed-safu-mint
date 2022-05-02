import {
  FlashbotsBundleProvider, FlashbotsBundleRawTransaction,
  FlashbotsBundleResolution,
  FlashbotsBundleTransaction
} from "@flashbots/ethers-provider-bundle";
import { BigNumber, providers, Wallet, Contract } from "ethers";
import { Base } from "./engine/Base";
import { checkSimulation, gasPriceToGwei, printTransactions } from "./utils";
import { Approval721 } from "./engine/Approval721";
import { ERC20_ABI } from "./engine/TransferERC20"
import { ApproveERC20 } from "./engine/ApproveERC20"
import { MintNFT } from "./engine/MintNFT"
import { TransferAllNFT } from "./engine/TransferNFT"

const merkleProofs = require('./merkleProofs.json')

require('log-timestamp');

const BLOCKS_IN_FUTURE = 1;
const NFTS_TO_MINT = 1;
const tokensPerNFT = BigNumber.from('305000000000000000000'); // 18 decimals

const GWEI = BigNumber.from(10).pow(9);
const PRIORITY_GAS_PRICE = GWEI.mul(4000)

const PRIVATE_KEY_EXECUTOR = process.env.PRIVATE_KEY_EXECUTOR || ""
const PRIVATE_KEY_SPONSOR = process.env.PRIVATE_KEY_SPONSOR || ""
const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY || ""
const RECIPIENT = process.env.RECIPIENT || ""

if (PRIVATE_KEY_EXECUTOR === "") {
  console.warn("Must provide PRIVATE_KEY_EXECUTOR environment variable, corresponding to Ethereum EOA with assets to be transferred")
  process.exit(1)
}
if (PRIVATE_KEY_SPONSOR === "") {
  console.warn("Must provide PRIVATE_KEY_SPONSOR environment variable, corresponding to an Ethereum EOA with ETH to pay miner")
  process.exit(1)
}
if (FLASHBOTS_RELAY_SIGNING_KEY === "") {
  console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY environment variable. Please see https://github.com/flashbots/pm/blob/main/guides/flashbots-alpha.md")
  process.exit(1)
}
if (RECIPIENT === "") {
  console.warn("Must provide RECIPIENT environment variable, an address which will receive assets")
  process.exit(1)
}

async function main() {
  const walletRelay = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY)

  // ======= UNCOMMENT FOR GOERLI ==========
  // const provider = new providers.InfuraProvider(5)
  // const flashbotsProvider = await FlashbotsBundleProvider.create(provider, walletRelay, 'https://relay-goerli.epheph.com/');
  // ======= UNCOMMENT FOR GOERLI ==========

  // ======= UNCOMMENT FOR MAINNET ==========
  const provider = new providers.StaticJsonRpcProvider('https://api.edennetwork.io/v1/beta');
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, walletRelay);
  // ======= UNCOMMENT FOR MAINNET ==========

  const walletExecutor = new Wallet(PRIVATE_KEY_EXECUTOR);
  const walletSponsor = new Wallet(PRIVATE_KEY_SPONSOR);

  const nftAddress = '0x34d85c9CDeB23FA97cb08333b511ac86E1C4E258';
  const nftTransferAddress = 'ADDRESS OF DEPLOYED NFT TRANSFER CONTRACT';

  const tokenAddress = "0x4d224452801ACEd8B2F0aebE155379bb5D594381";
  const tokenContract =  new Contract(tokenAddress, ERC20_ABI, provider);

  const block = await provider.getBlock("latest")

  // STEP 3 - kyc wallet approves APE to be spent by NFT contract.
  // const approveEngine: Base = new ApproveERC20(provider, walletExecutor.address, nftAddress, tokenAddress);
  // const approveSponsoredTransactions = await approveEngine.getSponsoredTransactions();

  // STEP 4 - kyc wallet mints
  const merkleProof = merkleProofs[walletExecutor.address];
  const mintEngine: Base = new MintNFT(provider, walletExecutor.address, nftAddress, NFTS_TO_MINT, merkleProof)
  const mintSponsoredTransactions = await mintEngine.getSponsoredTransactions();

  // STEP 5 - kyc wallet approves transfer of all nfts.
  // const approveNFTEngine: Base = new Approval721(nftTransferAddress, nftAddress);
  // const approveNFTSponsoredTransactions = await approveNFTEngine.getSponsoredTransactions();

  // STEP 6 - kyc wallet sends back nfts to safu wallet
  const transferNFTEngine: Base = new TransferAllNFT(provider, walletExecutor.address, walletSponsor.address, nftTransferAddress, nftAddress);
  const transferNFTSponsoredTransactions = await transferNFTEngine.getSponsoredTransactions();

  // Concat all sponsored txs.
  const sponsoredTransactions = [
    // ...approveSponsoredTransactions,
    ...mintSponsoredTransactions,
    // ...approveNFTSponsoredTransactions,
    ...transferNFTSponsoredTransactions
  ];

  // We pre-calculated gas estimates so let's use those.
  const gasEstimates: BigNumber[] = [];
  gasEstimates[0] = BigNumber.from(252149);
  gasEstimates[1] = BigNumber.from(136423);

  // If we didn't know gas estimates before hand we would use the following to calculate them.
  // const gasEstimates = await Promise.all(sponsoredTransactions.map(tx => {
  //   return provider.estimateGas({
  //     ...tx,
  //     from: tx.from === undefined ? walletExecutor.address : tx.from
  //   });
  // }));

  const gasEstimateTotal = gasEstimates.reduce((acc, cur) => acc.add(cur), BigNumber.from(0))

  const gasPrice = PRIORITY_GAS_PRICE.add(block.baseFeePerGas || 0);

  console.log('Base gas price: ', block.baseFeePerGas?.toString())
  console.log('Gas price: ', gasPrice.toString());
  console.log('Gas estimate total: ', gasEstimateTotal.toString());

  // console.log(await tokenContract.populateTransaction.transfer(walletExecutor.address, tokensPerNFT.mul(NFTS_TO_MINT)));

  const bundleTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction> = [
    // STEP 1- Transfer ETH from safu wallet to KYC wallet.
    {
      transaction: {
        to: walletExecutor.address,
        gasPrice: gasPrice,
        value: gasEstimateTotal.mul(gasPrice),
        gasLimit: 25000,
      },
      signer: walletSponsor
    },
    // STEP 2- transfer APE from safu wallet to kyc wallet
    {
      transaction: {
        ...await tokenContract.populateTransaction.transfer(walletExecutor.address, tokensPerNFT.mul(NFTS_TO_MINT)),
        gasPrice: gasPrice,
        gasLimit: 60000,
        value: 0,
      },
      signer: walletSponsor
    },
    ...sponsoredTransactions.map((transaction, txNumber) => {
      return {
        transaction: {
          ...transaction,
          gasPrice: gasPrice,
          gasLimit: gasEstimates[txNumber],
        },
        signer: walletExecutor,
      }
    })
  ]
  const signedBundle = await flashbotsProvider.signBundle(bundleTransactions)
  await printTransactions(bundleTransactions, signedBundle);
  const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);

  // console.log(await engine.description())

  console.log(`Executor Account: ${walletExecutor.address}`)
  console.log(`Sponsor Account: ${walletSponsor.address}`)
  console.log(`Simulated Gas Price: ${gasPriceToGwei(simulatedGasPrice)} gwei`)
  console.log(`Gas Price: ${gasPriceToGwei(gasPrice)} gwei`)
  console.log(`Gas Used: ${gasEstimateTotal.toString()}`)

  provider.on('block', async (blockNumber) => {
    const simulatedGasPrice = await checkSimulation(flashbotsProvider, signedBundle);
    const targetBlockNumber = blockNumber + BLOCKS_IN_FUTURE;
    console.log(`Current Block Number: ${blockNumber},   Target Block Number:${targetBlockNumber},   gasPrice: ${gasPriceToGwei(simulatedGasPrice)} gwei`)
    const bundleResponse = await flashbotsProvider.sendBundle(bundleTransactions, targetBlockNumber);
    if ('error' in bundleResponse) {
      throw new Error(bundleResponse.error.message)
    }
    const bundleResolution = await bundleResponse.wait()
    if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
      console.log(`Congrats, included in ${targetBlockNumber}`)
      process.exit(0)
    } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
      console.log(`Not included in ${targetBlockNumber}`)
    } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
      console.log("Nonce too high, bailing")
      process.exit(1)
    }
  })
}

main()
