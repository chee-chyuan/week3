// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

interface IVerifier {
    function verifyProof(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory input
    ) external view returns (bool r);
}

contract Mastermind {
    uint256 public constant maxTurns = 8;
    uint256 public solutionHash;
    IVerifier public immutable verifier;
    address public owner;
    uint256 public turns = 0;
    bool public isSolved = false;

    constructor(IVerifier _verifier) {
        verifier = _verifier;
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    modifier notSolved() {
        require(!isSolved, "This round has been solved. Please start a new game");
        _;
    }

    modifier hasTurns() {
        require(turns < maxTurns, "Max turn reached");
        _;
    }

    function startNewGame(uint256 _solutionHash) public onlyOwner {
        solutionHash = _solutionHash;
        turns = 0;
        isSolved = false;
    }

    /// called by the generator of the proof
    function submitAnswer(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory input
    ) external notSolved hasTurns {
        // verify proof here
        bool verifyResult = verify(a, b, c, input);
        require(verifyResult, "Incorrect proof");

        // set isSolved if solved (if the hint in the inputs shows all matches)
        if (input[1] == solutionHash) {
            isSolved = true;
            return;
        }

        // increment turn is not solved
        turns++;
    }

    // should be internal but leaving it as public for testing purposes
    function verify(
        uint256[2] memory a,
        uint256[2][2] memory b,
        uint256[2] memory c,
        uint256[9] memory input
    ) public view returns (bool) {
        return verifier.verifyProof(a, b, c, input);
    }
}
