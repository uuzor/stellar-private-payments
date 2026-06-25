#!/bin/bash
# SPM VK Generation Script
# Run this script to generate the real verification key for the SPM contract

set -e

CIRCUIT_DIR="$(dirname "$0")"
OUTPUT_DIR="$CIRCUIT_DIR/../testdata"
CIRCUIT_NAME="vote"

echo "=== SPM Verification Key Generation ==="
echo "Circuit directory: $CIRCUIT_DIR"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check for required tools
if ! command -v circom &> /dev/null; then
    echo "❌ circom not found. Installing via npx..."
    npx circom --version || npm install -g circom@0.5.8
fi

if ! command -v snarkjs &> /dev/null; then
    echo "❌ snarkjs not found. Installing..."
    npm install -g snarkjs
fi

# Step 1: Compile circuit
echo "📦 Step 1: Compiling circuit..."
cd "$CIRCUIT_DIR"
circom "$CIRCUIT_NAME.circom" --r1cs --wasm --sym -o "$OUTPUT_DIR"

# Step 2: Powers of Tau (if not exists)
PTAU_FILE="$OUTPUT_DIR/pot14_final.ptau"
if [ ! -f "$PTAU_FILE" ]; then
    echo "🔐 Step 2: Running Powers of Tau trusted setup..."
    snarkjs powersoftau new bn128 14 "$OUTPUT_DIR/pot14_0000.ptau" -v
    snarkjs powersoftau contribute "$OUTPUT_DIR/pot14_0000.ptau" "$PTAU_FILE" -n="First contribution" -e="$(date +%s)"
    rm -f "$OUTPUT_DIR/pot14_0000.ptau"
else
    echo "✅ Powers of Tau already exists"
fi

# Step 3: Generate zKey
echo "🔑 Step 3: Generating zKey..."
INITIAL_ZKEY="$OUTPUT_DIR/${CIRCUIT_NAME}_0000.zkey"
FINAL_ZKEY="$OUTPUT_DIR/${CIRCUIT_NAME}_final.zkey"

snarkjs groth16 setup "$OUTPUT_DIR/${CIRCUIT_NAME}.r1cs" "$PTAU_FILE" "$INITIAL_ZKEY"
snarkjs zkey contribute "$INITIAL_ZKEY" "$FINAL_ZKEY" -n="First contribution" -e="$(date +%s)"

# Step 4: Export verification key
echo "📋 Step 4: Exporting verification key..."
snarkjs zkey export verificationkey "$FINAL_ZKEY" "$OUTPUT_DIR/verification_key.json"

# Step 5: Verify the key
echo "✅ Step 5: Verifying..."
snarkjs zkey verify "$OUTPUT_DIR/${CIRCUIT_NAME}.r1cs" "$PTAU_FILE" "$FINAL_ZKEY"

echo ""
echo "=== Verification Key Generated! ==="
echo "VK file: $OUTPUT_DIR/verification_key.json"
echo ""
echo "To use with SPM contract:"
echo "VERIFIER_VK_JSON=$OUTPUT_DIR/verification_key.json cargo build -p social-prediction-market --release"
