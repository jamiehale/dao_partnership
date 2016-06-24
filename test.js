const fs = require('fs');
code = fs.readFileSync('contract.sol','utf8');
var solc = require('solc');
var output = solc.compile(code, 1);
if (output.errors) {
  console.log(output.errors);
  console.log("Build succeeded.")
  return 1;
} else {
  console.log(output);
  console.log("Build failed.")
  return 0;
}
