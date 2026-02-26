//how can i use github:blnkfinance/blnk-ts as the import so i can use the createBulk function
import { BlnkInit } from '@blnkfinance/blnk-typescript';
import { bootstrap } from "./ledger";

const blnk = BlnkInit('test_admin', { baseUrl: 'http://localhost:5001' });
const { Ledgers, LedgerBalances, Transactions } = blnk;

export { Ledgers, LedgerBalances };

async function main() {

    const setup = await bootstrap();

    const clientBalanceId = setup.clientBalanceId;
    const settlementBalanceId = setup.settlementBalanceId;
    const feeBalanceId = setup.feeBalanceId;
    const escrowBalanceId = setup.escrowBalanceId;

    // Process transactions asynchronously with atomic and inflight options
    const asyncBulkData = {
        atomic: true,
        skip_queue: true,
        transactions: [
            {
                amount: 1200,
                precision: 1,
                reference: `txn${Date.now()}_topup`,
                description: 'Top up points for Alice Johnson',
                currency: 'POINTS',
                source: '@World',
                destination: clientBalanceId,
                allow_overdraft: true,
            },
            {
                amount: 1200,
                precision: 1,
                reference: `txn${Date.now()}_transfer`,
                description: 'Transfer points from Alice Johnson to App settlement',
                currency: 'POINTS',
                source: clientBalanceId,
                destination: settlementBalanceId,
            }
        ],
    };

    const bulkTransaction = await Transactions.createBulk(asyncBulkData);

    if (!bulkTransaction.data || bulkTransaction.status !== 201) {
        throw new Error(bulkTransaction.message);
    }

    console.log("Bulk Transaction Created:", bulkTransaction);


    const settlmentSplit = await Transactions.createBulk({
        atomic: true,
        transactions: [
            {
                amount: 1000,
                precision: 1,
                reference: `txn${Date.now()}_settlement_split`,
                description: 'Split escrow transaction',
                currency: 'POINTS',
                source: settlementBalanceId,
                destination: escrowBalanceId,
            },
            {
                amount: 200,
                precision: 1,
                reference: `txn${Date.now()}_fee_split`,
                description: 'Split fee transaction',
                currency: 'POINTS',
                source: settlementBalanceId,
                destination: feeBalanceId,
            }
        ]
    })

    if (!settlmentSplit.data || settlmentSplit.status !== 201) {
        throw new Error(settlmentSplit.message);
    }
    console.log("Settlement Split Transaction Created:", settlmentSplit);

    const sleep = (ms: number) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };


    async function demoFunction() {
        console.log('Before delay');
        // Pauses execution for 2 seconds (2000 milliseconds) within this function
        await sleep(1000); 
        console.log('After delay');
    }

    // Call the async function
    demoFunction();

    const feePayout = await Transactions.create({
        amount: 200,
        precision: 1,
        reference: `txn${Date.now()}_fee_payout`,
        description: 'Payout fee from fee balance to external account',
        currency: 'POINTS',
        source: feeBalanceId,
        destination: "@World",
        inflight: true, // Mark as inflight to simulate pending transaction
    });

    if (!feePayout.data || feePayout.status !== 201) {
        throw new Error(feePayout.message);
    }
    console.log("Fee Payout Transaction Created:", feePayout);

    const escrwPayout = await Transactions.create({
        amount: 1000,
        precision: 1,
        reference: `txn${Date.now()}_escrow_payout`,
        description: 'Payout from escrow to external account',
        currency: 'POINTS',
        source: escrowBalanceId,
        destination: '@World',
        inflight: true, // Mark as inflight to simulate pending transaction
    });

    if (!escrwPayout.data || escrwPayout.status !== 201) {
        throw new Error(escrwPayout.message);
    }
    console.log("Escrow Payout Transaction Created:", escrwPayout);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});





// const payoutId = `payout_${Date.now()}`;
    // const payoutAmount = booking.amount * 0.8;

    // const scheduledDate = new Date(Date.now() + 120_000); // 2 min later
    // db.prepare(`
    //   INSERT INTO payouts (id, booking_id, amount, status, scheduled_for, created_at)
    //   VALUES (?, ?, ?, ?, ?, ?)
    // `).run(
    //   payoutId,
    //   bookingId,
    //   payoutAmount,
    //   "PENDING",
    //   scheduledDate.toISOString(),
    //   new Date().toISOString()
    // );