/// Partnership
/// Requires all pre-defined partners agreement on transactions and operations.
pragma solidity ^0.4.4;
contract Partnership
{
	event Funded();
	event Deposit(address _from, uint _value);
	event TransactionProposed(bytes32 _id, address _initiator, string _description);
	event TransactionCanceled(bytes32 _id, address _actor);
	event TransactionPassed(bytes32 _id, address _finalSigner, string _description);
	event TransactionSent(bytes32 _transaction, address _executor, string _description);
	event Withdrawal(address _partner, uint _amount);

	/// Price in wei of each equal share of the partnership
	uint public sharePrice;

	/// Flag indicating whether or not all partners have paid for their share
	bool public funded;

	/// Array of partner addresses
	address [] public partners;

	/// Collection of partner records
	mapping(address => Partner) public partnerRecords;
	
	/// Count of partners
	uint public partnerCount;

	/// Count of partners who have paid for their share
	uint public paidPartnerCount;
	
	/// Collection of pending transactions (ie send X ETH to Y with Z data)
	mapping(bytes32 => Transaction) public transactions;

	/// Count of transactions awaiting confirmation, execution, or cancelation
	uint public activeTransactionCount;

	/// Available withdrawals
	mapping(address => uint) public withdrawableAmounts;

	struct Partner {
		/// Flag indicating that this record has been initialized
		bool isPartner;
		/// Flag indicating that the partner has paid for their share
		bool paid;
		/// Total amount loaned to the partnership by the partner
		uint loanBalance;
	}

	struct Transaction {
		/// Flag indicating that this record has been initialized
		bool valid;
		/// Proposed recipient for the transaction (0 indicates a new contract will be created)
		address to;
		/// Proposed amount to send (0 indicates no wei)
		uint value;
		/// Optional array of data to send with the transaction
		bytes data;
		/// Optional description of proposed transaction
		string description;
		/// Account that created the transaction
		address creator;
		/// Total number of partners that have confirmed/voted
		uint voteCount;
		/// Collection of partners that have confirmed/voted
		mapping(address => uint) votes;
		/// Flag indicating that all partners have confirmed
		bool passed;
		/// Flag indicatint that the transaction has been sent
		bool sent;
	}
	
	modifier onlyWhenFunded {
		if (!funded)
	       		throw;
		_;
	}

	modifier onlyByPartner {
		if (!isPartner(msg.sender))
			throw;
		_;
	}

	modifier onlyByDao {
		if (msg.sender != address(this))
			throw;
		_;
	}

	modifier onlyValidTransaction(bytes32 _id) {
		if (!transactions[_id].valid)
			throw;
		_;
	}

	modifier onlyPassedTransaction(bytes32 _id) {
		if (!transactions[_id].passed)
			throw;
		_;
	}

	modifier onlyUnpassedTransaction(bytes32 _id) {
		if (transactions[_id].passed)
			throw;
		_;
	}

	modifier onlyTransactionCreator(bytes32 _id) {
		if (transactions[_id].creator != msg.sender)
			throw;
		_;
	}

	modifier onlyUnconfirmedBySender(bytes32 _id) {
		if (transactions[_id].votes[msg.sender] == 1)
			throw;
		_;
	}

	modifier onlyUnsentTransaction(bytes32 _id) {
		if (transactions[_id].sent)
			throw;
		_;
	}

	modifier mustBePartner(address _recipient) {
		if (!isPartner(_recipient))
			throw;
		_;
	}

	modifier noMoreThanLoan(address _recipient, uint _amount) {
		if (_amount > partnerRecords[_recipient].loanBalance)
			throw;
		_;
	}

	modifier cannotExceedWithdrawableAmount(uint _amount) {
		if (_amount > withdrawableAmounts[msg.sender])
			throw;
		_;
	}

	modifier cannotExceedContractBalance(uint _amount) {
		if (_amount > this.balance)
			throw;
		_;
	}

	modifier onlyValidBeneficiary(address _beneficiary) {
		// ignore unset beneficiary
		if (_beneficiary == 0)
			throw;

		// prevent lost balance
		if (_beneficiary == address(this))
		    throw;
		_;
	}

	function Partnership(address[] _partners, uint _sharePrice) {
		funded = false;
		partners = _partners;
		sharePrice = _sharePrice;
		for (uint i = 0; i < _partners.length; i++) {
			partnerRecords[_partners[i]].isPartner = true;
		}
		partnerCount = _partners.length;
		paidPartnerCount = 0;
	}

	/// This executes when funds are sent to the contract
	function() payable {
		if (msg.value > 0) {
			if (funded) {
				if (isPartner(msg.sender)) {
					partnerRecords[msg.sender].loanBalance += msg.value;
				}
			}
			else {
				if (isPartner(msg.sender)) {
					if (partnerRecords[msg.sender].paid) {
						throw;
					}
					else {
						if (msg.value == sharePrice) {
							partnerRecords[msg.sender].paid = true;
							paidPartnerCount = paidPartnerCount + 1;
							if (paidPartnerCount == partnerCount) {
								funded = true;
								Funded();
							}
						}
						else {
							throw;
						}
					}
				}
				else {
					throw;
				}
			}
			Deposit(msg.sender, msg.value);
		}
	}
	
	/// Adds a proposed transaction to be confirmed by other partners
	function proposeTransaction(address _to, uint _value, bytes _data, string _description) onlyWhenFunded onlyByPartner external returns (bytes32) {

		// generate hash for easy specification in confirm and execute
		bytes32 id = sha3(msg.data, block.number);
		
		// grab the presumably blank transaction
		var transaction = transactions[id];

		transaction.valid = true;
		transaction.to = _to;
		transaction.value = _value;
		transaction.data = _data;
		transaction.description = _description;
		transaction.creator = msg.sender;
		transaction.voteCount = 1;
		transaction.votes[msg.sender] = 1;
		transaction.passed = false;
		transaction.sent = false;

		activeTransactionCount += 1;
		
		TransactionProposed(id, msg.sender, _description);
		
		return id;
	}

	/// Cancels a transaction that has not yet passed
	function cancelTransaction(bytes32 _id) onlyWhenFunded onlyByPartner onlyValidTransaction(_id) onlyUnpassedTransaction(_id) onlyTransactionCreator(_id) external {

		delete transactions[_id];

		activeTransactionCount -= 1;

		TransactionCanceled(_id, msg.sender);
	}

	
	/// Confirms an existing proposed transaction
	function confirmTransaction(bytes32 _id) onlyWhenFunded onlyByPartner onlyValidTransaction(_id) onlyUnconfirmedBySender(_id) external {

		var transaction = transactions[_id];
	
		// register the vote	
		transaction.voteCount += 1;
		transaction.votes[msg.sender] = 1;
		
		if (transaction.voteCount == partnerCount) {
			transaction.passed = true;
			TransactionPassed(_id, msg.sender, transaction.description);
		}
	}

	/// Executes a passed transaction
	function executeTransaction(bytes32 _id) onlyWhenFunded onlyByPartner onlyPassedTransaction(_id) onlyUnsentTransaction(_id) external {

		var transaction = transactions[_id];

		// register the sent transaction
		transaction.sent = true;

		activeTransactionCount -= 1;

		// send the transaction
		if (transaction.to.call.value(transaction.value)(transaction.data)) {

			TransactionSent(_id, msg.sender, transaction.description);

			// clear the transaction structure to free memory
			delete transactions[_id];
		}
		else {
			// roll back if the call failed
			transaction.sent = false;

			activeTransactionCount += 1;
		}
	}

	/// Distribute ETH to a partner or external recipient
	function distribute(address _recipient, uint _amount) onlyByDao external {

		withdrawableAmounts[_recipient] += _amount;
	}

	/// Distribute ETH evenly amongst all partners
	function distributeEvenly(uint _amount) onlyByDao external {

		uint payout = _amount / partnerCount;

		for (uint i = 0; i < partnerCount; i++) {
			withdrawableAmounts[partners[i]] += payout;
		}
	}

	/// Mark down partner's loan and make it available for withdrawal
	function repayLoan(address _recipient, uint _amount) onlyByDao mustBePartner(_recipient) noMoreThanLoan(_recipient, _amount) external {

		partnerRecords[_recipient].loanBalance -= _amount;
		withdrawableAmounts[_recipient] += _amount;
	}

	/// Allow partner or external recipient to withdraw funds marked as withdrawable
	function withdraw(uint _amount) onlyWhenFunded cannotExceedWithdrawableAmount(_amount) cannotExceedContractBalance(_amount) external {

		// mark the withdrawal as successful
		withdrawableAmounts[msg.sender] -= _amount;

		// send the wei
		if (msg.sender.send(_amount)) {
			Withdrawal(msg.sender, _amount);
		}
		else {
			// roll back if the send failed
			withdrawableAmounts[msg.sender] += _amount;
		}
	}
	
	/// Dissolve DAO and send the remaining ETH to a beneficiary
	function dissolve(address _beneficiary) onlyByDao onlyValidBeneficiary(_beneficiary) external {

		suicide(_beneficiary);
	}
	
	function isPartner(address _address) internal returns (bool) {
		return partnerRecords[_address].isPartner;
	}
	
}

