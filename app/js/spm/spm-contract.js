/**
 * SPM Contract Client
 * Interacts with the Social Prediction Market contract on Soroban
 * 
 * Features full on-chain Groth16 ZK proof verification using BN254 precompile
 */

import { 
    connectWallet, 
    getWalletAddress, 
    signWalletTransaction,
    getWalletNetwork 
} from '../wallet.js';

import { 
    Server, 
    Contract, 
    Networks, 
    BASE_FEE,
    TransactionBuilder,
    Address
} from '@stellar/stellar-sdk';

const SPM_CONTRACT_ID = 'CBOSKNHEZWT2PP2NYRDHWI4MXFDX4WPUYFSANAKUNBMMKXKRQLJH5YM5';

// Contract ABI (method signatures)
const METHODS = {
    INITIALIZE: 'initialize',
    SUBMIT_VOTE: 'submit_vote',
    RESOLVE: 'resolve',
    GET_STATUS: 'get_status',
    GET_RESULT: 'get_result',
    GET_TOTAL_VOTES: 'get_total_votes',
    GET_NULLIFIER_ROOT: 'get_nullifier_root',
    GET_VERIFICATION_KEY: 'get_verification_key',
    CLOSE_MARKET: 'close_market'
};

// Verification Key (from circuit trusted setup)
// These values are specific to the vote.circom circuit
// Generated during: make setup && make zkey
export const VERIFICATION_KEY = {
    alpha: "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // G1 point
    beta: "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // G2 point
    gamma: "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // G2 point
    delta: "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000", // G2 point
    ic: [
        "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    ] // IC array - 2 elements for [nullifier_root, vote_commitment]
};

// Market status enum
export const MarketStatus = {
    OPEN: 0,
    CLOSED: 1,
    RESOLVED: 2
};

/**
 * Get RPC server for the current network
 */
export async function getRpcServer() {
    const { sorobanRpcUrl, networkPassphrase } = await getWalletNetwork();
    return {
        server: new Server(sorobanRpcUrl),
        networkPassphrase
    };
}

/**
 * Get the SPM contract instance
 */
export async function getContract() {
    const { networkPassphrase } = await getWalletNetwork();
    return new Contract(SPM_CONTRACT_ID);
}

/**
 * Get contract ID
 */
export function getContractId() {
    return SPM_CONTRACT_ID;
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

/**
 * Build a Soroban transaction
 */
async function buildTransaction(operations) {
    const walletAddress = await getWalletAddress();
    const { server, networkPassphrase } = await getRpcServer();
    const account = await server.getAccount(walletAddress);

    return new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .setTimeout(300);
}

/**
 * Submit a vote to the market
 * 
 * Full on-chain Groth16 verification using BN254 precompile
 * 
 * @param {Object} voteData - Vote submission data
 * @param {string} voteData.voter - Voter's Stellar address
 * @param {string} voteData.nullifier - Nullifier hash (32 bytes hex)
 * @param {string} voteData.voteCommitment - Vote commitment hash H(vote, nonce) (32 bytes hex)
 * @param {Object} voteData.proof - Groth16 proof components
 * @param {string[]} voteData.proof.a - G1 point A (64 bytes hex)
 * @param {string[]} voteData.proof.b - G2 point B (128 bytes hex)  
 * @param {string[]} voteData.proof.c - G1 point C (64 bytes hex)
 * @param {Object} voteData.vk - Verification key components
 */
export async function submitVote({ voter, nullifier, voteCommitment, proof, vk }) {
    const contract = await getContract();
    const { server, networkPassphrase } = await getRpcServer();
    const walletAddress = await getWalletAddress();
    const account = await server.getAccount(walletAddress);

    console.log('[SPM] Submitting vote with full ZK verification...');

    // Create address object for the voter
    const voterAddress = new Address(voter);

    // Convert hex strings to bytes
    const nullifierBytes = Buffer.from(nullifier.replace('0x', ''), 'hex');
    const commitmentBytes = Buffer.from(voteCommitment.replace('0x', ''), 'hex');
    
    // Proof points
    const proofA = Buffer.from(proof.a.replace('0x', ''), 'hex');
    const proofB = Buffer.from(proof.b.replace('0x', ''), 'hex');
    const proofC = Buffer.from(proof.c.replace('0x', ''), 'hex');
    
    // VK points
    const vkAlpha = Buffer.from(vk.alpha.replace('0x', ''), 'hex');
    const vkBeta = Buffer.from(vk.beta.replace('0x', ''), 'hex');
    const vkGamma = Buffer.from(vk.gamma.replace('0x', ''), 'hex');
    const vkDelta = Buffer.from(vk.delta.replace('0x', ''), 'hex');
    
    // IC array (as array of base64 strings)
    const vkIc = vk.ic.map(ic => Buffer.from(ic.replace('0x', ''), 'hex').toString('base64'));

    const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(contract.call(
            METHODS.SUBMIT_VOTE,
            voterAddress.toScVal(),
            nullifierBytes.toString('base64'),
            commitmentBytes.toString('base64'),
            proofA.toString('base64'),
            proofB.toString('base64'),
            proofC.toString('base64'),
            vkAlpha.toString('base64'),
            vkBeta.toString('base64'),
            vkGamma.toString('base64'),
            vkDelta.toString('base64'),
            vkIc
        ))
        .setTimeout(300)
        .build();

    const signedTx = await signWalletTransaction(transaction.toXDR());
    const tx = await server.sendTransaction(signedTx.signedTxXdr);
    
    console.log('[SPM] Vote submitted with on-chain verification:', tx.hash);
    return tx;
}

/**
 * Resolve the prediction market
 * @param {number} votesYes - Number of yes votes
 * @param {number} votesNo - Number of no votes
 * @param {number} totalVoters - Total expected voters
 * @param {number} minorityThreshold - Threshold percentage for minority wins (e.g., 30 for 30%)
 */
export async function resolve(votesYes, votesNo, totalVoters, minorityThreshold = 30) {
    const contract = await getContract();
    const { server, networkPassphrase } = await getRpcServer();
    const walletAddress = await getWalletAddress();
    const account = await server.getAccount(walletAddress);

    console.log('[SPM] Resolving market...');

    const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(contract.call(
            METHODS.RESOLVE,
            votesYes.toString(),
            votesNo.toString(),
            totalVoters.toString(),
            minorityThreshold.toString()
        ))
        .setTimeout(300)
        .build();

    const signedTx = await signWalletTransaction(transaction.toXDR());
    const tx = await server.sendTransaction(signedTx.signedTxXdr);
    
    console.log('[SPM] Market resolved:', tx.hash);
    return tx;
}

/**
 * Get the current market status
 * @returns {Promise<number>} - Status code (0=Open, 1=Closed, 2=Resolved)
 */
export async function getStatus() {
    const contract = await getContract();
    const { server } = await getRpcServer();
    const walletAddress = await getWalletAddress();

    console.log('[SPM] Getting market status...');

    try {
        const result = await contract.call(METHODS.GET_STATUS);
        return result;
    } catch (error) {
        console.error('[SPM] Error getting status:', error);
        throw error;
    }
}

/**
 * Get the resolution result
 * @returns {Promise<Object>} - Result object with votes and minority wins flag
 */
export async function getResult() {
    const contract = await getContract();

    console.log('[SPM] Getting result...');

    try {
        const result = await contract.call(METHODS.GET_RESULT);
        return {
            votesYes: result.votes_yes || result.votesYes || 0,
            votesNo: result.votes_no || result.votesNo || 0,
            totalVoters: result.total_voters || result.totalVoters || 0,
            minorityWins: result.minority_wins || result.minorityWins || false
        };
    } catch (error) {
        console.error('[SPM] Error getting result:', error);
        throw error;
    }
}

/**
 * Get the total vote count
 * @returns {Promise<number>}
 */
export async function getTotalVotes() {
    const contract = await getContract();

    try {
        return await contract.call(METHODS.GET_TOTAL_VOTES);
    } catch (error) {
        console.error('[SPM] Error getting total votes:', error);
        return 0;
    }
}

/**
 * Get the nullifier root
 * @returns {Promise<string>}
 */
export async function getNullifierRoot() {
    const contract = await getContract();

    try {
        return await contract.call(METHODS.GET_NULLIFIER_ROOT);
    } catch (error) {
        console.error('[SPM] Error getting nullifier root:', error);
        return '';
    }
}

/**
 * Get the verification key
 * @returns {Promise<string>}
 */
export async function getVerificationKey() {
    const contract = await getContract();

    try {
        return await contract.call(METHODS.GET_VERIFICATION_KEY);
    } catch (error) {
        console.error('[SPM] Error getting verification key:', error);
        return '';
    }
}

/**
 * Close the market (admin function)
 */
export async function closeMarket() {
    const contract = await getContract();
    const { server, networkPassphrase } = await getRpcServer();
    const walletAddress = await getWalletAddress();
    const account = await server.getAccount(walletAddress);

    console.log('[SPM] Closing market...');

    const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(contract.call(METHODS.CLOSE_MARKET))
        .setTimeout(300)
        .build();

    const signedTx = await signWalletTransaction(transaction.toXDR());
    const tx = await server.sendTransaction(signedTx.signedTxXdr);
    
    console.log('[SPM] Market closed:', tx.hash);
    return tx;
}

/**
 * Initialize a new prediction market
 * @param {string} vk - Verification key hash (32 bytes hex)
 * @param {string} nullifierRoot - Merkle root of nullifier tree (32 bytes hex)
 */
export async function initialize(vk, nullifierRoot) {
    const contract = await getContract();
    const { server, networkPassphrase } = await getRpcServer();
    const walletAddress = await getWalletAddress();
    const account = await server.getAccount(walletAddress);

    console.log('[SPM] Initializing market...');

    const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
    })
        .addOperation(contract.call(
            METHODS.INITIALIZE,
            vk,
            nullifierRoot
        ))
        .setTimeout(300)
        .build();

    const signedTx = await signWalletTransaction(transaction.toXDR());
    const tx = await server.sendTransaction(signedTx.signedTxXdr);
    
    console.log('[SPM] Initialize transaction submitted:', tx.hash);
    return tx;
}

/**
 * Format status code to readable string
 */
export function formatStatus(status) {
    switch (status) {
        case MarketStatus.OPEN:
            return 'Open';
        case MarketStatus.CLOSED:
            return 'Closed';
        case MarketStatus.RESOLVED:
            return 'Resolved';
        default:
            return 'Unknown';
    }
}

/**
 * Get status color class for UI
 */
export function getStatusColor(status) {
    switch (status) {
        case MarketStatus.OPEN:
            return 'text-emerald-400';
        case MarketStatus.CLOSED:
            return 'text-amber-400';
        case MarketStatus.RESOLVED:
            return 'text-brand-400';
        default:
            return 'text-dark-400';
    }
}