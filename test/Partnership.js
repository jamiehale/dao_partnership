/* eslint-env node, mocha */

require('babel-register');

const Partnership = artifacts.require('../contracts/Partnership.sol');
const Incomplete = artifacts.require('../contracts/Incomplete.sol');
const expectThrow = require('./helpers/expectThrow.js');

contract('Partnership', (accounts) => {
  const creator = accounts[0];
  const partner1 = accounts[1];
  const partner2 = accounts[2];
  const partner3 = accounts[3];
  const attacker1 = accounts[4];
  // const attacker2 = accounts[5];
  const customer1 = accounts[6];
  const customer2 = accounts[7];
  const other1 = accounts[8];
  const amount = new web3.BigNumber(web3.toWei(5, 'ether'));
  const distrib = new web3.BigNumber(web3.toWei(2, 'ether'));
  const loan = new web3.BigNumber(web3.toWei(0.103, 'ether'));

  it('should only allow partners to participate in the initial funding', async () => {
    // create fund with three partners
    const partnership = await Partnership.new([partner1, partner2, partner3], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });

    // This should fail because it is not funded yet. Only partners should
    // be able to send until funding is complete.
    try {
      await web3.eth.sendTransaction({ from: attacker1, to: partnership.address, value: amount });
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }
    // why does the above work but this does not?
    // expectThrow(web3.eth.sendTransaction({ from: attacker1, to: partnership.address, value: amount }));

    // A partner should not be able to make a *duplicate* contribution
    try {
      await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }

    // A partner should not be able to make an *excess* contribution
    try {
      await web3.eth.sendTransaction({ from: partner3, to: partnership.address, value: amount.times(2) });
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }

    // partner 3 contributes to the fund, making it funded.
    await web3.eth.sendTransaction({ from: partner3, to: partnership.address, value: amount });

    // since funding is now complete, the customer should be able to send ether
    await web3.eth.sendTransaction({ from: customer1, to: partnership.address, value: amount });

    // partner 3 sends a loan
    await web3.eth.sendTransaction({ from: partner3, to: partnership.address, value: amount.times(3) });

    // Test the conditional transition from "Proposed" to "Passed"
    const txn1 = await partnership.proposeTransaction(customer2, amount.times(5), 0, 'refund', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // state doesn't change here
    await partnership.confirmTransaction(txnId1, { from: partner2 });
    // state changes here
    const conf1 = await partnership.confirmTransaction(txnId1, { from: partner3 });
    assert(conf1.logs[0].event === 'TransactionPassed');

    // Test a race between two competing, confirmed transactions
    // which each want a total of 8/7 of the balance, to test the balance restriction.
    // First, a partner sends a loan
    const callData = partnership.contract.repayLoan.getData(partner3, amount.times(3));
    const txn2 = await partnership.proposeTransaction(partnership.address, 0, callData, 'repay loan', { from: partner2 });
    const txnId2 = txn2.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    await partnership.confirmTransaction(txnId2, { from: partner1 });
    await partnership.confirmTransaction(txnId2, { from: partner3 });
    await partnership.executeTransaction(txnId2, { from: partner2 });
    // now that the second transaction is confirmed, and the partner is allowed
    // to withdraw their loan, send the first transaction
    const execution = await partnership.executeTransaction(txnId1, { from: partner2 });
    assert(execution.logs[0].event === 'TransactionSent');
    // the first transaction should pass because balance is still sufficient
    // although the withdrawal is approved, there is insufficient balance to withdraw.
    await expectThrow(partnership.withdraw(amount.times(3), { from: partner3 }));
  });

  it('should allow only partners to propose transactions', async () => {
    // create fund with two partners
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    // should not be able to propose a transaction until the partnership is funded
    await expectThrow(partnership.proposeTransaction(customer2, amount, 0, 'refund', { from: partner1 }));
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // create proposal to send ether
    const txn1 = await partnership.proposeTransaction(customer2, amount, 0, 'refund', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // should not be executable until it is passed by all partners
    await expectThrow(partnership.executeTransaction(txnId1, { from: partner1 }));
    // partner who did not create the proposal should not be able to cancel it
    await expectThrow(partnership.cancelTransaction(txnId1, { from: partner2 }));
    // but should be able to confirm it
    const confirmation = await partnership.confirmTransaction(txnId1, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // once the transaction is passed, it cannot be cancelled
    await expectThrow(partnership.cancelTransaction(txnId1, { from: partner1 }));
    // the first partner should be able to execute
    const execution = await partnership.executeTransaction(txnId1, { from: partner1 });
    assert(execution.logs[0].event === 'TransactionSent');
    // but you can only execute it once
    await expectThrow(partnership.executeTransaction(txnId1, { from: partner1 }));

    // test cancellation of a valid proposal
    const txn2 = await partnership.proposeTransaction(customer2, amount, 0, 'refund', { from: partner1 });
    const txnId2 = txn2.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // partner who did not create the proposal should not be able to cancel it
    await expectThrow(partnership.cancelTransaction(txnId2, { from: partner2 }));
    // randos should not be able to cancel a proposal
    await expectThrow(partnership.cancelTransaction(txnId2, { from: attacker1 }));
    // transaction ID must be valid
    await expectThrow(partnership.cancelTransaction(0x0101, { from: partner1 }));
    // initiator should be able to cancel a proposal
    const cancellation = await partnership.cancelTransaction(txnId2, { from: partner1 });
    assert(cancellation.logs[0].event === 'TransactionCanceled');

    // an unknown party should not be able to propose a transaction
    await expectThrow(partnership.proposeTransaction(attacker1, amount, 0, 'fraud', { from: attacker1 }));
  });

  // This cannot be allowed because it means they can never be funded
  it('should not allow duplicate partner accounts', async () => {
    await expectThrow(Partnership.new([partner1, partner1], amount));
  });

  // no-value sends are ignored
  it('should not react to zero-amount sends', async () => {
    const partnership = await Partnership.new([partner1, partner2], amount);
    // test when unfunded
    await web3.eth.sendTransaction({ from: attacker1, to: partnership.address, value: 0 });
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: 0 });
    // fund the partnership...
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // test when funded
    await web3.eth.sendTransaction({ from: attacker1, to: partnership.address, value: 0 });
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: 0 });
  });

  it('should allow only partners to make loans and withdraw them', async () => {
    // create fund with two partners
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // parter1 and partner2 each send a loan
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: loan });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: loan });
    // nobody can withdraw
    await expectThrow(partnership.withdraw(loan, { from: partner1 }));
    await expectThrow(partnership.withdraw(loan, { from: partner2 }));
    await expectThrow(partnership.withdraw(loan, { from: attacker1 }));
    // You can't call repayLoan directly
    expectThrow(partnership.repayLoan(partner1, loan, { from: partner2 }));
    // partner2 creates proposals to pay back loan
    let callData = partnership.contract.repayLoan.getData(partner1, loan);
    const txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, 'repay loan', { from: partner2 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    // repays loan... to attacker! oops!
    callData = partnership.contract.repayLoan.getData(attacker1, loan);
    const txn2 = await partnership.proposeTransaction(partnership.address, 0, callData, 'repay loan - to attacker', { from: partner1 });
    assert(txn2.logs[0].event === 'TransactionProposed');
    // attempts to repay DOUBLE the loan
    callData = partnership.contract.repayLoan.getData(partner2, loan.times(2));
    const txn3 = await partnership.proposeTransaction(partnership.address, 0, callData, 'repay double the loan', { from: partner1 });
    assert(txn3.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    const txnId2 = txn2.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    const txnId3 = txn3.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // neither partner can withdraw, transactions not executed.
    await expectThrow(partnership.withdraw(loan, { from: partner1 }));
    await expectThrow(partnership.withdraw(loan, { from: partner2 }));
    // partner approves payback proposal
    let confirmation = await partnership.confirmTransaction(txnId1, { from: partner1 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    confirmation = await partnership.confirmTransaction(txnId2, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    confirmation = await partnership.confirmTransaction(txnId3, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // you may only confirm once.
    await expectThrow(partnership.confirmTransaction(txnId1, { from: partner1 }));
    // neither partner can withdraw, transactions not executed.
    await expectThrow(partnership.withdraw(loan, { from: partner1 }));
    await expectThrow(partnership.withdraw(loan, { from: partner2 }));
    // attacker can't withdraw
    await expectThrow(partnership.withdraw(loan, { from: attacker1 }));
    // partner2 executes transaction
    let execution = await partnership.executeTransaction(txnId1, { from: partner2 });
    assert(execution.logs[0].event === 'TransactionSent');
    // cannot execute the same transaction again
    await expectThrow(partnership.executeTransaction(txnId1, { from: partner1 }));
    // partner1 executes transactions, which fail to emit any events
    execution = await partnership.executeTransaction(txnId2, { from: partner1 });
    assert(!execution.logs[0]);
    execution = await partnership.executeTransaction(txnId3, { from: partner1 });
    assert(!execution.logs[0]);
    // partner1 makes a withdrawal of the loan
    const withdrawal = await partnership.withdraw(loan, { from: partner1 });
    assert(withdrawal.logs[0].event === 'Withdrawal');
    // partner1 can't withdraw again.
    await expectThrow(partnership.withdraw(loan, { from: partner1 }));
    // partner2 can't withdraw
    await expectThrow(partnership.withdraw(loan, { from: partner2 }));
    // attacker can't withdraw
    await expectThrow(partnership.withdraw(loan, { from: attacker1 }));
  });

  it('should allow distribution of ETH to any rando', async () => {
    // create fund with two partners
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // create proposal to distribute funds
    const callData = partnership.contract.distribute.getData(other1, distrib);
    const txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, 'distribute to rando', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // approve distribution proposal
    const confirmation = await partnership.confirmTransaction(txnId1, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction
    const execution = await partnership.executeTransaction(txnId1, { from: partner1 });
    assert(execution.logs[0].event === 'TransactionSent');
    // recipient withdraws
    const otherBalance = web3.eth.getBalance(other1);
    const withdrawal = await partnership.withdraw(distrib, { from: other1 });
    assert(withdrawal.logs[0].event === 'Withdrawal');
    // Make sure the numbers add up for the receiver (this is ridiculously tedious).
    const txn = web3.eth.getTransaction(withdrawal.receipt.transactionHash);
    const gasPrice = new web3.BigNumber(txn.gasPrice);
    const gasUsed = new web3.BigNumber(withdrawal.receipt.gasUsed);
    assert(otherBalance.plus(distrib).minus(gasUsed.times(gasPrice)).equals(web3.eth.getBalance(other1)));
    // can't be called directly
    await expectThrow(partnership.distribute(partner2, amount, { from: partner1 }));
  });

  it('should test failed withdrawal', async () => {
    // fund the Incomplete contract so it has some gas
    const incomplete = await Incomplete.new();
    await web3.eth.sendTransaction({ from: creator, to: incomplete.address, value: amount });
    // create fund with two partners
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // propose transaction for withdrawal by Incomplete
    let callData = partnership.contract.distribute.getData(incomplete.address, distrib);
    const txn1 = await partnership.proposeTransaction(partnership.address, amount, callData, 'distribute to rando', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // approve distribution proposal
    const confirmation = await partnership.confirmTransaction(txnId1, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction, releasing funds for Incomplete
    await partnership.executeTransaction(txnId1, { from: partner1 });
    // Incomplete calls partnership.withdrawal
    callData = partnership.contract.withdraw.getData(distrib);
    // This fails because Incomplete rejects the send of ether
    await expectThrow(incomplete.run(0, callData));
  });

  it('should distribute ETH evenly amongst all partners', async () => {
    // TODO: what about rounding
    // create fund
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // create proposal to distribute evenly
    const callData = partnership.contract.distributeEvenly.getData(amount.times(2));
    const txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, 'distribute evenly', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // approve distribution proposal
    const confirmation = await partnership.confirmTransaction(txnId1, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction
    const execution = await partnership.executeTransaction(txnId1, { from: partner1 });
    assert(execution.logs[0].event === 'TransactionSent');
    // randos can't make withdrawals
    await expectThrow(partnership.withdraw(amount, { from: attacker1 }));
    // partners can't make excessive withdrawals
    await expectThrow(partnership.withdraw(amount.times(2), { from: partner1 }));
    // partners make withdrawals
    let withdrawal = await partnership.withdraw(amount, { from: partner1 });
    assert(withdrawal.logs[0].event === 'Withdrawal');
    withdrawal = await partnership.withdraw(amount, { from: partner2 });
    assert(withdrawal.logs[0].event === 'Withdrawal');
    // partners can't withdrawal again
    await expectThrow(partnership.withdraw(amount, { from: partner1 }));
    // can't be called directly
    await expectThrow(partnership.distributeEvenly(amount, { from: partner1 }));
  });

  // dissolving a fund is not a good idea because it abandons tokens.
  it('should allow partners to dissolve a fund', async () => {
    // create fund
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });
    // create proposals to dissolve: one right, two wrong
    let callData = partnership.contract.dissolve.getData(customer1);
    const txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, 'dissolve', { from: partner1 });
    // test onlyValidBeneficiary branches
    callData = partnership.contract.dissolve.getData(partnership.address);
    const txn2 = await partnership.proposeTransaction(partnership.address, 0, callData, 'dissolve', { from: partner1 });
    callData = partnership.contract.dissolve.getData(0);
    const txn3 = await partnership.proposeTransaction(partnership.address, 0, callData, 'dissolve', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    assert(txn2.logs[0].event === 'TransactionProposed');
    assert(txn3.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    const txnId2 = txn2.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    const txnId3 = txn3.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // approve dissolution proposals
    let confirmation = await partnership.confirmTransaction(txnId1, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    confirmation = await partnership.confirmTransaction(txnId2, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    confirmation = await partnership.confirmTransaction(txnId3, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    const customerBalance = web3.eth.getBalance(customer1);
    // Failed transactions produce no log entries
    let execution = await partnership.executeTransaction(txnId2, { from: partner1 });
    assert(!execution.logs[0]);
    execution = await partnership.executeTransaction(txnId3, { from: partner1 });
    assert(!execution.logs[0]);
    // partner1 executes transaction and murders the contract
    execution = await partnership.executeTransaction(txnId1, { from: partner1 });
    assert(execution.logs[0].event === 'TransactionSent');
    // recipient should have the eth ☺
    assert.equal(web3.eth.getBalance(customer1) - customerBalance, amount.times(2));
    // but not the tokens ☹
  });

  // Test failure scenarios
  it('should handle failure to send in proposed transactions', async () => {
    // create fund
    const partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({ from: partner1, to: partnership.address, value: amount });
    await web3.eth.sendTransaction({ from: partner2, to: partnership.address, value: amount });

    // create an *unfunded* dao which will not accept money sent from others
    const incomplete = await Partnership.new([partner2, partner3], amount);

    // create proposal to distribute funds
    const txn1 = await partnership.proposeTransaction(incomplete.address, 1, 101, 'fail txn', { from: partner1 });
    assert(txn1.logs[0].event === 'TransactionProposed');
    const txnId1 = txn1.logs[0].args._id; // eslint-disable-line no-underscore-dangle
    // approve proposal
    const confirmation = await partnership.confirmTransaction(txnId1, { from: partner2 });
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction, which fails because incomplete won't accept the funds,
    // but doesn't throw any exceptions
    await partnership.executeTransaction(txnId1, { from: partner1 });
    // TODO: a failed transaction can never be cancelled. It will haunt us forever.
    // the transaction can be canceled
    // const cancellation = await partnership.cancelTransaction(txnId1, { from: partner1 });
    // assert(cancellation.logs[0].event === 'TransactionCanceled');
  });
});
/*
    const watcher = contract.Debug();
    watcher.watch((err, e) => {
      console.log('******* debug *******');
      console.log(err);
      console.log(e);
    });
*/
