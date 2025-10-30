# Forno "Block Out of Range" Issue Reproduction

This script reproduces the intermittent "block is out of range" (-32019) error that occurs when using Forno after CEL2.

## The Problem

When submitting transactions and waiting for receipts via Forno, we occasionally see:

- Transaction submits successfully
- `waitForTransactionReceipt` starts polling
- `eth_getBlockByNumber` fails with HTTP 400 and error code `-32019: "block is out of range"`
- This causes viem's wait logic to abort early, even though the transaction eventually succeeds

## Root Cause

Forno's load balancer routes requests to different nodes with different sync states:

1. One node (ahead) knows about block N and returns the transaction's block number
2. Another node (behind) hasn't processed block N yet and returns "block is out of range"
3. Viem treats the 400 error as non-retriable and aborts

## Running the Test

### Prerequisites

```bash
npm install
# or
yarn install
```

### Usage

```bash
# Test with Forno (shows the issue)
PRIVATE_KEY=0x... npm send

# Test with Alchemy (works fine)
PRIVATE_KEY=0x... RPC_URL=https://celo-mainnet.g.alchemy.com/v2/YOUR_KEY npm send

# Test with custom RPC
PRIVATE_KEY=0x... RPC_URL=https://your-rpc-url.com npm send
```

**Note:** Make sure the account has sufficient CELO balance (>0.1 CELO for 100 sends).

## Test Results

### Forno

```
=== RESULTS ===
Total sends: 100
Successful: 83 (83.00%)
Failed: 17 (17.00%)
  - Block out of range errors: 14
  - Other errors: 3
```

### Alchemy

```
=== RESULTS ===
Total sends: 100
Successful: 100 (100.00%)
Failed: 0 (0.00%)
  - Block out of range errors: 0
  - Other errors: 0
```

## Sample Error Output

```
[55/100] Sending 0.001 CELO...
  [RPC] eth_getTransactionCount ["0x6AD01Ac6841b67f27DC1A039FefBF5804003d6a4","pending"]
        → 0x14c
  [RPC] eth_sendRawTransaction [...]
        → 0x8a16fededdfc0bb73f31ee2934c72af6f08f58b821a70528c23ded850424017b
[55/100] Waiting for tx: 0x8a16fededdfc0bb73f31ee2934c72af6f08f58b821a70528c23ded850424017b
  [RPC] eth_getTransactionByHash [...]
        → blockNumber=0x2fa3fe6  ← Node A says tx is in block 0x2fa3fe6
  [RPC] eth_getBlockByNumber ["0x2fa3fe6",true]
        → ERROR -32019: block is out of range  ← Node B hasn't seen 0x2fa3fe6 yet
[55/100] ✗ Failed: BLOCK OUT OF RANGE error
```

## Potential Solutions

### Option 1: Forno Changes

- Return `null` instead of `-32019` for blocks not yet available (standard behavior)
- Implement sticky sessions to route requests from same client to same node
- Only route to nodes within N blocks of head

### Option 2: Viem Changes

- Treat `-32019` during `waitForTransactionReceipt` as retriable (like `null`)

## Environment

- viem: 2.37.9
- Chain: Celo (CEL2)
- RPC: Forno (https://forno.celo.org)

