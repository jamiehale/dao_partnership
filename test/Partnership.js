'use strict';
require('babel-register');

var Partnership = artifacts.require('../contracts/Partnership.sol');
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
  let partnership;
  let amount = new web3.BigNumber(web3.toWei(0.005, "ether"));
  let loan = new web3.BigNumber(web3.toWei(0.003, "ether"));

  before(async function(){
	});

  // 
  it('should only allow partners to participate in the initial funding', async function(){
    partnership = await Partnership.new([partner1, partner2, partner3], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    
    // This should fail because it is not funded yet. Only partners should
    // be able to send until funding is complete.
    try {
      await web3.eth.sendTransaction({from:attacker1, to:partnership.address, value: amount});
    } catch (error) {
      console.log(error.message);
      const revert = error.message.search('revert') >= 0;
      assert(revert);
    }
    // why does the above work but this does not?
    // expectThrow(web3.eth.sendTransaction({from:attacker1, to:partnership.address, value: amount}));

    await web3.eth.sendTransaction({from:partner3, to:partnership.address, value: amount});
    // since funding is now complete, the customer should be able to send funds
    await web3.eth.sendTransaction({from:customer1, to:partnership.address, value: amount});
  });

  it('should allow only partners to propose transactions', async function(){
    partnership = await Partnership.new([partner1, partner2], amount);
    await web3.eth.sendTransaction({from:partner1, to:partnership.address, value: amount});
    await web3.eth.sendTransaction({from:partner2, to:partnership.address, value: amount});
    var txn1 = await partnership.proposeTransaction(customer2, amount, 0, "refund", {from:partner1});
    assert(txn1.logs[0].event === 'TransactionProposed');
    var txnId1 = txn1.logs[0].args._id;
    await expectThrow(partnership.cancelTransaction(txnId1,{from:partner2}));
    var confirmation = await partnership.confirmTransaction(txnId1,{from:partner2});
    assert(confirmation.logs[0].event === 'TransactionPassed');
    var execution = await partnership.executeTransaction(txnId1,{from:partner1});
    assert(execution.logs[0].event === 'TransactionSent');

    var txn2 = await partnership.proposeTransaction(customer2, amount, 0, "refund", {from:partner1});
    var txnId2 = txn2.logs[0].args._id;
    await expectThrow(partnership.cancelTransaction(txnId2,{from:partner2}));
    await expectThrow(partnership.cancelTransaction(txnId2,{from:attacker1}));
    var cancellation = await partnership.cancelTransaction(txnId2,{from:partner1});
    assert(cancellation.logs[0].event === 'TransactionCanceled');

    // an unknown party should not be able to propose a transaction
    await expectThrow(partnership.proposeTransaction(attacker1, amount, 0, "fraud",{from:attacker1}));
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

  // dissolving a fund is not a good idea because it abandons tokens.
//  it('should allow partners to dissolve a fund', async function(){
    // create fund
    // create proposal to dissolve
    // approve dissolution proposal
    // recipient should have the eth
//  });

});
/*
    var watcher = contract.Debug();
    watcher.watch((err, e) => {
      console.log('******* debug *******');
      console.log(err);
      console.log(e);
    });
*/
