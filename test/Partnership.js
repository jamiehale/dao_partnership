'use strict';
require('babel-register');

var Partnership = artifacts.require('../contracts/Partnership.sol');
var Incomplete = artifacts.require('../contracts/Incomplete.sol');
var expectThrow = require('./helpers/expectThrow.js');

contract('Partnership', function(accounts) {
  let creator = accounts[0];
  let partner1 = accounts[1];
  let partner2 = accounts[2];
  let partner3 = accounts[3];
  let attacker1 = accounts[4];
  let attacker2 = accounts[5];
  let customer1 = accounts[6];
  let customer2 = accounts[7];
  let other1 = accounts[8];
  let partnership;
  let amount = new web3.BigNumber(web3.toWei(5, "ether"));
  let distrib = new web3.BigNumber(web3.toWei(2, "ether"));
  let loan = new web3.BigNumber(web3.toWei(0.103, "ether"));

  before(async function(){
	});

  // Test initial funding participation
  it('should only allow partners to participate in the initial funding', async function(){
    // create fund with three partners
    partnership = await Partnership.new([partner1, partner2, partner3], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    
    // This should fail because it is not funded yet. Only partners should
    // be able to send until funding is complete.
    try {
      await web3.eth.sendTransaction({from:attacker1, to:partnership.address, value: amount});
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }
    // why does the above work but this does not?
    // expectThrow(web3.eth.sendTransaction({from:attacker1, to:partnership.address, value: amount}));

    // A partner should not be able to make a *duplicate* contribution
    try {
      await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }

    // A partner should not be able to make an *excess* contribution
    try {
      await web3.eth.sendTransaction({from:partner3, to:partnership.address, value: amount*2});
    } catch (error) {
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }

    // partner 3 contributes to the fund, making it funded.
    await web3.eth.sendTransaction({from:partner3, to:partnership.address, value: amount});
    // since funding is now complete, the customer should be able to send ether
    await web3.eth.sendTransaction({from:customer1, to:partnership.address, value: amount});
  });

  it('should allow only partners to propose transactions', async function(){
    // create fund with two partners
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    // should not be able to propose a transaction until the partnership is funded
    await expectThrow(partnership.proposeTransaction(customer2, amount, 0, "refund", {from:partner1}));
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // create proposal to send ether
    var txn1 = await partnership.proposeTransaction(customer2, amount, 0, "refund", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // should not be executable until it is passed by all partners
    await expectThrow(partnership.executeTransaction(txnId1,{from:partner1}));
    // partner who did not create the proposal should not be able to cancel it
    await expectThrow(partnership.cancelTransaction(txnId1,{from:partner2}));
    // but should be able to confirm it
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // once the transaction is passed, it cannot be cancelled
    await expectThrow(partnership.cancelTransaction(txnId1,{from:partner1}));
    // the first partner should be able to execute 
    var execution = await partnership.executeTransaction(txnId1,{from:partner1});
    assert(execution.logs[0].event === 'TransactionSent');
    // but you can only execute it once
    await expectThtrow(partnership.executeTransaction(txnId1,{from:partner1}));

    // test cancellation of a valid proposal
    var txn2 = await partnership.proposeTransaction(customer2, amount, 0, "refund", {from:partner1});
    var txnId2 = txn2.logs[0].args._id;
    // partner who did not create the proposal should not be able to cancel it
    await expectThrow(partnership.cancelTransaction(txnId2,{from:partner2}));
    // randos should not be able to cancel a proposal
    await expectThrow(partnership.cancelTransaction(txnId2,{from:attacker1}));
    // transaction ID must be valid
    await expectThrow(partnership.cancelTransaction(0x0101,{from:partner1}));
    // initiator should be able to cancel a proposal
    var cancellation = await partnership.cancelTransaction(txnId2,{from:partner1});
    assert(cancellation.logs[0].event === 'TransactionCanceled');

    // an unknown party should not be able to propose a transaction
    await expectThrow(partnership.proposeTransaction(attacker1, amount, 0, "fraud",{from:attacker1}));
  });

  // This cannot be allowed because it means they can never be funded
  it('should not allow duplicate partner accounts', async function(){
    await expectThrow(Partnership.new([partner1, partner1], amount));
  });

  // no-value sends are ignored
  it('should not react to zero-amount sends', async function(){
    partnership = await Partnership.new([partner1, partner2], amount);
    // test when unfunded
    await web3.eth.sendTransaction({from:attacker1, to:partnership.address, value: 0});
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: 0});
    // fund the partnership...
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // test when funded
    await web3.eth.sendTransaction({from:attacker1, to:partnership.address, value: 0});
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: 0});
  });

  it('should allow only partners to make loans and withdraw them', async function(){
    // create fund with two partners
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // parter1 sends loan
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: loan});
    // nobody can withdraw 
    await expectThrow(partnership.withdraw(loan,{from:partner1}));
    await expectThrow(partnership.withdraw(loan,{from:partner2}));
    await expectThrow(partnership.withdraw(loan,{from:attacker1}));
    // partner2 creates proposal to pay back loan
    var callData = partnership.contract.repayLoan.getData(partner1, loan);
    var txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, "repay loan", {from:partner2});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // partner1 can't withdraw yet.
    await expectThrow(partnership.withdraw(loan,{from:partner1}));
    // partner1 approves payback proposal
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner1});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // you may only confirm once.
    await expectThrow(partnership.confirmTransaction(txnId1,{from:partner1}));
    // partner1 can't withdraw yet.
    await expectThrow(partnership.withdraw(loan,{from:partner1}));
    // partner2 executes transaction
    var execution = await partnership.executeTransaction(txnId1,{from:partner2});
    assert(execution.logs[0].event === 'TransactionSent');
    // partner1 makes a withdrawal of the loan
    var withdrawal = await partnership.withdraw(loan, {from:partner1});
    assert(withdrawal.logs[0].event === 'Withdrawal');
    // partner1 can't withdraw again.
    await expectThrow(partnership.withdraw(loan,{from:partner1}));
  });

  it('should allow distribution of ETH to any rando', async function(){
    // create fund with two partners
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // create proposal to distribute funds
    var callData = partnership.contract.distribute.getData(other1, distrib);
    var txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, "distribute to rando", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // approve distribution proposal
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction
    var execution = await partnership.executeTransaction(txnId1,{from:partner1});
    assert(execution.logs[0].event === 'TransactionSent');
    // recipient withdraws
    var otherBalance = web3.eth.getBalance(other1);
    var withdrawal = await partnership.withdraw(distrib, {from:other1});
    assert(withdrawal.logs[0].event === 'Withdrawal');
    // Make sure the numbers add up for the receiver (this is ridiculously tedious).
    var txn = web3.eth.getTransaction(withdrawal.receipt.transactionHash);
    var gasPrice = new web3.BigNumber(txn.gasPrice);
    var gasUsed = new web3.BigNumber(withdrawal.receipt.gasUsed);
    assert(otherBalance.plus(distrib).minus(gasUsed.times(gasPrice)).equals(web3.eth.getBalance(other1)));
    // can't be called directly
    await expectThrow(partnership.distribute(partner2, amount, {from:partner1}));
  });

  it('should test failed withdrawal', async function(){
    // fund the Incomplete contract so it has some gas
    var incomplete = await Incomplete.new();
    await web3.eth.sendTransaction({from:creator, to:incomplete.address, value: amount});
    // create fund with two partners
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // propose transaction for withdrawal by Incomplete
    var callData = partnership.contract.distribute.getData(incomplete.address, distrib);
    var txn1 = await partnership.proposeTransaction(partnership.address, amount, callData, "distribute to rando", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // approve distribution proposal
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction, releasing funds for Incomplete
    await partnership.executeTransaction(txnId1,{from:partner1});
    // Incomplete calls partnership.withdrawal
    var callData = partnership.contract.withdraw.getData(distrib);
    // This fails because Incomplete rejects the send of ether
    await expectThrow(incomplete.run(0, callData));
  });

  // 
  it('should distribute ETH evenly amongst all partners', async function(){
    // TODO: what about rounding
    // create fund
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // create proposal to distribute evenly
    var callData = partnership.contract.distributeEvenly.getData(amount * 2);
    var txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, "distribute evenly", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // approve distribution proposal
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction
    var execution = await partnership.executeTransaction(txnId1,{from:partner1});
    assert(execution.logs[0].event === 'TransactionSent');
    // randos can't make withdrawals
    await expectThrow(partnership.withdraw(amount, {from:attacker1}));
    // partners can't make excessive withdrawals
    await expectThrow(partnership.withdraw(amount * 2, {from:partner1}));
    // partners make withdrawals
    var withdrawal = await partnership.withdraw(amount, {from:partner1});
    assert(withdrawal.logs[0].event === 'Withdrawal');
    var withdrawal = await partnership.withdraw(amount, {from:partner2});
    assert(withdrawal.logs[0].event === 'Withdrawal');
    // partners can't withdrawal again
    await expectThrow(partnership.withdraw(amount, {from:partner1}));
    // can't be called directly
    await expectThrow(partnership.distributeEvenly(amount, {from:partner1}));
  });

  // dissolving a fund is not a good idea because it abandons tokens.
  it('should allow partners to dissolve a fund', async function(){
    // create fund
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    // create proposal to dissolve
    var callData = partnership.contract.dissolve.getData(customer1);
    var txn1 = await partnership.proposeTransaction(partnership.address, 0, callData, "dissolve", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // approve dissolution proposal
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    var customerBalance = web3.eth.getBalance(customer1);
    // partner1 executes transaction
    var execution = await partnership.executeTransaction(txnId1,{from:partner1});
    assert(execution.logs[0].event === 'TransactionSent');
    // recipient should have the eth ☺
    assert.equal(web3.eth.getBalance(customer1) - customerBalance, amount * 2);
    // but not the tokens ☹ 
  });

  // Test failure scenarios
  it('should handle failure to send in proposed transactions', async function(){
    // create fund
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});

    // create an *unfunded* dao which will not accept money sent from others
    var incomplete = await Partnership.new([partner2, partner3], amount);

    // create proposal to distribute funds
    var txn1 = await partnership.proposeTransaction(incomplete.address, 1, 101, "fail txn", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    // approve proposal
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    // partner1 executes transaction, which fails because incomplete won't accept the funds,
    // but doesn't throw any exceptions
    await partnership.executeTransaction(txnId1,{from:partner1});
    // TODO: a failed transaction can never be cancelled. It will haunt us forever.
    // the transaction can be canceled
    // var cancellation = await partnership.cancelTransaction(txnId1,{from:partner1});
    // assert(cancellation.logs[0].event === 'TransactionCanceled');
  });

});
/*
    var watcher = contract.Debug();
    watcher.watch((err, e) => {
      console.log('******* debug *******');
      console.log(err);
      console.log(e);
    });
*/
