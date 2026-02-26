import db from "./db";
import { Transactions } from "./index";

export function startPayoutWorker(balances: any) {
  setInterval(async () => {
    const now = new Date().toISOString();
    console.log("Checking for due payouts at", now);
    const payouts = db.prepare(`
      SELECT * FROM payouts
      WHERE status = 'PENDING'
      AND scheduled_for <= ?
    `).all(now);

    for (const payout of payouts as any) {
        // console.log("status", payout.status);
      try {
        // mark as processing
        db.prepare(`
          UPDATE payouts SET status = 'PROCESSING'
          WHERE id = ?
        `).run(payout.id);

        // escrow → world
        await Transactions.create({
          amount: payout.amount,
          precision: 1,
          currency: "MAD",
          source: balances.merchantBalanceId,
          destination: "@World",
          reference: `${payout.id}_execute`,
          description: `Payout execution for ${payout.booking_id}`,
        });

        db.prepare(`
          UPDATE payouts
          SET status = 'PAID', processed_at = ?
          WHERE id = ?
        `).run(new Date().toISOString(), payout.id);

        console.log("Payout executed:", payout.id);

      } catch (err) {
        db.prepare(`
          UPDATE payouts SET status = 'FAILED'
          WHERE id = ?
        `).run(payout.id);

        console.error("Payout failed:", payout.id);
      }
    }
  }, 15_000); // check every 10 seconds
}
