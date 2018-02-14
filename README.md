[![Build Status](https://travis-ci.org/jamiehale/dao_partnership.svg?branch=master)](https://travis-ci.org/jamiehale/dao_partnership)
[![Coverage Status](https://coveralls.io/repos/github/jamiehale/dao_partnership/badge.svg?branch=master)](https://coveralls.io/github/jamiehale/dao_partnership?branch=master)

A DAO for a simple partnership, written in Solidity for deployment on Ethereum.

# Usage
The preferred deployment method is to prepare a transaction for submission using MyEtherWallet.

After [installation](#Installation):

First, decide on a single amount that all partners will contribute. It must be the same for all partners. Enter this amount (in ETH) as the `ether_amount` below, followed by the Ethereum addresses of each partner.

    $ node prepare.js ether_amount parter1_addr partner2_addr [partner3_addr ...]

This will create two files: `bytecode.txt` and `arguments.txt`.

Go to [MyEtherWallet's Contract page](https://www.myetherwallet.com/#contracts)
click Deploy Contract
Paste the contents of `bytecode.txt` into the Byte Code field
... access your wallet and deploy the contract.

Once the contract has been created, go to [Etherscan's Contract Verifier](https://etherscan.io/verifyContract2):
* Contract Address: the deployed address of your contract
* Contract Name: Partnership
* Compiler: the version returned when you ran `node prepare.js` above.
* Optimization: Yes
* Enter the Solidity Contract Code: Paste the contents of `contracts/Partnership.sol`
* Constructor Arguments ABI-encoded: Paste the contents of `arguments.txt`
* Solve the CAPTCHA
* Click **Verify and Publish**

Now each of the partners listed given to `prepare.js` above need to send the exact amount specified to the contract address, from each specific account (not from an exchange). Until this is done the contract will not accept ether from any other source.

After the contract is funded with the contribution from each partner anyone can send ether to the contract address. Additional partner contributions will be recorded as loans.

# Development
It uses the Truffle framework for testing, but does not use its deployment system.

## Installation

    $ npm install

## Building

    $ npm run test

## Continuous Integration

https://travis-ci.org/jamiehale/dao_partnership
