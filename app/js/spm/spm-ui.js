/**
 * SPM UI Logic
 * Handles user interactions for the Social Prediction Market
 */

import * as contract from './spm-contract.js';
import * as prover from './spm-prover.js';
import { connectWallet, getWalletAddress, getWalletNetwork, startWalletWatcher } from '../wallet.js';

// DOM Elements
let elements = {};

/**
 * Initialize the SPM UI
 */
export async function initSPM() {
    console.log('[SPM UI] Initializing...');
    
    // Cache DOM elements
    elements = {
        // Connection
        walletBtn: document.getElementById('spm-wallet-btn'),
        walletText: document.getElementById('spm-wallet-text'),
        walletAddress: document.getElementById('spm-wallet-address'),
        networkName: document.getElementById('spm-network-name'),
        
        // Market Status
        marketStatus: document.getElementById('spm-market-status'),
        statusBadge: document.getElementById('spm-status-badge'),
        totalVotes: document.getElementById('spm-total-votes'),
        nullifierRoot: document.getElementById('spm-nullifier-root'),
        
        // Vote Section
        voteSection: document.getElementById('spm-vote-section'),
        voteYesBtn: document.getElementById('spm-vote-yes'),
        voteNoBtn: document.getElementById('spm-vote-no'),
        voteStatus: document.getElementById('spm-vote-status'),
        
        // Result Section
        resultSection: document.getElementById('spm-result-section'),
        resultVotesYes: document.getElementById('spm-result-yes'),
        resultVotesNo: document.getElementById('spm-result-no'),
        resultMinority: document.getElementById('spm-result-minority'),
        
        // Admin Section
        adminSection: document.getElementById('spm-admin-section'),
        resolveBtn: document.getElementById('spm-resolve-btn'),
        closeBtn: document.getElementById('spm-close-btn'),
        
        // Toast
        toast: document.getElementById('spm-toast'),
        toastMessage: document.getElementById('spm-toast-message')
    };

    // Bind event listeners
    bindEvents();
    
    // Check wallet connection
    await checkConnection();
    
    // Start watching for wallet changes
    startWalletWatcher({
        intervalMs: 3000,
        onChange: handleWalletChange
    });
    
    // Load market data
    await refreshMarketData();
}

/**
 * Bind event listeners
 */
function bindEvents() {
    // Wallet button
    elements.walletBtn?.addEventListener('click', handleWalletClick);
    
    // Vote buttons
    elements.voteYesBtn?.addEventListener('click', () => handleVote(1));
    elements.voteNoBtn?.addEventListener('click', () => handleVote(0));
    
    // Admin buttons
    elements.resolveBtn?.addEventListener('click', handleResolve);
    elements.closeBtn?.addEventListener('click', handleClose);
}

/**
 * Handle wallet button click
 */
async function handleWalletClick() {
    try {
        if (elements.walletAddress?.textContent) {
            // Already connected - could show disconnect option
            return;
        }
        
        setVoteStatus('Connecting wallet...', 'info');
        const address = await connectWallet();
        await checkConnection();
        showToast('Wallet connected!', 'success');
        
        // Reload market data
        await refreshMarketData();
    } catch (error) {
        console.error('[SPM UI] Wallet connection failed:', error);
        showToast(error.message || 'Failed to connect wallet', 'error');
    }
}

/**
 * Check and update wallet connection state
 */
async function checkConnection() {
    try {
        const network = await getWalletNetwork();
        if (elements.networkName) {
            elements.networkName.textContent = network.network;
        }
        
        const address = await getWalletAddress();
        if (address) {
            if (elements.walletText) elements.walletText.textContent = formatAddress(address);
            if (elements.walletAddress) elements.walletAddress.textContent = address;
            if (elements.walletBtn) {
                elements.walletBtn.classList.add('connected');
            }
            return true;
        }
    } catch (error) {
        console.log('[SPM UI] Wallet not connected');
    }
    
    if (elements.walletText) elements.walletText.textContent = 'Connect Freighter';
    if (elements.walletAddress) elements.walletAddress.textContent = '';
    if (elements.walletBtn) {
        elements.walletBtn.classList.remove('connected');
    }
    return false;
}

/**
 * Handle wallet changes
 */
function handleWalletChange(info) {
    console.log('[SPM UI] Wallet changed:', info);
    checkConnection();
    if (info.address) {
        refreshMarketData();
    }
}

/**
 * Handle vote submission
 */
async function handleVote(vote) {
    try {
        // Check connection
        const isConnected = await checkConnection();
        if (!isConnected) {
            showToast('Please connect your wallet first', 'error');
            return;
        }
        
        setVoteStatus('Generating proof...', 'info');
        
        // Get current nullifier root
        const nullifierRoot = await contract.getNullifierRoot();
        
        // Generate proof
        setVoteStatus('Generating ZK proof...', 'info');
        const voteData = await prover.generateVoteProof({
            vote,
            nullifierRoot
        });
        
        // Submit vote
        setVoteStatus('Submitting vote...', 'info');
        const address = await getWalletAddress();
        
        await contract.submitVote({
            voter: address,
            nullifier: voteData.nullifier,
            voteCommitment: voteData.voteCommitment,
            proofData: voteData.proofData
        });
        
        setVoteStatus('Vote submitted!', 'success');
        showToast('Vote submitted successfully!', 'success');
        
        // Refresh market data
        await refreshMarketData();
        
        // Reset status after delay
        setTimeout(() => {
            setVoteStatus('', '');
        }, 3000);
        
    } catch (error) {
        console.error('[SPM UI] Vote submission failed:', error);
        setVoteStatus('Vote failed', 'error');
        showToast(error.message || 'Failed to submit vote', 'error');
    }
}

/**
 * Handle market resolution
 */
async function handleResolve() {
    try {
        const isConnected = await checkConnection();
        if (!isConnected) {
            showToast('Please connect your wallet first', 'error');
            return;
        }
        
        showToast('Resolving market...', 'info');
        
        // Get current votes from UI or prompt
        const votesYes = parseInt(elements.resultVotesYes?.textContent || '0');
        const votesNo = parseInt(elements.resultVotesNo?.textContent || '0');
        const totalVoters = votesYes + votesNo;
        
        await contract.resolve(votesYes, votesNo, totalVoters, 30);
        
        showToast('Market resolved!', 'success');
        await refreshMarketData();
        
    } catch (error) {
        console.error('[SPM UI] Resolution failed:', error);
        showToast(error.message || 'Failed to resolve market', 'error');
    }
}

/**
 * Handle market close
 */
async function handleClose() {
    try {
        const isConnected = await checkConnection();
        if (!isConnected) {
            showToast('Please connect your wallet first', 'error');
            return;
        }
        
        showToast('Closing market...', 'info');
        await contract.closeMarket();
        
        showToast('Market closed!', 'success');
        await refreshMarketData();
        
    } catch (error) {
        console.error('[SPM UI] Close failed:', error);
        showToast(error.message || 'Failed to close market', 'error');
    }
}

/**
 * Refresh all market data
 */
async function refreshMarketData() {
    try {
        // Get status
        const status = await contract.getStatus();
        updateStatusDisplay(status);
        
        // Get total votes
        const votes = await contract.getTotalVotes();
        if (elements.totalVotes) {
            elements.totalVotes.textContent = votes;
        }
        
        // Get nullifier root
        const root = await contract.getNullifierRoot();
        if (elements.nullifierRoot) {
            elements.nullifierRoot.textContent = root ? formatAddress(root) : 'Not set';
        }
        
        // Get result if resolved
        if (status === contract.MarketStatus.RESOLVED) {
            try {
                const result = await contract.getResult();
                updateResultDisplay(result);
            } catch (e) {
                // Result might not be available yet
            }
        }
        
    } catch (error) {
        console.error('[SPM UI] Failed to refresh market data:', error);
    }
}

/**
 * Update status display
 */
function updateStatusDisplay(status) {
    const statusText = contract.formatStatus(status);
    
    if (elements.marketStatus) {
        elements.marketStatus.textContent = statusText;
    }
    
    if (elements.statusBadge) {
        elements.statusBadge.textContent = statusText;
        elements.statusBadge.className = 'px-3 py-1 rounded-full text-sm font-medium ' + contract.getStatusColor(status);
    }
    
    // Show/hide sections based on status
    if (status === contract.MarketStatus.OPEN) {
        elements.voteSection?.classList.remove('hidden');
        elements.adminSection?.classList.add('hidden');
        elements.resultSection?.classList.add('hidden');
    } else if (status === contract.MarketStatus.RESOLVED) {
        elements.voteSection?.classList.add('hidden');
        elements.adminSection?.classList.remove('hidden');
        elements.resultSection?.classList.remove('hidden');
    } else {
        elements.voteSection?.classList.add('hidden');
        elements.adminSection?.classList.remove('hidden');
        elements.resultSection?.classList.add('hidden');
    }
}

/**
 * Update result display
 */
function updateResultDisplay(result) {
    if (elements.resultVotesYes) {
        elements.resultVotesYes.textContent = result.votesYes || 0;
    }
    if (elements.resultVotesNo) {
        elements.resultVotesNo.textContent = result.votesNo || 0;
    }
    if (elements.resultMinority) {
        elements.resultMinority.textContent = result.minorityWins ? 'YES wins (minority)' : 'NO wins (majority)';
        elements.resultMinority.className = result.minorityWins 
            ? 'text-emerald-400 font-semibold' 
            : 'text-amber-400 font-semibold';
    }
}

/**
 * Set vote status message
 */
function setVoteStatus(message, type) {
    if (!elements.voteStatus) return;
    
    elements.voteStatus.textContent = message;
    
    // Set color based on type
    const colors = {
        info: 'text-blue-400',
        success: 'text-emerald-400',
        error: 'text-red-400'
    };
    
    elements.voteStatus.className = colors[type] || 'text-dark-400';
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    if (!elements.toast || !elements.toastMessage) return;
    
    elements.toastMessage.textContent = message;
    
    // Set type-based styling
    const bgColors = {
        info: 'bg-blue-500',
        success: 'bg-emerald-500',
        error: 'bg-red-500'
    };
    
    elements.toast.className = `fixed bottom-4 right-4 ${bgColors[type] || bgColors.info} text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-300`;
    elements.toast.classList.remove('hidden');
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 3000);
}

/**
 * Format address for display
 */
function formatAddress(address) {
    if (!address || address.length < 8) return address;
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSPM);
    } else {
        initSPM();
    }
}