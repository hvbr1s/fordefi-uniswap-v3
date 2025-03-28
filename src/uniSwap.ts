import { FordefiWeb3Provider } from '@fordefi/web3-provider';
import { ChainId, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core'
import { CurrentConfig, fordefiConfig } from './config'
import { ethers } from 'ethers';
import { fromReadableAmount } from './helper'
import { ERC20_ABI, V3_SWAP_ROUTER_ADDRESS } from './constants';
import { AlphaRouter, SwapOptionsSwapRouter02, SwapType } from '@uniswap/smart-order-router'
import JSBI from 'jsbi';

// Instanciate Fordefi provider from config
const fordefiProvider = new FordefiWeb3Provider(fordefiConfig);
const provider = new ethers.providers.Web3Provider(fordefiProvider)


async function main() {

  // Check which tokens we're swapping
  console.log("Token in -> ", CurrentConfig.tokens.in.address)
  console.log("Token out -> ", CurrentConfig.tokens.out.address)

  // Invoke Uniswap router
  const router = new AlphaRouter({
    chainId: ChainId.MAINNET,
    provider,
  })

  // Define swap and amount
  const options: SwapOptionsSwapRouter02 = {
    recipient: CurrentConfig.wallet?.address || fordefiConfig.address,
    slippageTolerance: new Percent(100, 10_000), // define slippage, 1% in this example
    deadline: Math.floor(Date.now() / 1000 + 1800),
    type: SwapType.SWAP_ROUTER_02,
  }

  const rawTokenAmountIn: JSBI = fromReadableAmount(
    CurrentConfig.tokens.amountIn,
    CurrentConfig.tokens.in.decimals
  )

  // Define swap route
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

  // Sign approval for tokens in the swap
  const signer = provider.getSigner();
  const tokenContract = new ethers.Contract(
    CurrentConfig.tokens.in.address, 
    ERC20_ABI, 
    signer
  )
  await tokenContract.approve(
    V3_SWAP_ROUTER_ADDRESS, 
    ethers.BigNumber.from(rawTokenAmountIn.toString())
  )

  // DEBUG LOGS
  console.log("=== TRANSACTION DETAILS ===");
  console.log("Transaction to:", V3_SWAP_ROUTER_ADDRESS);
  console.log("Transaction data:", route?.methodParameters?.calldata);
  console.log("Transaction value:", route?.methodParameters?.value);
  console.log("Sender address:", fordefiConfig.address);
  
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

  // Sending swap transaction to Fordefi for signing and broadcast to blockchain
  const txRes = await signer.sendTransaction({
    data: route?.methodParameters?.calldata,
    to: V3_SWAP_ROUTER_ADDRESS,
    value: value,
    from: fordefiConfig.address,
    maxFeePerGas: providedBaseFeePerGas?.mul(2) || ethers.utils.parseUnits("1", "gwei"), 
    maxPriorityFeePerGas: ethers.utils.parseUnits("0.1", "gwei"),
    gasLimit: 400_000,
  })
  console.log("Tx response -> ", txRes)
  if (!txRes) {
    throw new Error('Transaction failed');
  }
  else{
    console.log('Swap successful! ✅')
  }

}
main().catch(console.error);
