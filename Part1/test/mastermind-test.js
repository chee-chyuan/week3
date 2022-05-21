//[assignment] write your own unit test to show that your Mastermind variation circuit is working as expected
const { poseidonContract } = require("circomlibjs");
const buildPoseidon = require("circomlibjs").buildPoseidon;
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { groth16 } = require("snarkjs");

describe("Mastermind variation", () => {
  const secret = 1234;
  const numExactMatch = 2;
  const numNonExactMatch = 1;
  let poseidonJs;
  let mastermind;

  function buildSolidityProof(snarkProof, publicSignals) {
    return {
      a: snarkProof.pi_a.slice(0, 2),
      b: [
        snarkProof.pi_b[0].slice(0).reverse(),
        snarkProof.pi_b[1].slice(0).reverse(),
      ],
      c: snarkProof.pi_c.slice(0, 2),
      input: publicSignals,
    };
  }

  const calculateHint = (solution, guess) => {
    let numExactMatch = 0;
    let numNonExactMatch = 0;

    for (let i = 0; i < guess.length; i++) {
      if (solution[i] === guess[i]) {
        numExactMatch++;
        guess[i] = 0;
        solution[i] = 0;
      }
    }

    for (let i = 0; i < guess.length; i++) {
      for (let j = 0; j < solution.length; j++) {
        if (i !== j && guess[i] === solution[j] && guess[i] > 0) {
          numNonExactMatch++;
          guess[i] = 0;
          solution[j] = 0;
        }
      }
    }

    return {
      numExactMatch,
      numNonExactMatch,
    };
  };

  const setup = async () => {
    const verifierFactory = await ethers.getContractFactory("Verifier");
    const verifier = await verifierFactory.deploy();

    const mastermindFactory = await ethers.getContractFactory("Mastermind");
    mastermind = await mastermindFactory.deploy(verifier.address);
  };

  before(async () => {
    poseidonJs = await buildPoseidon();
  });

  describe("Proof incorrect", () => {
    it("Not able to generate proof when inputs are not correct", async () => {
      const solutions = [1, 1, 1, 1];
      const guesses = [1, 1, 1, 1];
      const numExactMatch = 0; // the correct answer should be 4
      const numNonExactMatch = 0;

      const solutionHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...solutions]))
      );

      const guessHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...guesses]))
      );

      const input = {
        guessHash: guessHash,
        solutionCommitment: solutionHash,
        guesses: [guesses],
        numExactMatch: numExactMatch,
        numNonExactMatch: numNonExactMatch,
        solutions: [solutions],
        secret: secret,
      };

      await expect(
        groth16.fullProve(
          input,
          "contracts/circuits/MastermindVariation_js/MastermindVariation.wasm",
          "contracts/circuits/circuit_final.zkey"
        )
      ).to.throw;
    });

    it("Tx fail if input has been tampered with", async () => {
      await setup();
      const solutions = [4, 1, 5, 2];
      const guesses = solutions;
      const hints = calculateHint(solutions.slice(), guesses.slice());
      const solutionHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...solutions]))
      );

      const guessHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...guesses]))
      );

      const startGameTx = await mastermind.startNewGame(solutionHash);
      await startGameTx.wait();

      expect(await mastermind.turns()).to.equal(0);
      expect(await mastermind.solutionHash()).to.equal(solutionHash);
      expect(await mastermind.isSolved()).to.not.true;

      // the guess is sent to the owner which will be responsible in generating the proof
      const input = {
        guessHash: guessHash,
        solutionCommitment: solutionHash,
        guesses: [guesses],
        numExactMatch: hints.numExactMatch,
        numNonExactMatch: hints.numNonExactMatch,
        solutions: [solutions],
        secret: secret,
      };

      const { proof, publicSignals } = await groth16.fullProve(
        input,
        "contracts/circuits/MastermindVariation_js/MastermindVariation.wasm",
        "contracts/circuits/circuit_final.zkey"
      );

      const formattedInput = buildSolidityProof(proof, publicSignals);

      // change numExactMatch
      formattedInput.input[7] = "3";

      await expect(
        mastermind.submitAnswer(
          formattedInput.a,
          formattedInput.b,
          formattedInput.c,
          formattedInput.input
        )
      ).to.revertedWith("Incorrect proof");
    });
  });

  describe("Solve Mastermind", () => {
    let formattedInput;
    before(setup);
    before(async () => {
      const solutions = [4, 1, 5, 2];
      const guesses = solutions;
      const hints = calculateHint(solutions.slice(), guesses.slice());
      const solutionHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...solutions]))
      );

      const guessHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...guesses]))
      );

      const startGameTx = await mastermind.startNewGame(solutionHash);
      await startGameTx.wait();

      expect(await mastermind.turns()).to.equal(0);
      expect(await mastermind.solutionHash()).to.equal(solutionHash);
      expect(await mastermind.isSolved()).to.not.true;

      // the guess is sent to the owner which will be responsible in generating the proof
      const input = {
        guessHash: guessHash,
        solutionCommitment: solutionHash,
        guesses: [guesses],
        numExactMatch: hints.numExactMatch,
        numNonExactMatch: hints.numNonExactMatch,
        solutions: [solutions],
        secret: secret,
      };

      const { proof, publicSignals } = await groth16.fullProve(
        input,
        "contracts/circuits/MastermindVariation_js/MastermindVariation.wasm",
        "contracts/circuits/circuit_final.zkey"
      );

      formattedInput = buildSolidityProof(proof, publicSignals);
    });

    it("Able to solve Mastermind", async () => {
      const submitAnswerTx = await mastermind.submitAnswer(
        formattedInput.a,
        formattedInput.b,
        formattedInput.c,
        formattedInput.input
      );
      await submitAnswerTx.wait();
      expect(await mastermind.turns()).to.equal(0);
      expect(await mastermind.isSolved()).to.true;
    });

    it("Not able to submit answer when mastermind is solved", async () => {
      await expect(
        mastermind.submitAnswer(
          formattedInput.a,
          formattedInput.b,
          formattedInput.c,
          formattedInput.input
        )
      ).to.revertedWith("This round has been solved. Please start a new game");
    });
  });

  describe("Max turns", () => {
    let formattedInput;
    before(setup);
    before(async () => {
      const solutions = [4, 1, 5, 2];
      const guesses = [4, 1, 5, 3];
      const hints = calculateHint(solutions.slice(), guesses.slice());
      const solutionHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...solutions]))
      );

      const guessHash = ethers.BigNumber.from(
        poseidonJs.F.toObject(poseidonJs([secret, ...guesses]))
      );

      const startGameTx = await mastermind.startNewGame(solutionHash);
      await startGameTx.wait();

      // the guess is sent to the owner which will be responsible in generating the proof
      const input = {
        guessHash: guessHash,
        solutionCommitment: solutionHash,
        guesses: [guesses],
        numExactMatch: hints.numExactMatch,
        numNonExactMatch: hints.numNonExactMatch,
        solutions: [solutions],
        secret: secret,
      };

      const { proof, publicSignals } = await groth16.fullProve(
        input,
        "contracts/circuits/MastermindVariation_js/MastermindVariation.wasm",
        "contracts/circuits/circuit_final.zkey"
      );

      formattedInput = buildSolidityProof(proof, publicSignals);
    });
    before(async () => {
      for (let i = 0; i < 8; i++) {
        const submitTx = await mastermind.submitAnswer(
          formattedInput.a,
          formattedInput.b,
          formattedInput.c,
          formattedInput.input
        );
        await submitTx.wait();
      }
    });

    it("Unable to try more than max turns", async () => {
      expect(await mastermind.turns()).to.equal(await mastermind.maxTurns());
      await expect(
        mastermind.submitAnswer(
          formattedInput.a,
          formattedInput.b,
          formattedInput.c,
          formattedInput.input
        )
      ).to.revertedWith("Max turn reached");
    });
  });
});
