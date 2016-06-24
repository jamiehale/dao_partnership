var solc = require('solc');
code = fs.readFileSync('contract.sol','utf8');
var output = solc.compile(code, 1);
output
