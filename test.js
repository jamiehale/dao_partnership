const fs = require('fs');

fs.readdirSync('./').forEach(item => {
  if( '.sol' == item.substr(item.length - 4)) {  
    console.log(item);
    code = fs.readFileSync(item,'utf8');
    var solc = require('solc');
    var output = solc.compile(code, 1);
    if (output.errors) {
      console.log(output.errors);
      console.log("Build failed.")
      process.exit(1);
    }
  }
});

console.log("Build succeeded.")
