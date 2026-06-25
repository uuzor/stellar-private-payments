#!/bin/bash
# Deploy SPM contract to Soroban testnet/futurenet
# Usage: ./scripts/deploy_spm.sh [network] [kp_file]

set -e

NETWORK=${1:-futurenet}
KEY_FILE=${2:-}

# Contract source
CONTRACT_DIR="contracts/spm"

echo "=== SPM Contract Deployment ==="
echo "Network: $NETWORK"

# Build contract
echo "Building contract..."
soroban contract build --release

# Get WASM hash
WASM_HASH=$(soroban contract hash target/wasm32-unknown-unknown/release/spm_contract.wasm 2>/dev/null || echo "manual_hash_needed")
echo "WASM Hash: $WASM_HASH"

# Deploy contract
if [ -n "$KEY_FILE" ]; then
    echo "Deploying with identity: $KEY_FILE"
    soroban contract deploy \
        --network $NETWORK \
        --source $KEY_FILE \
        --wasm target/wasm32-unknown-unknown/release/spm_contract.wasm
else
    echo "Deploying with RPC..."
    # Use RPC endpoint
    soroban contract deploy \
        --network $NETWORK \
        --wasm target/wasm32-unknown-unknown/release/spm_contract.wasm
fi

echo ""
echo "=== Post-Deployment Setup ==="
echo "After deployment, call initialize with:"
echo "  - VK hash (32 bytes): From verification_key.json hash"
echo "  - Nullifier root (32 bytes): Initial merkle tree root"
echo ""
echo "Example initialize call:"
echo '  soroban contract invoke \'
echo '    --network futurenet \'
echo '    --source <KEY> \'
echo '    --id <CONTRACT_ID> \'
echo '    -- \'
echo '    initialize \'
echo '    --vk 0x<vk_hash> \'
echo '    --nullifier_root 0x<initial_root>'
