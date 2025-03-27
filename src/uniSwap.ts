import { FordefiWeb3Provider, EvmChainId, FordefiProviderConfig } from '@fordefi/web3-provider';
import { computePoolAddress, Pool } from '@uniswap/v3-sdk' 
import { ChainId, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core'
import { CurrentConfig } from './config'
import { Contract, ethers } from 'ethers';
import { fromReadableAmount } from './helper'
import { ERC20_ABI, V3_SWAP_ROUTER_ADDRESS } from './constants';
import { AlphaRouter, SwapOptionsSwapRouter02, SwapType } from '@uniswap/smart-order-router'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json'
import dotenv from 'dotenv';
import JSBI from 'jsbi';
import fs from 'fs';

dotenv.config();

// Configure the Fordefi provider
const config: FordefiProviderConfig = {
  chainId: EvmChainId.NUMBER_1, // Mainnet
  address: '0x8BFCF9e2764BC84DE4BBd0a0f5AAF19F47027A73', // The Fordefi EVM Vault that will sign the message
  apiUserToken: process.env.FORDEFI_API_USER_TOKEN ?? (() => { throw new Error('FORDEFI_API_USER_TOKEN is not set'); })(), 
  apiPayloadSignKey: fs.readFileSync('./fordefi_secret/private.pem', 'utf8') ?? (() => { throw new Error('PEM_PRIVATE_KEY is not set'); })(),
  rpcUrl: 'https://ethereum-rpc.publicnode.com',
  skipPrediction: false 
};
const fordefiProvider = new FordefiWeb3Provider(config);
const provider = new ethers.providers.Web3Provider(fordefiProvider)

// Computing the Pool's deployement address
const currentPoolAddress = computePoolAddress({
  factoryAddress: "0x1f98431c8ad98523631ae4a59f267346ea31f984",
  tokenA: CurrentConfig.tokens.in,
  tokenB: CurrentConfig.tokens.out,
  fee: CurrentConfig.tokens.poolFee,
})
console.log("Pool deployment address -> ", currentPoolAddress)

async function getPoolData(poolContract: Contract) {
  const [token0, token1, fee, liquidity, slot0] = await Promise.all([
    poolContract.token0(),
    poolContract.token1(),
    poolContract.fee(),
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  console.log("Token 0 -> ", token0) // WETH
  console.log("Token 1 -> ", token1) // USDC

  return { 
    token0, 
    token1, 
    fee, 
    liquidity, 
    sqrtPriceX96: slot0[0], 
    tick: slot0[1],
  };
}

async function main() {

    // Construct reference to Pool contract
    const poolContract = new ethers.Contract(
      currentPoolAddress,
      IUniswapV3PoolABI.abi,
      provider
    )
    const poolData = await getPoolData(poolContract);
    console.log("Pool data -> ", poolData)

    // Reconstruct pool
    const pool = new Pool(
      CurrentConfig.tokens.in,
      CurrentConfig.tokens.out,
      CurrentConfig.tokens.poolFee,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick
    )
    console.log("Pool -> ", pool)

    const router = new AlphaRouter({
      chainId: ChainId.MAINNET,
      provider,
    })

    const options: SwapOptionsSwapRouter02 = {
      recipient: CurrentConfig.wallet?.address || "0x8BFCF9e2764BC84DE4BBd0a0f5AAF19F47027A73",
      slippageTolerance: new Percent(100, 10_000), // 1%
      deadline: Math.floor(Date.now() / 1000 + 1800),
      type: SwapType.SWAP_ROUTER_02,
    }

    const rawTokenAmountIn: JSBI = fromReadableAmount(
      CurrentConfig.tokens.amountIn,
      CurrentConfig.tokens.in.decimals
    )

    console.log("Token in -> ", CurrentConfig.tokens.in.address)
    console.log("Token out -> ", CurrentConfig.tokens.out.address)

    const route = await router.route(
      CurrencyAmount.fromRawAmount(
        CurrentConfig.tokens.in,
        rawTokenAmountIn
      ),
      CurrentConfig.tokens.out,
      TradeType.EXACT_INPUT,
      options
    )
    if (!route) {
      throw new Error('No route found by the AlphaRouter');
    }

    console.log("Route -> ", route)

    // Sign quote with Fordefi
    const signer = provider.getSigner();
    const tokenContract = new ethers.Contract(
      CurrentConfig.tokens.in.address, 
      ERC20_ABI, 
      signer
    )
    const tokenApproval = await tokenContract.approve(
      V3_SWAP_ROUTER_ADDRESS, 
      ethers.BigNumber.from(rawTokenAmountIn.toString())
    )
    console.log("Token approval -> ", tokenApproval)

    // DEBUG LOGS
    console.log("=== TRANSACTION DETAILS ===");
    console.log("Transaction to:", V3_SWAP_ROUTER_ADDRESS);
    console.log("Transaction data:", route?.methodParameters?.calldata);
    console.log("Transaction value:", route?.methodParameters?.value);
    console.log("Sender address:", config.address);
    
    // DEBUG LOGS
    console.log("=== CURRENT NETWORK GAS ===");
    const feeData = await provider.getFeeData();
    console.log ("Fee Data -> ", feeData)
    console.log("Current baseFeePerGas:", feeData.lastBaseFeePerGas?.toString(), "wei =", 
    ethers.utils.formatUnits(feeData.lastBaseFeePerGas || 0, 9), "Gwei");
    console.log("Suggested gasPrice:", feeData.gasPrice?.toString(), "wei =", 
    ethers.utils.formatUnits(feeData.gasPrice || 0, 9), "Gwei");

    const providedBaseFeePerGas = await feeData.lastBaseFeePerGas
    const value = route?.methodParameters?.value
    console.log("Value", value)

    // Sending transaction for signing
    const txRes = await signer.sendTransaction({
      data: route?.methodParameters?.calldata,
      to: V3_SWAP_ROUTER_ADDRESS,
      value: value,
      from: config.address,
      maxFeePerGas: providedBaseFeePerGas?.mul(2) || ethers.utils.parseUnits("1", "gwei"), 
      maxPriorityFeePerGas: ethers.utils.parseUnits("0.1", "gwei"),
      gasLimit: 400_000,
    })
    console.log("Tx response -> ", txRes)

}


main().catch(console.error);
