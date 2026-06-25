# Social Prediction Market - Build System
# Requires: circom, snarkjs, cargo

.PHONY: all build test clean contracts circuits setup prove verify

# Default target
all: circuits contracts

## Circuit Commands
CIRCUIT_DIR := circuits
CIRCUIT_SRC := $(CIRCUIT_DIR)/src
CIRCUIT_OUT := $(CIRCUIT_DIR)/testdata
CIRCUIT_NAME := vote

circuits: $(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs $(CIRCUIT_OUT)/$(CIRCUIT_NAME)_js/$(CIRCUIT_NAME).wasm

$(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs: $(CIRCUIT_SRC)/$(CIRCUIT_NAME).circom
	circom $(CIRCUIT_SRC)/$(CIRCUIT_NAME).circom --r1cs --wasm --sym -o $(CIRCUIT_OUT)

$(CIRCUIT_OUT)/$(CIRCUIT_NAME)_js/$(CIRCUIT_NAME).wasm: $(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs
	@echo "WASM already built"

circuits/clean:
	rm -rf $(CIRCUIT_OUT)/*

## Trusted Setup (Powers of Tau)
PTAU_POWER := 14
PTAU_FILE := $(CIRCUIT_OUT)/pot14_final.ptau

setup: $(PTAU_FILE)
	@echo "Trusted setup complete"

$(PTAU_FILE): $(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs
	snarkjs powersoftau new bn128 $(PTAU_POWER) -v -c $(CIRCUIT_OUT)/pot14_0000.ptau
	snarkjs powersoftau contribute $(CIRCUIT_OUT)/pot14_0000.ptau $(CIRCUIT_OUT)/pot14_final.ptau -n="First contribution" -e="$(shell date +%s)"
	snarkjs powersoftau prepare phase2 $(CIRCUIT_OUT)/pot14_final.ptau $(CIRCUIT_OUT)/pot14_final.ptau -v
	rm -f $(CIRCUIT_OUT)/pot14_0000.ptau

## ZKey Generation
ZKEY_DIR := $(CIRCUIT_OUT)
INITIAL_ZKEY := $(ZKEY_DIR)/$(CIRCUIT_NAME)_0000.zkey
FINAL_ZKEY := $(ZKEY_DIR)/$(CIRCUIT_NAME)_final.zkey

zkey: $(FINAL_ZKEY)

$(INITIAL_ZKEY): $(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs $(PTAU_FILE)
	snarkjs groth16 setup $(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs $(PTAU_FILE) $(INITIAL_ZKEY)

$(FINAL_ZKEY): $(INITIAL_ZKEY)
	snarkjs zkey contribute $(INITIAL_ZKEY) $(FINAL_ZKEY) -n="First contribution" -e="$(shell date +%s)"
	snarkjs zkey export verificationkey $(FINAL_ZKEY) $(ZKEY_DIR)/verification_key.json

zkey/verify: $(FINAL_ZKEY)
	snarkjs zkey verify $(CIRCUIT_OUT)/$(CIRCUIT_NAME).r1cs $(PTAU_FILE) $(FINAL_ZKEY)

## Proof Generation
PROOF_DIR := $(CIRCUIT_OUT)
INPUT_FILE := $(PROOF_DIR)/input.json
PROOF_FILE := $(PROOF_DIR)/proof.json
PUBLIC_FILE := $(PROOF_DIR)/public.json
WASM_FILE := $(CIRCUIT_OUT)/$(CIRCUIT_NAME)_js/$(CIRCUIT_NAME).wasm

prove: $(PROOF_FILE)

$(PROOF_FILE): $(FINAL_ZKEY) $(WASM_FILE) $(INPUT_FILE)
	snarkjs groth16 fullprove $(INPUT_FILE) $(WASM_FILE) $(FINAL_ZKEY) $(PROOF_FILE) $(PUBLIC_FILE)

## Proof Verification
verify: $(PROOF_FILE) $(ZKEY_DIR)/verification_key.json
	snarkjs groth16 verify $(ZKEY_DIR)/verification_key.json $(PUBLIC_FILE) $(PROOF_FILE)

## Contract Commands
CONTRACT_DIR := contracts
CONTRACT_NAME := social-prediction-market

contracts: 
	cd $(CONTRACT_DIR) && cargo build --release --target wasm32-unknown-unknown

contracts/test:
	cd $(CONTRACT_DIR) && cargo test

contracts/clean:
	cd $(CONTRACT_DIR) && cargo clean

## WASM Output
contracts/wasm: contracts
	cp $(CONTRACT_DIR)/target/wasm32-unknown-unknown/release/$(CONTRACT_NAME).wasm ./$(CONTRACT_NAME).wasm

## Full Pipeline
full: circuits setup zkey contracts

## Install Dependencies
install-deps:
	@echo "Installing dependencies..."
	@which circom || (echo "Installing circom..." && cargo install --path ./circom_temp/circom)
	@npm install
	@echo "Dependencies installed"

## Help
help:
	@echo "Available targets:"
	@echo "  circuits    - Compile Circom circuits"
	@echo "  setup       - Run Powers of Tau ceremony"
	@echo "  zkey        - Generate proving/verification keys"
	@echo "  contracts   - Build Soroban contracts"
	@echo "  prove       - Generate ZK proof"
	@echo "  verify      - Verify ZK proof"
	@echo "  full        - Run full build pipeline"
	@echo "  clean       - Clean build artifacts"
