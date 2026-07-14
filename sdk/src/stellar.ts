/**
 * shared/stellar.ts
 * Common XDR-building and submission utilities used by all org SDKs.
 * Pattern: build unsigned XDR → return to client → client signs with Freighter → submit.
 *
 * This mirrors the pattern used by Trustless Work and other accepted Stellar Wave repos:
 *   https://docs.trustlesswork.com/trustless-work/developer-resources/getting-started
 */

export type StellarNetwork = 'mainnet' | 'testnet'

export const NETWORK_CONFIG: Record<StellarNetwork, { rpcUrl: string; passphrase: string }> = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://mainnet.stellar.validationcloud.io/v1/XGWqKsGlMwJgAMniS3Xa6gL8fBpMQDnUBB_2Bp6Ejxk',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
}

export interface InvokeParams {
  contractId: string
  functionName: string
  args: unknown[]        // ScVal-encoded args
  network: StellarNetwork
  rpcUrl?: string
}

export interface XDRResult {
  /** Unsigned transaction XDR — must be signed by the caller's wallet before submitting */
  unsignedXdr: string
  /** The fee charged for simulation */
  simulatedFee: string
  /** Whether simulation succeeded */
  ok: boolean
  error?: string
}

export interface SubmitResult {
  /** Stellar transaction hash */
  txHash: string
  /** Ledger the transaction was included in */
  ledger: number
  /** Whether the transaction succeeded on-chain */
  ok: boolean
  /** Return value from the contract function, if any */
  returnValue?: unknown
  error?: string
}

/**
 * Build an unsigned InvokeContractOp transaction XDR.
 * The caller is responsible for signing the XDR with their keypair or Freighter
 * before calling submitSignedXdr().
 *
 * Real implementation uses @stellar/stellar-sdk:
 *   const server = new SorobanRpc.Server(rpcUrl)
 *   const account = await server.getAccount(sourcePublicKey)
 *   const contract = new Contract(contractId)
 *   const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase })
 *     .addOperation(contract.call(functionName, ...scValArgs))
 *     .setTimeout(300)
 *     .build()
 *   const simResult = await server.simulateTransaction(tx)
 *   const assembled = SorobanRpc.assembleTransaction(tx, simResult).build()
 *   return { unsignedXdr: assembled.toXDR(), simulatedFee: simResult.minResourceFee, ok: true }
 */
export async function buildUnsignedXdr(_params: InvokeParams & { sourcePublicKey: string }): Promise<XDRResult> {
  // Stub — real impl above
  return {
    unsignedXdr: `AAAAAQ...${_params.functionName}...XDR_PLACEHOLDER`,
    simulatedFee: '1000000',
    ok: true,
  }
}

/**
 * Submit a signed XDR transaction to the Stellar network.
 * The XDR must have been signed by the appropriate keypair before calling this.
 *
 * Real implementation:
 *   const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase)
 *   const result = await server.sendTransaction(tx)
 *   // Poll getTransaction() until status !== NOT_FOUND
 */
export async function submitSignedXdr(
  signedXdr: string,
  network: StellarNetwork,
  rpcUrl?: string,
): Promise<SubmitResult> {
  const url = rpcUrl ?? NETWORK_CONFIG[network].rpcUrl
  console.log(`[stellar] submitting to ${url}`)
  // Stub
  return {
    txHash: `txhash_${Date.now().toString(36)}`,
    ledger: 51_982_441,
    ok: true,
  }
}

/**
 * Poll until a submitted transaction is confirmed or failed.
 * Uses exponential backoff with a max of 60s total wait.
 */
export async function waitForConfirmation(
  txHash: string,
  network: StellarNetwork,
  rpcUrl?: string,
): Promise<SubmitResult> {
  const url = rpcUrl ?? NETWORK_CONFIG[network].rpcUrl
  console.log(`[stellar] waiting for tx ${txHash} on ${url}`)
  // Stub — real impl polls server.getTransaction(txHash) every 2s with backoff
  return { txHash, ledger: 51_982_442, ok: true }
}

/**
 * Encode a JavaScript value to a Soroban ScVal for use in contract calls.
 * Handles: i128, u64, string (Symbol/Bytes), Address, bool, Vec, Map.
 *
 * Real implementation uses @stellar/stellar-sdk:
 *   import { nativeToScVal } from '@stellar/stellar-sdk'
 *   return nativeToScVal(value, { type: 'i128' })
 */
export function toScVal(value: unknown, type: string): unknown {
  return { type, value }  // stub
}
