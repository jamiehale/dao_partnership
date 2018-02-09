var fs = require('fs');
var solc = require('solc');
var Web3 = require('web3');
var web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));

var args = process.argv.slice(2);

if( args.length < 3 ){
  console.log("Usage: nodejs prepare.js ether_amount partner1_eth partner2_eth [partner3_eth ...]");
  process.exit(1);
}

var amount = new web3.BigNumber(web3.toWei(args[0], "ether"))
console.log("amount: " + amount);

for (i = 1; i < args.length; i++){
  if (!web3.isAddress(args[i])){
    console.log("Invalid address: " + args[i]);
    process.exit(1);
  }
}
var code = fs.readFileSync('contracts/Partnership.sol','utf8');
var output = solc.compile(code, 1);

console.log("Using solc " + solc.version() + ", optimization on.");

var pship = output.contracts[':Partnership'];
var factory = web3.eth.contract(JSON.parse(pship.interface));

var byteCode = factory.new.getData(args.slice(1),amount,{data:pship.runtimeBytecode});
var params = byteCode.substr(pship.runtimeBytecode.length, byteCode.length - pship.runtimeBytecode.length)
console.log("These are the params you'll need to verify your contract on Etherscan.");
console.log(params);
