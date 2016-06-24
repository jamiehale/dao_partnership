const fs = require('fs');
code = fs.readFileSync('contract.sol','utf8');
var solc = require('solc');
var output = solc.compile(code, 1);
console.log(output)
