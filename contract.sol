/// Partnership
/// Requires all pre-defined partners agreement on transactions and operations.
contract Partnership
{
	event Deposit(address _from, uint _value);
	event ConfirmationRequired(bytes32 _operation, address _initiator, address _to, uint _value, bytes _data);
	event TransactionSent(bytes32 _transaction, address _finalSigner, address _to, uint _value, bytes _data);
	
	/// Array of partner addresses
	address [] partners;
	
	/// Collection of partner addresses (1 => 'partner', 0/unset => 'not partner')
	mapping(address => uint) public partnerRecords;
	
	/// Count of partners
	uint public partnerCount;
	
	/// Collection of pending transactions (ie send X ETH to Y with Z data)
	mapping(bytes32 => Transaction) public transactions;
	
	/// Collection of pending operations (ie internal function calls)
	mapping(bytes32 => Operation) public operations;
	
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
	
	function Partnership(address[] _partners) {
		partners = _partners;
		for (uint i = 0; i < _partners.length; i++) {
			partnerRecords[_partners[i]] = 1;
		}
		partnerCount = _partners.length;
	}
	
	function() {
		if (msg.value > 0)
			Deposit(msg.sender, msg.value);
	}
	
	function isPartner(address _address) returns (bool) {
		return partnerRecords[_address] == 1;
	}
	
	/// Adds a proposed transaction to be confirmed by other partners
	function proposeTransaction(address _to, uint _value, bytes _data) onlyPartner external returns (bytes32) {
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
	function confirmTransaction(bytes32 _id) onlyPartner external {
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
	
	function kill(address _to) onlyAllPartners(sha3(msg.data)) external {
		suicide(_to);
	}
	
	function dissolve() onlyAllPartners(sha3(msg.data)) external {
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
