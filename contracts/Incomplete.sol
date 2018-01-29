/// Incomplete
/// Doesn't allow anyone to deposit money
pragma solidity ^0.4.18;
contract Incomplete
{
	/// This executes when funds are sent to the contract
	function() public payable {
    require(false);
	}
}

