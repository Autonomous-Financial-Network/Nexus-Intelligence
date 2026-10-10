/**
 * stellar.ts
 * Real XDR-building and transaction submission utilities using @stellar/stellar-sdk.
 * Pattern: build unsigned XDR → caller signs (Freighter or keypair) → submit.
 */

import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StellarNetwork = 'mainnet' | 'testnet'

export interface NetworkConfig {
  rpcUrl: string
  horizonUrl: string
  passphrase: string
}

export const NETWORK_CONFIG: Record<StellarNetwork, NetworkConfig> = {
  testnet: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpcUrl: 'https://mainnet.stellar.validationcloud.io/v1/XGWqKsGlMwJgAMniS3Xa6gL8fBpMQDnUBB_2Bp6Ejxk',
    horizonUrl: 'https://horizon.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
}

export interface ScValArg {
  type: 'address' | 'i128' | 'u64' | 'u32' | 'string' | 'bool' | 'symbol'
  value: unknown
}

export interface InvokeParams {
  contractId: string
  functionName: string
  args: ScValArg[]
  network: StellarNetwork
  rpcUrl?: string
  sourcePublicKey: string
  /** Timeout in seconds (default: 300) */
  timeoutSecs?: number
}

export interface XDRResult {
  /** Unsigned transaction XDR — must be signed before submitting */
  unsignedXdr: string
  /** Simulated fee in stroops */
  simulatedFee: string
  ok: boolean
  error?: string
}

export interface SubmitResult {
  txHash: string
  ledger: number
  ok: boolean
  returnValue?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// ScVal encoding
// ---------------------------------------------------------------------------

/**
 * Encode a typed JS value into a Soroban ScVal.
 */
export function toScVal(arg: ScValArg): xdr.ScVal {
  switch (arg.type) {
    case 'address':
      return nativeToScVal(arg.value as string, { type: 'address' })
    case 'i128':
      return nativeToScVal(arg.value as bigint, { type: 'i128' })
    case 'u64':
      return nativeToScVal(arg.value as bigint, { type: 'u64' })
    case 'u32':
      return nativeToScVal(arg.value as number, { type: 'u32' })
    case 'string':
      return nativeToScVal(arg.value as string, { type: 'string' })
    case 'symbol':
      return nativeToScVal(arg.value as string, { type: 'symbol' })
    case 'bool':
      return nativeToScVal(arg.value as boolean, { type: 'bool' })
    default: {
      const _exhaustive: never = arg.type
      throw new Error(`Unknown ScVal type: ${_exhaustive}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Build unsigned XDR
// ---------------------------------------------------------------------------

/**
 * Build a simulated, assembled, unsigned InvokeContractOp transaction XDR.
 * The caller signs with Freighter (owner) or a Keypair (agent machine key)
 * before calling submitSignedXdr().
 */
export async function buildUnsignedXdr(params: InvokeParams): Promise<XDRResult> {
  const cfg = NETWORK_CONFIG[params.network]
  const rpcUrl = params.rpcUrl ?? cfg.rpcUrl
  const server = new SorobanRpc.Server(rpcUrl, { allowHttp: false })

  try {
    const account = await server.getAccount(params.sourcePublicKey)
    const contract = new Contract(params.contractId)
    const scValArgs = params.args.map(toScVal)

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: cfg.passphrase,
    })
      .addOperation(contract.call(params.functionName, ...scValArgs))
      .setTimeout(params.timeoutSecs ?? 300)
      .build()

    const simResult = await server.simulateTransaction(tx)

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      return {
        unsignedXdr: '',
        simulatedFee: '0',
        ok: false,
        error: `Simulation failed: ${simResult.error}`,
      }
    }

    const assembled = SorobanRpc.assembleTransaction(tx, simResult).build()

    return {
      unsignedXdr: assembled.toXDR(),
      simulatedFee: simResult.minResourceFee,
      ok: true,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { unsignedXdr: '', simulatedFee: '0', ok: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Submit signed XDR
// ---------------------------------------------------------------------------

/**
 * Submit a signed XDR transaction to the Stellar network.
 * Returns immediately after broadcast (does not wait for confirmation).
 */
export async function submitSignedXdr(
  signedXdr: string,
  network: StellarNetwork,
  rpcUrl?: string,
): Promise<SubmitResult> {
  const cfg = NETWORK_CONFIG[network]
  const url = rpcUrl ?? cfg.rpcUrl
  const server = new SorobanRpc.Server(url, { allowHttp: false })

  try {
    const tx = TransactionBuilder.fromXDR(signedXdr, cfg.passphrase)
    const res = await server.sendTransaction(tx)

    if (res.status === 'ERROR') {
      return {
        txHash: res.hash,
        ledger: 0,
        ok: false,
        error: `Submission error: ${JSON.stringify(res.errorResult)}`,
      }
    }

    return { txHash: res.hash, ledger: 0, ok: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { txHash: '', ledger: 0, ok: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Wait for confirmation
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000
const MAX_WAIT_MS = 60_000

/**
 * Poll getTransaction() until the tx is confirmed, failed, or the timeout elapses.
 * Uses a fixed 2 s poll interval with a 60 s hard timeout.
 */
export async function waitForConfirmation(
  txHash: string,
  network: StellarNetwork,
  rpcUrl?: string,
): Promise<SubmitResult> {
  const cfg = NETWORK_CONFIG[network]
  const url = rpcUrl ?? cfg.rpcUrl
  const server = new SorobanRpc.Server(url, { allowHttp: false })

  const deadline = Date.now() + MAX_WAIT_MS

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

    try {
      const res = await server.getTransaction(txHash)

      if (res.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        const returnValue = res.returnValue
          ? scValToNative(res.returnValue)
          : undefined
        return {
          txHash,
          ledger: res.ledger,
          ok: true,
          returnValue,
        }
      }

      if (res.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        return {
          txHash,
          ledger: res.ledger ?? 0,
          ok: false,
          error: 'Transaction failed on-chain.',
        }
      }

      // NOT_FOUND → still pending, keep polling
    } catch {
      // Transient RPC error — keep polling
    }
  }

  return {
    txHash,
    ledger: 0,
    ok: false,
    error: `Confirmation timeout after ${MAX_WAIT_MS / 1000}s.`,
  }
}

// ---------------------------------------------------------------------------
// Ledger helpers
// ---------------------------------------------------------------------------

/** Fetch the current ledger sequence number. */
export async function getCurrentLedger(
  network: StellarNetwork,
  rpcUrl?: string,
): Promise<number> {
  const cfg = NETWORK_CONFIG[network]
  const url = rpcUrl ?? cfg.rpcUrl
  const server = new SorobanRpc.Server(url, { allowHttp: false })
  const health = await server.getLatestLedger()
  return health.sequence
}
