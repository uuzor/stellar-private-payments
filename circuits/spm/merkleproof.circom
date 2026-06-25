pragma circom 2.2.2;

// Merkle Tree Proof Verification Circuit
// Verifies that a given leaf is part of a Merkle tree with the given root

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/switcher.circom";

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices;
    signal output root;

    component hashers[levels];
    component bits;
    component switchers[levels];
    
    signal computedHash[levels + 1];
    computedHash[0] <== leaf;

    // Convert pathIndices to bits
    bits = Num2Bits(levels);
    bits.in <== pathIndices;

    for (var i = 0; i < levels; i++) {
        // Use Switcher to conditionally swap based on bit
        switchers[i] = Switcher();
        switchers[i].sel <== bits.out[i];
        switchers[i].L <== computedHash[i];
        switchers[i].R <== pathElements[i];
        
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;
        
        computedHash[i + 1] <== hashers[i].out;
    }

    // Output the computed root
    root <== computedHash[levels];
}
