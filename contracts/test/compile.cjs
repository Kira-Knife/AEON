const solc=require('solc'),fs=require('fs');
const input={language:'Solidity',sources:{'AEON.sol':{content:fs.readFileSync('../AEON.sol','utf8')},'MockUSDC.sol':{content:fs.readFileSync('../MockUSDC.sol','utf8')}},settings:{evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const out=JSON.parse(solc.compile(JSON.stringify(input),{import:p=>({contents:fs.readFileSync('node_modules/'+p,'utf8')})}));
(out.errors||[]).forEach(e=>console.log(e.severity,e.formattedMessage));
fs.writeFileSync('build.json',JSON.stringify(out.contracts));console.log('compiled');
