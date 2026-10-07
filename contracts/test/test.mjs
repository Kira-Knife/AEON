import ganache from 'ganache';import fs from 'fs';
import { encodeFunctionData, encodeDeployData, decodeFunctionResult, parseAbi, decodeEventLog } from 'viem';
const B=JSON.parse(fs.readFileSync('build.json'));
const P=ganache.provider({logging:{quiet:true}});const rq=(m,p=[])=>P.request({method:m,params:p});
const [dep,agent,flagger,shop]=await rq('eth_accounts');
const U=B['MockUSDC.sol'].MockUSDC,V=B['AEON.sol'].BondVault,R=B['AEON.sol'].Verifier;
const logs=[];
async function send(from,to,data){const h=await rq('eth_sendTransaction',[{from,to,data,gas:'0x800000'}]);const r=await rq('eth_getTransactionReceipt',[h]);if(r.status!=='0x1'){if(process.env.DBG&&from===agent){const t=await rq('debug_traceTransaction',[h,{disableStorage:true}]);const rv=t.structLogs.filter(s=>s.op==='REVERT'&&s.depth===2)[0];if(rv){const st=rv.stack,off=parseInt(st[st.length-1],16),len=parseInt(st[st.length-2],16);console.log('INNER',rv.memory.join('').slice(off*2,(off+len)*2));}const L=t.structLogs;const calls=L.map((s,i)=>[s,i]).filter(([s])=>/CALL/.test(s.op)&&s.depth===1);for(const [s,i] of calls){const n=L[i+1];console.log('CALL',s.op,'to',s.stack[s.stack.length-2],'next depth',n.depth,n.op);}}throw Error('revert')};logs.push(...r.logs);return r;}
const deploy=async(c,args)=>(await send(dep,undefined,encodeDeployData({abi:c.abi,bytecode:'0x'+c.evm.bytecode.object,args}))).contractAddress;
const call=async(to,c,fn,args=[])=>decodeFunctionResult({abi:c.abi,functionName:fn,data:await rq('eth_call',[{to,data:encodeFunctionData({abi:c.abi,functionName:fn,args})}])});
const tx=(a,to,c,fn,args)=>send(a,to,encodeFunctionData({abi:c.abi,functionName:fn,args}));
const fails=async(...x)=>{try{await tx(...x);return false}catch{return true}};
const usdc=await deploy(U,[]),vault=await deploy(V,[usdc]),ver=await call(vault,V,'verifier');
const E=1000000n;
await tx(agent,usdc,U,'mint',[agent,3000n*E]);
await tx(agent,usdc,U,'approve',[vault,2000n*E]);await tx(agent,usdc,U,'approve',[ver,2000n*E]);
await tx(agent,vault,V,'declare',[1000n*E,300n]);
console.log('flag before overspend reverts:',await fails(flagger,ver,R,'flag',[1n]));
console.log('pay from unlinked wallet reverts:',await fails(flagger,ver,R,'pay',[1n,shop,1n]));
try{await rq('eth_call',[{from:agent,to:ver,data:encodeFunctionData({abi:R.abi,functionName:'pay',args:[1n,shop,12n*E]})}])}catch(e){console.log('REASON',e.message)}
console.log('bal',await call(usdc,U,'balanceOf',[agent]),'allow',await call(usdc,U,'allowance',[agent,ver]),'ver',ver);
for(const x of [12n,240n,760n]) await tx(agent,ver,R,'pay',[1n,shop,x*E]);
console.log('topUp after overspend reverts:',await fails(agent,vault,V,'topUp',[1n,100n*E]));
console.log('slash by stranger reverts:',await fails(flagger,vault,V,'slash',[1n,1n]));
await tx(flagger,ver,R,'flag',[1n]);
console.log('second flag reverts:',await fails(flagger,ver,R,'flag',[1n]));
console.log('release early reverts:',await fails(agent,vault,V,'release',[1n]));
await rq('evm_increaseTime',[1000]);await rq('evm_mine');
await tx(agent,vault,V,'release',[1n]);
const bal=a=>call(usdc,U,'balanceOf',[a]).then(x=>Number(x)/1e6);
console.log('burned',await bal('0x000000000000000000000000000000000000dEaD'),'shop',await bal(shop),'agent',await bal(agent),'vault',await bal(vault));
const sigs=[...fs.readFileSync('../../backend/server.js','utf8').matchAll(/'(event [^']+)'/g)].map(m=>m[1]);
const ABI=parseAbi(sigs);
for(const l of logs){try{const e=decodeEventLog({abi:ABI,data:l.data,topics:l.topics});console.log(' backend decodes',e.eventName,JSON.stringify(e.args,(k,v)=>typeof v==='bigint'?v.toString():v));}catch{}}
process.exit(0);
