#!/usr/bin/env node
import { initializeTransfer, LocalSimulatedTransfer, openInventory, readTransferReceipt } from './inf03-transfer-common.mjs';

import { expired } from './inf03-inventory-common.mjs';
const args = process.argv.slice(2);
const fail = () => { throw new Error('INF03_TRANSFER_UNVERIFIED'); };
const command=args[0];
const base=['--mode','--objects'],authority=['--repository','--inventory','--inventory-checkpoint'];
const schemas={init:[...base,...authority],upload:[...base,...authority,'--input','--receipt'],download:[...base,...authority,'--backup-id','--destination'],retire:[...base,'--apply']};
if(!Object.hasOwn(schemas,command))fail();const allowed=new Set(schemas[command]),seen=new Set();
for(let i=1;i<args.length;i++){
  const flag=args[i];if(!allowed.has(flag)||seen.has(flag))fail();seen.add(flag);
  if(flag==='--apply')continue;
  if(!args[i+1]||args[i+1].startsWith('--')||/^[a-z]+:\/\//i.test(args[i+1]))fail();i++;
}
const value = (flag) => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
if (value('--mode') !== 'local-simulated') fail();
const key = process.env.INF03_TRANSFER_HMAC_KEY;
if (typeof key !== 'string' || Buffer.byteLength(key) < 32) fail();
const objects = value('--objects');
if (!objects || key===process.env.INF03_INVENTORY_HMAC_KEY) fail();
let result;
if (command === 'init') {
  if (args.includes('--apply') || !value('--repository') || !value('--inventory') || !value('--inventory-checkpoint')) fail();
  const transferId = await initializeTransfer({ objects, key, repository: value('--repository'), inventory: value('--inventory'), checkpoint: value('--inventory-checkpoint') });
  result = { initialized: true, transferId };
} else if (command === 'retire') {
  const transfer = await new LocalSimulatedTransfer({ objects, key }).open();
  try { result = await transfer.retire({ apply: args.includes('--apply'), role: 'retire' }); } finally { await transfer.close(); }
} else {
  if (!value('--repository') || !value('--inventory') || !value('--inventory-checkpoint')) fail();
  const { instance: inventory } = await openInventory(args);
  try {
    const transfer = await new LocalSimulatedTransfer({ objects, key, inventoryConfig: { repository: value('--repository'), inventory: value('--inventory'), checkpoint: value('--inventory-checkpoint'), key: process.env.INF03_INVENTORY_HMAC_KEY } }).open();
    try {
      if (command === 'upload') {
        if (!value('--input') || !value('--receipt') || args.includes('--apply')) fail();
        const receiptPath = value('--receipt');
        const receipt = await readTransferReceipt(receiptPath);
        result = await transfer.upload({ input: value('--input'), receiptPath, receipt, inventory });
      } else {
        if (!value('--backup-id') || !value('--destination') || args.includes('--apply')) fail();
        result = await transfer.download({ backupId: value('--backup-id'), destination: value('--destination'), inventory });
      }
    } finally { await transfer.close(); }
  } finally { await inventory.close(); }
}
// El resumen se emite recién después de cerrar ambos locks.
if(result?.originalCreatedAt && expired(result.originalCreatedAt))fail();
process.stdout.write(`${JSON.stringify(result)}\n`);
