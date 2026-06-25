#![cfg(test)]

use super::*;
use soroban_sdk::{BytesN, Env};

#[test]
fn test_initialize() {
    let env = Env::default();
    let contract_id = env.register(SocialPredictionMarket, ());
    let client = SocialPredictionMarketClient::new(&env, &contract_id);

    let vk = BytesN::<32>::from_array(&env, &[0u8; 32]);
    let nullifier_root = BytesN::<32>::from_array(&env, &[1u8; 32]);
    client.initialize(&vk, &nullifier_root);

    assert!(client.get_verification_key().is_some());
    assert!(client.get_nullifier_root().is_some());
    assert_eq!(client.get_status(), MarketStatus::Open);
}

#[test]
fn test_resolve() {
    let env = Env::default();
    let contract_id = env.register(SocialPredictionMarket, ());
    let client = SocialPredictionMarketClient::new(&env, &contract_id);

    let vk = BytesN::<32>::from_array(&env, &[0u8; 32]);
    let nullifier_root = BytesN::<32>::from_array(&env, &[1u8; 32]);
    client.initialize(&vk, &nullifier_root);

    // 1 yes, 1 no = 50% minority
    let result = client.resolve(&1, &1, &2, &30);
    assert!(result.minority_wins);
    assert_eq!(client.get_status(), MarketStatus::Resolved);
}

#[test]
fn test_submit_vote() {
    let env = Env::default();
    let contract_id = env.register(SocialPredictionMarket, ());
    let client = SocialPredictionMarketClient::new(&env, &contract_id);

    let vk = BytesN::<32>::from_array(&env, &[0u8; 32]);
    let nullifier_root = BytesN::<32>::from_array(&env, &[1u8; 32]);
    client.initialize(&vk, &nullifier_root);

    // Get initial vote count
    let initial_votes = client.get_total_votes();
    assert_eq!(initial_votes, 0);
}
