import { Token } from '@uniswap/sdk-core'
import { FeeAmount } from '@uniswap/v3-sdk'

interface ExampleConfig {
  rpc: {
    local: string
    mainnet: string
  }
  tokens: {
    in: Token
    amountIn: number
    out: Token
    poolFee: number
  },
  wallet?: { 
    address: string
  }
}

const WETH_TOKEN = new Token(
  1,
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // on Arbitrum
  18,
  'WETH',
  'Wrapped Ether'
)

const USDC_TOKEN = new Token(
  1,
  '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // on Mainnet
  6,
  'USDC',
  'USD//C'
)

export const CurrentConfig: ExampleConfig = {
    rpc: {
      local: '',
      mainnet: 'https://ethereum-rpc.publicnode.com',
    },
    tokens: {
      in: USDC_TOKEN,
      amountIn: 1, // in natural units
      out: WETH_TOKEN,
      poolFee: FeeAmount.MEDIUM
    },
    wallet: {
      address: "0x8BFCF9e2764BC84DE4BBd0a0f5AAF19F47027A73"
    }
  }