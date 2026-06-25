pragma circom 2.2.2;

// Commitment Circuit
// Provides a commitment hash for a vote and nonce

include "circomlib/circuits/poseidon.circom";

template Commitment() {
    signal input vote;
    signal input nonce;
    signal output commitment;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== vote;
    hasher.inputs[1] <== nonce;
    commitment <== hasher.out;
}
