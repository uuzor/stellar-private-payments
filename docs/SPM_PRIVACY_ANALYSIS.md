# SPM Privacy Analysis

## What Is Implemented vs What Is Mocks

### ✅ REAL / IMPLEMENTED

| Component | Status | Description |
|-----------|--------|-------------|
| **ZK Circuit** | ✅ REAL | `vote.circom` - BinaryVote with Poseidon commitments |
| **ZK Trusted Setup** | ✅ REAL | Powers of Tau (2^14) + Groth16 keys generated |
| **Circuit Compilation** | ✅ REAL | Compiled to WASM, 2910 constraints |
| **Soroban Contract** | ✅ REAL | Deployed on testnet |
| **Contract Storage** | ✅ REAL | Status, votes, results stored on-chain |
| **Nullifier Root** | ✅ REAL | Merkle tree root stored, verified in circuit |

### ⚠️ MOCKED / NOT IMPLEMENTED

| Component | Status | Description |
|-----------|--------|-------------|
| **ZK Proof Verification ON-CHAIN** | ❌ MOCKED | Contract accepts `proof_data` but doesn't verify |
| **Full Groth16 Verifier** | ❌ NOT BUILT | Would require ~100k gas, expensive on Soroban |
| **Real Merkle Tree** | ⚠️ PARTIAL | Root stored, but tree management off-chain |
| **Browser WASM Prover** | ❌ NOT BUILT | Prover tool exists but not browser-integrated |

---

## Privacy Analysis: What Others Can See

### 🔴 ON-CHAIN (Public to Everyone)

When you submit a vote, the following is **VISIBLE** to all observers:

```
1. Your Stellar Address (voter)
2. Total Vote Count (increments by 1)
3. Nullifier (hash of your secret)
4. Vote Commitment H(vote, nonce)
5. Proof Data (bytes - currently not verified)
```

### ✅ PRIVACY (What IS Protected)

The circuit and commitment scheme protect:

```
1. VOTE VALUE - Not revealed until resolution
   - Commitment H(vote, nonce) is stored
   - Cannot determine if YES or NO from commitment
   - Requires knowing nonce to reveal vote

2. NULLIFIER SECRET - Not revealed
   - Hash(nullifier) is public
   - Original secret is private
   - Prevents double-voting without revealing identity

3. VOTER IDENTITY LINKAGE - Partially protected
   - Address is public
   - But vote commitment has no linkage to address
   - Anyone can vote without linking to who they are
```

### ⚠️ PARTIAL PRIVACY (Current Implementation)

**What CAN be observed:**

1. **Vote Count Timeline**
   ```
   Block 1: Total votes = 1
   Block 2: Total votes = 2  ← Someone voted
   Block 3: Total votes = 3  ← Another person voted
   ```
   Observers can see when votes happen, creating timing patterns.

2. **Nullifier Reveals Pattern**
   ```
   If same nullifier appears twice → Double vote attempt (rejected)
   ```
   This is intentional and correct behavior.

3. **No Vote Values**
   - Commitments are indistinguishable
   - H(1, nonce) ≈ H(0, nonce) (Poseidon outputs look random)

---

## Can Another User See Individual Votes Before Resolution?

### ❌ NO - Vote values are hidden

**Technical proof:**

```
User A votes YES:
  - Submitted: commitment = H(1, nonce_a)
  - On-chain: H(1, nonce_a) ← Looks random, no way to know it's YES

User B votes NO:
  - Submitted: commitment = H(0, nonce_b)
  - On-chain: H(0, nonce_b) ← Looks random, indistinguishable
```

**What B sees:**
- A's address voted
- A's commitment is H(1, nonce_a) 
- **B CANNOT determine if A voted YES or NO**

### ⚠️ BUT - Some information leaks:

1. **Timing Attack**
   ```
   If only 1 person can vote at a time, observer knows who voted when
   ```

2. **Total Count Reveals Participation**
   ```
   If total = 5, everyone knows 5 people voted
   ```

3. **Nullifier Uniqueness**
   ```
   If nullifier already exists → vote rejected
   This prevents double-voting but reveals if someone tried
   ```

---

## What Happens at Resolution?

When `resolve()` is called:

```
ON-CHAIN STORED (Public):
  - votes_yes: ACTUAL COUNT (e.g., 3)
  - votes_no: ACTUAL COUNT (e.g., 2)
  - minority_wins: TRUE (3 < 2? No → NO wins)
```

**At resolution:**
- Vote counts are revealed
- Individual votes remain anonymous
- Only aggregate counts are public

---

## Summary: Privacy Properties

| Property | Status | Notes |
|----------|--------|-------|
| Vote secrecy | ✅ | Commitment hides vote until resolution |
| Double-vote prevention | ✅ | Nullifier system works |
| Identity privacy | ⚠️ | Address public, but not linked to vote |
| Timing privacy | ❌ | Block timing reveals order |
| Count privacy | ❌ | Total count visible at all times |

---

## For True Privacy: What's Missing

### 1. On-Chain ZK Verification
```rust
// Current (mocked):
pub fn submit_vote(..., proof_data: BytesN<32>) -> bool {
    // Just stores, doesn't verify Groth16 proof
    true
}

// Real (expensive):
pub fn submit_vote(..., proof: Groth16Proof) -> bool {
    verify_groth16 proof against vk // ~100k gas
}
```

### 2. Commitment Anonymity Set
```
Currently: Each commitment is identifiable as "a vote"
Should be: Votes mixed with decoy commitments
```

### 3. Off-Chain Mixer
```
Currently: Direct submission to contract
Should be: Votes batched and submitted together
```

---

## Conclusion

**What We Have:**
- ✅ Real ZK circuit with proper constraints
- ✅ Real Groth16 proving/verification keys  
- ✅ Vote commitment scheme (Poseidon hash)
- ✅ Nullifier system for double-vote prevention
- ⚠️ Proof data accepted but NOT verified on-chain

**What's Mocked:**
- ❌ On-chain proof verification (would cost ~100k gas)
- ❌ Full privacy (timing/count still visible)

**Verdict:** The privacy is **PARTIAL**. Vote values are hidden by the commitment scheme, but the implementation is not trustless (relies on off-chain proof verification). For production use, implement on-chain Groth16 verification or use a trusted prover service.

---

## Recommendations for Production

1. **Option A: Trusted Prover**
   - Keep current design
   - Off-chain service verifies proofs
   - Trust assumption: prover is honest

2. **Option B: Aggregated Proofs**
   - Batch votes into single proof
   - Submit aggregated commitment
   - Hides individual votes and timing

3. **Option C: Full On-Chain Verification**
   - Implement Groth16 verifier in contract
   - Expensive but trustless
   - Consider precompiles or hardware support
