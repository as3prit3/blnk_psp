import { BlnkInit } from '@blnkfinance/blnk-typescript';
import { bootstrap } from "./ledger";
import Fastify from "fastify";
import dotenv from "dotenv";
import { pool, initDB } from "./db";
import fastifyStatic from "@fastify/static";
import path from "path";

type BulkInflightResponse = {
  status: number;
  message: string;
  data: {
    batch_id: string;
    status: string;
    transaction_count: number;
  };
};
console.log("API KEEEY=== ", process.env.SEC_API_KEY)

const blnk = BlnkInit(process.env.SEC_API_KEY as string, { baseUrl: 'http://server:5001' });
const { Ledgers, LedgerBalances, Transactions } = blnk;

export { Ledgers, LedgerBalances, Transactions };

dotenv.config();

const app = Fastify({ logger: true });

app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
});

interface Booking {
  id: string;
  amount: number;
  status: string;
}

let balances: any;

async function start() {
  if (process.env.RUN_BOOTSTRAP === "true") {
    console.log("🚀 Running bootstrap...");
    balances = await bootstrap();
  } else {
    console.log("♻️ Skipping bootstrap");
  }
  // 1️⃣ Create booking
  app.post("/create-booking", async (req, reply) => {
    const { amount, user_id, host_id } = req.body as {
      amount: number;
      user_id: string;
      host_id: string;
    };

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Create booking
      const bookingResult = await client.query(
        `
        INSERT INTO bookings (user_id, host_id, amount)
        VALUES ($1, $2, $3)
        RETURNING id
        `,
        [user_id, host_id, amount * 100]
      );

      const bookingId = bookingResult.rows[0].id;

      // Create Hyperswitch payment
      const response = await fetch("http://hyperswitch-server:8080/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.HS_SND_API_KEY as string,
        },
        body: JSON.stringify({
          amount: amount * 100,
          currency: "MAD",
          confirm: false,
          metadata: {
            booking_id: bookingId
          }
        }),
      });

      const data = await response.json();
      console.log("HYPEEEERSWITCH FETCH=== ", data)
      // 1) Do ledger pay in
      await Transactions.create({
        amount: amount,
        precision: 1,
        currency: "MAD",
        source: "@World",
        destinations: [
          { identifier: "@EscrowPool", distribution: "left" },
          { identifier: "@PlatformFees", distribution: "20%" }
        ],
        reference: `${bookingId}_payin`,
        allow_overdraft: true,
        description: `Split the incoming payment for ${bookingId} between EscrowPool and PlatformFees`
      });

      // 2) Mint client token balance
      await Transactions.create({
        amount: amount,
        precision: 1,
        currency: "POINTS",
        source: "@TokenPool",
        destination: balances.clientBalanceId,
        reference: `${bookingId}_client_topup`,
        description: `Topup client balance with points for ${bookingId}`,
        allow_overdraft: true
      });

      await client.query("COMMIT");

      return reply.send({
        bookingId,
        clientSecret: data.client_secret,
      });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      reply.status(500).send({ error: "Booking creation failed" });
    } finally {
      client.release();
    }
  });




  // app.post("/create-booking", async (req, reply) => {
  //   try {
  //   const bookingId = `booking_${Date.now()}`;
  //   const { amount } = req.body as { amount: number };

  //   db.prepare(`
  //     INSERT INTO bookings (id, amount, status, created_at, updated_at)
  //     VALUES (?, ?, ?, ?, ?)
  //   `).run(
  //     bookingId,
  //     amount,
  //     "CREATED",
  //     new Date().toISOString(),
  //     new Date().toISOString()
  //   );

  //   const response = await fetch("http://localhost:8080/payments", {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       "api-key": "snd_sKCelJbWIO9OAzro0QX4khHffncVgGWKCLis5V2wy0iEsDQEJi7d5YqPFI2p7YKd",
  //     },
  //     body: JSON.stringify({
  //         amount: amount,
  //         currency: "MAD",
  //         confirm: false,
  //         metadata: {
  //           bookingId: bookingId,
  //         }
  //       }),
  //     });

  //     const text = await response.text();
  //     console.log("RAW RESPONSE FROM HYPERSWITCH:", text);

  //     if (!response.ok) {
  //       throw new Error("Payment creation failed");
  //     }

  //     const data = JSON.parse(text);

  //     db.prepare(`
  //       UPDATE bookings
  //       SET hyperswitch_payment_id = ?, hyperswitch_client_secret = ?, updated_at = ?
  //       WHERE id = ?
  //     `).run(data.payment_id, data.client_secret, new Date().toISOString(), bookingId);

  //     const booking = db.prepare(`
  //       SELECT * FROM bookings WHERE id = ?
  //     `).get(bookingId) as Booking;

      // // 1) Do ledger pay in
      // await Transactions.create({
      //   amount: booking.amount,
      //   precision: 1,
      //   currency: "MAD",
      //   source: "@World",
      //   destinations: [
      //     { identifier: "@EscrowPool", distribution: "left" },
      //     { identifier: "@PlatformFees", distribution: "20%" }
      //   ],
      //   reference: `${bookingId}_payin`,
      //   allow_overdraft: true,
      //   description: `Split the incoming payment for ${bookingId} between EscrowPool and PlatformFees`
      // });

      // // 2) Mint client token balance
      // await Transactions.create({
      //   amount: booking.amount,
      //   precision: 1,
      //   currency: "POINTS",
      //   source: "@TokenPool",
      //   destination: balances.clientBalanceId,
      //   reference: `${bookingId}_client_topup`,
      //   description: `Topup client balance with points for ${bookingId}`,
      //   allow_overdraft: true
      // });

  //     return reply.send({
  //       bookingId,
  //       clientSecret: data.client_secret
  //     });

  //   } catch (err) {
  //     console.error("CREATE BOOKING ERROR:", err);
  //     return reply.status(500).send({
  //       error: "Internal Server Error",
  //     });
  //   }
  // });



  app.post("/webhook/hyperswitch", async (req, reply) => {
    const event = req.body as any;
    const client = await pool.connect();
    console.log("RESPONSE=== ", event)
    try {
      await client.query("BEGIN");

      const paymentId = event.content.object.payment_id;
      const status = event.event_type;

      if (status !== "payment_succeeded") {
        await client.query("ROLLBACK");
        return reply.send({ ignored: true });
      }

      // Prevent duplicate processing
      const existingPayment = await client.query(
        `SELECT * FROM payments WHERE hyperswitch_payment_id = $1`,
        [paymentId]
      );
      console.log("PAYMENT ID=== ", existingPayment)
      if (existingPayment.rows.length > 0) {
        await client.query("ROLLBACK");
        return reply.send({ alreadyProcessed: true });
      }

      // Find booking by metadata or mapping logic
      const bookingResult = await client.query(
        `SELECT id FROM bookings WHERE payment_processed = false LIMIT 1`
      );

      if (!bookingResult.rows.length) {
        throw new Error("Booking not found");
      }

      const bookingId = bookingResult.rows[0].id;

      // Store payment
      await client.query(
        `
        INSERT INTO payments
        (booking_id, hyperswitch_payment_id, amount, currency, status, raw_response)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          bookingId,
          paymentId,
          event.content.object.amount,
          event.content.object.currency,
          status,
          event,
        ]
      );

      // Update booking
      await client.query(
        `
        UPDATE bookings
        SET status = 'paid',
            payment_processed = true,
            payment_id = $1,
            updated_at = NOW()
        WHERE id = $2
        `,
        [paymentId, bookingId]
      );

      await client.query("COMMIT")
      
      const bulkPayOut = {
        atomic: true,
        inflight: true,
        transactions: [
          {
            amount: event.content.object.amount / 100,
            precision: 1,
            currency: "POINTS",
            source: balances.clientBalanceId,
            destination: "@TokenPool",
            reference: `${bookingId}_client_payback`,
            description: `Client payback for ${bookingId}`
          },
          {
            amount: event.content.object.amount / 100 * 0.8,
            precision: 1,
            currency: "MAD",
            source: "@EscrowPool",
            destination: balances.merchantBalanceId,
            reference: `${bookingId}_escrow_to_merchant`,
            description: `Transfer from EscrowPool to Merchant balance for ${bookingId}`
          }
        ]
      };

      const payout_tx = await Transactions.createBulk(bulkPayOut);

      reply.send({ success: true });

    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Webhook error:", err);
      reply.status(500).send({ error: "Webhook failed" });
    } finally {
      client.release();
    }
  });



  // app.post("/webhook/hyperswitch", async (req, reply) => {
  //   const event = req.body as any;
  //   console.log("========WEB HOOK /webhook/hyperswitch reached: ",event)
  //   // Only handle success
  //   if (event.event_type === "payment_succeeded") {
  //     const paymentId = event.content.object.payment_id;

  //     const booking = db.prepare(`
  //       SELECT * FROM bookings WHERE hyperswitch_payment_id = ?
  //     `).get(paymentId) as Booking;
  //       console.log("BOOKING: ", paymentId)
  //     if (!booking) {
  //       return reply.status(404).send({ error: "Booking not found===" });
  //     }

  //     if (booking.status !== "CREATED") {
  //       return reply.status(400).send({ error: "Booking already processed" });
  //     }

  //     // 3) Create payout inflight bulk
      // const bulkPayOut = {
      //   atomic: true,
      //   inflight: true,
      //   transactions: [
      //     {
      //       amount: booking.amount,
      //       precision: 1,
      //       currency: "POINTS",
      //       source: balances.clientBalanceId,
      //       destination: "@TokenPool",
      //       reference: `${paymentId}_client_payback`,
      //       description: `Client payback for ${paymentId}`
      //     },
      //     {
      //       amount: booking.amount * 0.8,
      //       precision: 1,
      //       currency: "MAD",
      //       source: "@EscrowPool",
      //       destination: balances.merchantBalanceId,
      //       reference: `${paymentId}_escrow_to_merchant`,
      //       description: `Transfer from EscrowPool to Merchant balance for ${paymentId}`
      //     }
      //   ]
      // };

      // const payOutResponse = await Transactions.createBulk(bulkPayOut);
  //     const typedResponse = payOutResponse as unknown as BulkInflightResponse;
  //     const batchId = typedResponse.data.batch_id;

  //     // 4) Store inflight batch and update booking
  //     db.prepare(`
  //       UPDATE bookings
  //       SET status = ?, inflight_batch_id = ?, updated_at = ?
  //       WHERE hyperswitch_payment_id = ?
  //     `).run(
  //       "PAYOUT_INFLIGHT",
  //       batchId,
  //       new Date().toISOString(),
  //       paymentId
  //     );

  //     return reply.send({ success: true });
  //   }

  //   return reply.send({ ok: true });
  // });

  // app.post("/hook", async (req: any, reply) => {
  //   const { id, status} = req.body;

  //   const booking = db.prepare(`SELECT * FROM bookings WHERE inflight_batch_id = ?`).get(id) as Booking;
  //   if (!booking)
  //     return reply.status(404).send({ error: "Unknown inflight transaction" });

  //   if (booking.status === "PAYOUT_COMMITTED")
  //     return { success: true, message: "Transaction already committed" };

  //   if (booking.status === "PAYOUT_VOIDED")
  //     return { success: true, message: "Transaction already voided" };

  //   if (status === "commit"){
  //     await Transactions.updateStatus(id, { status: "commit" });
  //     db.prepare(`
  //       UPDATE bookings
  //       SET status = ?, updated_at = ?
  //       WHERE id = ?
  //     `).run(
  //       "PAYOUT_COMMITTED",
  //       new Date().toISOString(),
  //       booking.id
  //     );
  //   } else if (status === "void"){
  //     await Transactions.updateStatus(id, { status: "void" });
  //     db.prepare(`
  //       UPDATE bookings
  //       SET status = ?, updated_at = ?
  //       WHERE id = ?
  //     `).run(
  //       "PAYOUT_VOIDED",
  //       new Date().toISOString(),
  //       booking.id
  //     );
  //   } else
  //     return reply.status(400).send({ error: "Invalid hook status" });


  //   return { success: true, booking_detail: db.prepare(`
  //       SELECT * FROM bookings WHERE inflight_batch_id = ?
  //   `).get(id) as Booking };
  // });

  await initDB();

  app.listen({ port: 3000, host: "0.0.0.0" }, () => {
    console.log("🚀 Server running on http://localhost:3000");
  });
}

start();
