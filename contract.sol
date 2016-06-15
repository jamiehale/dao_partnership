/// Partnership
/// Requires all pre-defined partners agreement on transactions and operations.
contract Partnership
{
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
	
	/// Collection of pending operations (ie internal function calls)
	mapping(bytes32 => Operation) public operations;
	
	struct Partner {
		bool isPartner;
		/// Flag indicating that the partner has paid for their share
		bool paid;
		/// Total amount loaned to the partnership by the partner
		uint loanBalance;
	}

	struct Transaction {
		address to;
		uint value;
		bytes data;
		/// Total number of partners that have confirmed/voted
		uint voteCount;
		/// Collection of partners that have confirmed/voted
		mapping(address => uint) votes;
	}
	
	struct Operation {
		uint voteCount;
		mapping(address => uint) votes;
	}

	modifier onlyFunded {
		if (funded)
		_
	}

	modifier onlyPartner {
		if (isPartner(msg.sender))
		_
	}

	/// Allows the call iff all partners have made the same call
	modifier onlyAllPartners(bytes32 _operation) {
		confirmOperation(_operation);
		if (operations[_operation].voteCount == partnerCount)
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
	
	function() {
		if (msg.value > 0) {
			if (funded) {
				if (partnerRecords[msg.sender].isPartner) {
					partnerRecords[msg.sender].loanBalance += msg.value;
				}
			}
			else {
				if (partnerRecords[msg.sender].isPartner) {
					if (partnerRecords[msg.sender].paid) {
						throw;
					}
					else {
						if (msg.value == sharePrice) {
							partnerRecords[msg.sender].paid = true;
							paidPartnerCount += 1;
							if (paidPartnerCount == partnerCount) {
								funded = true;
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
	
	function isPartner(address _address) returns (bool) {
		return partnerRecords[_address].isPartner;
	}
	
	/// Adds a proposed transaction to be confirmed by other partners
	function proposeTransaction(address _to, uint _value, bytes _data) onlyFunded onlyPartner external returns (bytes32) {
		bytes32 hash = sha3(msg.data, block.number);
		
		var transaction = transactions[hash];
		
		transaction.to = _to;
		transaction.value = _value;
		transaction.data = _data;
		transaction.voteCount = 1;
		transaction.votes[msg.sender] = 1;
		
		ConfirmationRequired(hash, msg.sender, _to, _value, _data);
		
		return hash;
	}
	
	/// Confirms an existing proposed transaction and executes it if all partners have confirmed
	function confirmTransaction(bytes32 _id) onlyFunded onlyPartner external {
		var transaction = transactions[_id];
		
		if (transaction.to == 0)
			throw;
		
		if (transaction.votes[msg.sender] == 1)
			throw;
		
		transaction.voteCount += 1;
		transaction.votes[msg.sender] = 1;
		
		if (transaction.voteCount == partnerCount) {
			TransactionSent(_id, msg.sender, transaction.to, transaction.value, transaction.data);
			transactions[_id].to.call.value(transactions[_id].value)(transactions[_id].data);
			delete transactions[_id];
		}
	}
	
	function dissolve() onlyFunded onlyAllPartners(sha3(msg.data)) external {
		uint payout = this.balance / partnerCount;
		for ( uint i = 0; i < partnerCount; i++ ) {
			partners[i].send(payout);
		}
		suicide(partners[0]);
	}
	
	function confirmOperation(bytes32 _operation) internal {
		if (!isPartner(msg.sender))
			throw;
		
		if (operations[_operation].votes[msg.sender] == 1)
			throw;
		
		operations[_operation].voteCount += 1;
		operations[_operation].votes[msg.sender] = 1;
	}
}
