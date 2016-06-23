/// Partnership
/// Requires all pre-defined partners agreement on transactions and operations.
contract Partnership
{
	event Funded();
	event Deposit(address _from, uint _value);
	event ConfirmationRequired(bytes32 _operation, address _initiator, address _to, uint _value, bytes _data);
	event TransactionSent(bytes32 _transaction, address _finalSigner, address _to, uint _value, bytes _data);

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

	struct Partner {
		/// Flag indicating that this record has been initialized
		bool isPartner;
		/// Flag indicating that the partner has paid for their share
		bool paid;
		/// Total amount loaned to the partnership by the partner
		uint loanBalance;
		/// Amount released for withdrawal by the partner
		uint withdrawableAmount;
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
	
	modifier onlyFunded {
		if (!funded)
	       		throw;
		_
	}

	modifier onlyPartner {
		if (!isPartner(msg.sender))
			throw;
		_
	}

	modifier onlyDao {
		if (msg.sender != address(this))
			throw;
		_
	}

	function Partnership(address[] _partners, uint _sharePrice) {
		funded = false;
		sharePrice = _sharePrice;
		partners = _partners;
		for (uint i = 0; i < _partners.length; i++) {
			partnerRecords[_partners[i]].isPartner = true;
		}
		partnerCount = _partners.length;
	}

	/// This executes when funds are sent to the contract
	function() {
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
							paidPartnerCount += 1;
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
	function proposeTransaction(address _to, uint _value, bytes _data, string _description) onlyFunded onlyPartner external returns (bytes32) {

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
		
		ConfirmationRequired(id, msg.sender, _description);
		
		return id;
	}
	
	/// Confirms an existing proposed transaction
	function confirmTransaction(bytes32 _id) onlyFunded onlyPartner external {

		var transaction = transactions[_id];
	
		// ensure this is a transaction we've set up	
		if (!transaction.valid)
			throw;
	
		// ignore second confirmation
		if (transaction.votes[msg.sender] == 1)
			throw;
	
		// register the vote	
		transaction.voteCount += 1;
		transaction.votes[msg.sender] = 1;
		
		if (transaction.voteCount == partnerCount) {
			transaction.passed = true;
			TransactionPassed(_id, msg.sender, transaction.to, transaction.value, transaction.data);
		}
	}

	/// Executes a passed transaction
	function executeTransaction(bytes32 _id) onlyFunded onlyPartner external {

		var transaction = transactions[_id];

		// ignore transactions that have not passed yet
		if (!transaction.passed)
			throw;

		// ignore transactions that have already been sent
		if (transaction.sent)
			throw;

		// register the sent transaction
		transaction.sent = true;

		// send the transaction
		if (transactions[_id].to.call.value(transactions[_id].value)(transactions[_id].data)) {

			TransactionSent(_id, msg.sender, transaction.to, transaction.value, transaction.data);

			// clear the transaction structure to free memory
			delete transactions[_id];
		}
		else {
			// roll back if the call failed
			transaction.sent = false;
		}
	}

	/// Distribute ETH to a partner
	function distribute(address _partner, uint _amount) onlyDao external {

		// ignore invalid partners
		if (!isPartner(_partner))
			throw;

		partnerRecords[_partner].withdrawableAmount += _amount;
	}

	/// Distribute ETH evenly amongst all partners
	function distributeEvenly(uint _amount) onlyDao external {

		var payout = _amount / partnerCount;

		for (uint i = 0; i < partnerCount; i++) {
			partnerRecords[partners[i]].withdrawableAmount += payout;
	}

	/// Mark down partner's loan and make it available for withdrawal
	function repayLoan(address _partner, uint _amount) onlyDao external {

		// ignore invalid partners
		if (!partnerRecords[_partner].isPartner)
			throw;

		// ignore invalid amounts
		if (_amount > partnerRecords[_partner].loanBalance)
			throw;

		partnerRecords[_partner].loanBalance -= amount;
		partnerRecords[_partner].withdrawableAmount += amount;
	}

	/// Allow partner to withdraw funds marked as withdrawable
	function withdraw(uint _amount) onlyFunded onlyPartner external {

		// ignore requests for more than the amount allowed
		if (_amount > partnerRecords[msg.sender].withdrawableAmount)
			throw;

		// ignore requests for more than the available balance
		if (_amount > this.balance)
			throw;

		// mark the withdrawal as successful
		partnerRecords[msg.sender].withdrawableAmount -= _amount;

		// send the wei
		if (msg.sender.send(_amount)) {
			Withdrawal(msg.sender, _amount);
		}
		else {
			// roll back if the send failed
			partnerRecords[msg.sender].withdrawableAmount += _amount;
		}
	}
	
	/// Dissolve DAO and send the remaining ETH to a beneficiary
	function dissolve(address _beneficiary) onlyDao external {

		// ignore unset beneficiary, or recursive dissolution?
		if ((_beneficiary == 0) || (_beneficiary == this))
			throw;

		suicide(_beneficiary);
	}
	
	function isPartner(address _address) internal returns (bool) {
		return partnerRecords[_address].isPartner;
	}
	
}
