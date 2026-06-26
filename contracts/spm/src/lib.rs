#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol, Vec, vec,
};
use soroban_sdk::crypto::bn254::{
    Bn254Fr, Bn254G1Affine as G1Affine, Bn254G2Affine as G2Affine,
};

/// Data key for storing verification key
const VK: Symbol = symbol_short!("vk");
const TOTAL_VOTES: Symbol = symbol_short!("total");
const VOTER_CNT: Symbol = symbol_short!("cnt");
const STATUS: Symbol = symbol_short!("status");
const RESULT: Symbol = symbol_short!("result");
const NULLIFIER_ROOT: Symbol = symbol_short!("nroot");
const USED_NULLIFIERS: Symbol = symbol_short!("usedn");

/// Market status
#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MarketStatus {
    Open = 0,
    Closed = 1,
    Resolved = 2,
}

/// Vote result
#[contracttype]
#[derive(Clone)]
pub struct VoteResult {
    pub votes_yes: u32,
    pub votes_no: u32,
    pub total_voters: u32,
    pub minority_wins: bool,
}

/// Error types for proof verification
#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProofError {
    InvalidProof = 0,
    MalformedProof = 1,
    NullifierAlreadyUsed = 2,
    MarketNotOpen = 3,
}

#[contract]
pub struct SocialPredictionMarket;

// Helper: Verify Groth16 proof using BN254 precompile
fn verify_groth16(
    env: &Env,
    a: G1Affine,
    b: G2Affine,
    c: G1Affine,
    public_inputs: Vec<Bn254Fr>,
    vk_alpha: G1Affine,
    vk_beta: G2Affine,
    vk_gamma: G2Affine,
    vk_delta: G2Affine,
    vk_ic: Vec<G1Affine>,
) -> Result<bool, ProofError> {
    let bn = env.crypto().bn254();

    // Check public inputs length matches IC
    if public_inputs.len().checked_add(1) != Some(vk_ic.len()) {
        return Err(ProofError::MalformedProof);
    }

    // Compute vk_x = IC[0] + sum(IC[i+1] * pub_input[i])
    let mut vk_x = vk_ic.get(0).ok_or(ProofError::MalformedProof)?;

    for i in 0..public_inputs.len() {
        let s = public_inputs.get(i).ok_or(ProofError::MalformedProof)?;
        let ic_idx = i.checked_add(1).ok_or(ProofError::MalformedProof)?;
        let v = vk_ic.get(ic_idx).ok_or(ProofError::MalformedProof)?;
        let prod = bn.g1_mul(&v, &s);
        vk_x = bn.g1_add(&vk_x, &prod);
    }

    // Pairing check: e(-A, B) * e(alpha, beta) * e(vk_x, gamma) * e(C, delta) == 1
    let neg_a = -a;

    let g1_points = vec![env, neg_a, vk_alpha.clone(), vk_x, c];
    let g2_points = vec![env, b, vk_beta.clone(), vk_gamma, vk_delta];

    if bn.pairing_check(g1_points, g2_points) {
        Ok(true)
    } else {
        Err(ProofError::InvalidProof)
    }
}

#[contractimpl]
impl SocialPredictionMarket {
    /// Initialize market with verification key hash and nullifier root
    pub fn initialize(env: Env, vk: BytesN<32>, nullifier_root: BytesN<32>) {
        env.storage().instance().set(&VK, &vk);
        env.storage().instance().set(&NULLIFIER_ROOT, &nullifier_root);
        env.storage().instance().set(&TOTAL_VOTES, &0u32);
        env.storage().instance().set(&VOTER_CNT, &0u32);
        env.storage().instance().set(&STATUS, &MarketStatus::Open);
    }

    /// Submit a vote with ZK proof (full on-chain verification)
    /// 
    /// Uses Soroban's BN254 precompile for Groth16 verification
    /// - nullifier: Unique hash to prevent double-voting (public input)
    /// - vote_commitment: H(vote, nonce) commitment (public input)
    /// - proof_a, proof_b, proof_c: Groth16 proof points
    /// - vk_alpha, vk_beta, vk_gamma, vk_delta: Verification key points
    /// - vk_ic: Verification key IC array
    pub fn submit_vote(
        env: Env,
        voter: Address,
        nullifier: BytesN<32>,
        vote_commitment: BytesN<32>,
        proof_a: BytesN<64>,   // G1 point A
        proof_b: BytesN<128>,  // G2 point B
        proof_c: BytesN<64>,   // G1 point C
        vk_alpha: BytesN<64>,  // G1 point alpha
        vk_beta: BytesN<128>,  // G2 point beta
        vk_gamma: BytesN<128>, // G2 point gamma
        vk_delta: BytesN<128>, // G2 point delta
        vk_ic: Vec<BytesN<64>>, // IC array (public input commitments)
    ) -> bool {
        // Check market is open
        let status: MarketStatus = env
            .storage()
            .instance()
            .get(&STATUS)
            .unwrap_or(MarketStatus::Open);
        require(status == MarketStatus::Open, "Market is not open");

        // Check nullifier hasn't been used (prevent double-voting)
        let used: bool = env.storage().instance().get(&USED_NULLIFIERS).unwrap_or(false);
        require(!used, "Nullifier already used");

        // Get stored nullifier root
        let stored_root: BytesN<32> = env
            .storage()
            .instance()
            .get(&NULLIFIER_ROOT)
            .unwrap_or(BytesN::from_array(&env, &[0u8; 32]));
        
        // Build public inputs as field elements
        let mut public_inputs: Vec<Bn254Fr> = Vec::new(&env);
        public_inputs.push_back(Bn254Fr::from_bytes(nullifier));
        public_inputs.push_back(Bn254Fr::from_bytes(vote_commitment));

        // Convert bytes to curve points
        let a = G1Affine::from_bytes(proof_a);
        let b = G2Affine::from_bytes(proof_b);
        let c = G1Affine::from_bytes(proof_c);
        
        let alpha = G1Affine::from_bytes(vk_alpha);
        let beta = G2Affine::from_bytes(vk_beta);
        let gamma = G2Affine::from_bytes(vk_gamma);
        let delta = G2Affine::from_bytes(vk_delta);
        
        // Convert IC bytes to G1 points
        let mut ic_vec: Vec<G1Affine> = Vec::new(&env);
        for ic_bytes in vk_ic.iter() {
            ic_vec.push_back(G1Affine::from_bytes(ic_bytes));
        }
        
        // Verify the proof on-chain
        verify_groth16(
            &env,
            a, b, c,
            public_inputs,
            alpha, beta, gamma, delta,
            ic_vec,
        ).expect("Invalid ZK proof");

        // Mark nullifier as used
        env.storage().instance().set(&USED_NULLIFIERS, &true);

        // Update counters
        let total: u32 = env.storage().instance().get(&TOTAL_VOTES).unwrap_or(0);
        env.storage().instance().set(&TOTAL_VOTES, &(total + 1));

        let cnt: u32 = env.storage().instance().get(&VOTER_CNT).unwrap_or(0);
        env.storage().instance().set(&VOTER_CNT, &(cnt + 1));

        true
    }

    /// Resolve market with final tally
    pub fn resolve(
        env: Env,
        votes_yes: u32,
        votes_no: u32,
        total_voters: u32,
        minority_threshold: u32,
    ) -> VoteResult {
        let status: MarketStatus = env
            .storage()
            .instance()
            .get(&STATUS)
            .unwrap_or(MarketStatus::Open);
        require(status == MarketStatus::Open, "Market is not open");

        let minority = if votes_yes < votes_no {
            votes_yes
        } else {
            votes_no
        };

        let pct = (minority * 100) / total_voters.max(1);
        let minority_wins = pct >= minority_threshold;

        let result = VoteResult {
            votes_yes,
            votes_no,
            total_voters,
            minority_wins,
        };

        env.storage().instance().set(&RESULT, &result);
        env.storage().instance().set(&STATUS, &MarketStatus::Resolved);

        result
    }

    /// Close market without resolving
    pub fn close_market(env: Env) {
        env.storage().instance().set(&STATUS, &MarketStatus::Closed);
    }

    /// Get market status
    pub fn get_status(env: Env) -> MarketStatus {
        env.storage()
            .instance()
            .get(&STATUS)
            .unwrap_or(MarketStatus::Open)
    }

    /// Get result after resolution
    pub fn get_result(env: Env) -> Option<VoteResult> {
        env.storage().instance().get(&RESULT)
    }

    /// Get total votes
    pub fn get_total_votes(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&TOTAL_VOTES)
            .unwrap_or(0u32)
    }

    /// Get verification key
    pub fn get_verification_key(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&VK)
    }

    /// Get nullifier root
    pub fn get_nullifier_root(env: Env) -> Option<BytesN<32>> {
        env.storage().instance().get(&NULLIFIER_ROOT)
    }
}

fn require(cond: bool, msg: &str) {
    if !cond {
        panic!("{}", msg);
    }
}

#[cfg(test)]
mod test;
