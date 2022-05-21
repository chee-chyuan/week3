pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/gates.circom";

// modified circuit to make it dynamic.
// owner is able to create a variable number of holes and types
// an improvement to hitandblow as this circuit allows a duplicate types
template Mastermind(holes, types, bitLength) {
    signal input guessHash;
    signal input solutionCommitment;
    signal input guesses[holes];
    signal input numExactMatch;
    signal input numNonExactMatch;

    signal input solutions[holes];
    signal input secret;

    signal output out;

    component typeLessThan[holes];
    component typeGreaterOrEqual[holes];

    var guessArray[holes];
    var solutionArray[holes];

    for (var i = 0; i < holes; i++) {
        guessArray[i] = guesses[i];
        solutionArray[i] = solutions[i];
    }

    for(var i = 0; i < holes; i ++) {
        typeLessThan[i] = LessThan(bitLength);
        typeGreaterOrEqual[i] = GreaterEqThan(bitLength);

        typeGreaterOrEqual[i].in[0] <== guessArray[i];
        typeGreaterOrEqual[i].in[1] <== 1;
        typeGreaterOrEqual[i].out === 1;

        typeLessThan[i].in[0] <== guessArray[i];
        typeLessThan[i].in[1] <== types;
        typeLessThan[i].out === 1;
    }

    component poseidonHash = Poseidon(holes + 1);
    poseidonHash.inputs[0] <== secret;
    for(var i = 0; i<holes; i++) {
        poseidonHash.inputs[i + 1] <== solutions[i];
    }

    component equal = IsEqual();
    equal.in[0] <== poseidonHash.out;
    equal.in[1] <== solutionCommitment;

    equal.out ==> out;
    out === 1;

    component poseidonGuessHash = Poseidon(holes + 1);
    poseidonGuessHash.inputs[0] <== secret;
    for(var i = 0; i<holes; i++) {
        poseidonGuessHash.inputs[i + 1] <== guesses[i];
    }
    component equalGuessHash = IsEqual();
    equalGuessHash.in[0] <== poseidonGuessHash.out;
    equalGuessHash.in[1] <== guessHash;
    equalGuessHash.out === 1;

    var exactMatch = 0;
    var nonExactMatch = 0;

    component equalsExact[holes];
    component notsExact[holes];
    signal guessIntermediate[holes + 1][holes];
    signal solutionIntermediate[holes + 1][holes];

    for(var i = 0; i < holes; i++) {
        equalsExact[i] = IsEqual();
        equalsExact[i].in[0] <== guessArray[i];
        equalsExact[i].in[1] <== solutionArray[i];
        exactMatch += equalsExact[i].out;

        notsExact[i] = NOT();
        notsExact[i].in <== equalsExact[i].out;

        guessIntermediate[0][i] <== notsExact[i].out * guessArray[i] + equalsExact[i].out * 0; // the second part after + can be deleted
        solutionIntermediate[0][i] <== notsExact[i].out * solutionArray[i] + equalsExact[i].out * 0;
    }

    component equalsCounter[holes ** holes];
    component notsCounter[holes ** holes];
    component equalsNonExact[holes ** holes];
    component ands1[holes ** holes];
    component ands2[holes ** holes];
    component nots[holes ** holes];
    component greaterThans[holes ** holes];
    for(var i = 0; i < holes; i++) {
        for(var j = 0; j < holes; j++) {

            // if(i != j)
            equalsCounter[holes * i + j] = IsEqual();
            equalsCounter[holes * i + j].in[0] <== i;
            equalsCounter[holes * i + j].in[1] <== j;

            notsCounter[holes * i + j] = NOT();
            notsCounter[holes * i + j].in <== equalsCounter[holes * i + j].out;

            //if (guess[i] == soln[j])
            equalsNonExact[holes * i + j] = IsEqual();
            equalsNonExact[holes * i + j].in[0] <== guessIntermediate[0][i];
            equalsNonExact[holes * i + j].in[1] <== solutionIntermediate[i][j];

            // if (guess[i] > 0)
            greaterThans[holes * i + j] = GreaterThan(bitLength);
            greaterThans[holes * i + j].in[0] <== guessIntermediate[0][i];
            greaterThans[holes * i + j].in[1] <== 0;

            // combine conditions
            // (i != j) && (guess[i] == soln[j]) && (guess[i] > 0)
            ands1[holes * i + j] = AND();
            ands1[holes * i + j].a <== equalsNonExact[holes * i + j].out;
            ands1[holes * i + j].b <== greaterThans[holes * i + j].out;

            ands2[holes * i + j] = AND();
            ands2[holes * i + j].a <== ands1[holes * i + j].out;
            ands2[holes * i + j].b <== notsCounter[holes * i + j].out;

            // increment if statement is true
            nonExactMatch += ands2[holes * i + j].out;

            // negate to 0 as the true statement will result in 0
            nots[holes * i + j] = NOT();
            nots[holes * i + j].in <== ands2[holes * i + j].out;

            // guessIntermediate[i + 1][j] <== nots[holes * i + j].out * guessIntermediate[i][j];
            solutionIntermediate[i + 1][j] <== nots[holes * i + j].out * solutionIntermediate[i][j];
        }
    }

    component equalExact = IsEqual();
    equalExact.in[0] <== numExactMatch;
    equalExact.in[1] <== exactMatch;
    equalExact.out === 1;
    
    component equalNonExact = IsEqual();
    equalNonExact.in[0] <== numNonExactMatch;
    equalNonExact.in[1] <== nonExactMatch;
    equalNonExact.out === 1;
}
component main{public [guessHash, solutionCommitment, guesses, numExactMatch, numNonExactMatch]} = Mastermind(4, 6, 3);
