import {mkdir} from 'node:fs/promises';
import {initializeInventory} from '/scripts/inf03-inventory-common.mjs';
import {initializeCustody,LocalSimulatedCustody} from '/scripts/inf03-custody-common.mjs';
import {initializeLocalSuppressionJournal,LocalSuppressionJournal} from '/app/dist/modules/account-deletion/suppression-journal.js';
let input='';for await(const chunk of process.stdin)input+=chunk;const c=JSON.parse(input);
for(const dir of [c.inventoryConfig.repository,c.inventoryConfig.inventory,c.inventoryConfig.checkpoint,c.journalConfig.journalDirectory,c.journalConfig.checkpointDirectory])await mkdir(dir,{recursive:true,mode:0o700});
await initializeInventory(c.inventoryConfig);await initializeLocalSuppressionJournal(c.journalConfig,new Date().toISOString());
c.journalFactory=async config=>new LocalSuppressionJournal(config);await initializeCustody(c);const custody=new LocalSimulatedCustody(c);try{await custody.open();await custody.publish();}finally{await custody.close();}
console.log(JSON.stringify({provisioned:true,uid:process.getuid()}));
