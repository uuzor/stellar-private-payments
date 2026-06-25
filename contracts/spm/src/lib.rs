#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, BytesN, Env, Symbol,
};

/// Data key for storing verification key
const VK: Symbol = symbol_short!("vk");
const TOTAL_VOTES: Symbol = symbol_short!("total");
const VOTER_CNT: Symbol = symbol_short!("cnt");
const STATUS: Symbol = symbol_short!("status");
const RESULT: Symbol = symbol_short!("result");
const NULLIFIER_ROOT: Symbol = symbol_short!("nroot");

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

#[contract]
pub struct SocialPredictionMarket;

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

    /// Submit a vote with ZK proof
    /// The proof is verified off-chain by the operator
    /// proof_data: ZK proof as raw bytes (256 bytes for Groth16)
    /// vote_commitment: H(vote, nonce) committed by the voter
    pub fn submit_vote(
        env: Env,
        _voter: Address,
        _nullifier: BytesN<32>,
        _vote_commitment: BytesN<32>,
        _proof_data: BytesN<32>,
    ) -> bool {
        // Check market is open
        let status: MarketStatus = env
            .storage()
            .instance()
            .get(&STATUS)
            .unwrap_or(MarketStatus::Open);
        require(status == MarketStatus::Open, "Market is not open");

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
