//how can i use github:blnkfinance/blnk-ts as the import so i can use the createBulk function
import { BlnkInit } from '@blnkfinance/blnk-typescript';
import { bootstrap } from "./ledger";
import Fastify from "fastify";
import dotenv from "dotenv";
import db from "./db";
import fastifyCors from '@fastify/cors';
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

const blnk = BlnkInit('test_admin', { baseUrl: 'http://localhost:5001' });
const { Ledgers, LedgerBalances, Transactions } = blnk;

export { Ledgers, LedgerBalances, Transactions };

dotenv.config();

const app = Fastify({ logger: true });

app.register(fastifyCors, {
  origin: "http://127.0.0.1:5500",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
});

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
  balances = await bootstrap();

  // startPayoutWorker(balances);
  // 1️⃣ Create booking
  app.post("/create-booking", async (req, reply) => {
    try {
    const bookingId = `booking_${Date.now()}`;
    const { amount } = req.body as { amount: number };

    db.prepare(`
      INSERT INTO bookings (id, amount, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      bookingId,
      amount,
      "CREATED",
      new Date().toISOString(),
      new Date().toISOString()
    );

    const response = await fetch("https://sandbox.hyperswitch.io/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": "snd_rnAVo1BZFBD4wrknW57RequJOMvERcDM3UWHYCJjgM5uIbQRzAT8oRRgYG6lAn2Q",
      },
      body: JSON.stringify({
          amount: amount * 100,
          currency: "MAD",
          confirm: false,
          profile_id: "pro_iSspbTAvC6UYfIogBViN",
          metadata: {
            bookingId: bookingId,
          }
        }),
      });

      const text = await response.text();
      console.log("RAW RESPONSE FROM HYPERSWITCH:", text);

      if (!response.ok) {
        throw new Error("Payment creation failed");
      }

      const data = JSON.parse(text);

      db.prepare(`
        UPDATE bookings
        SET hyperswitch_payment_id = ?, hyperswitch_client_secret = ?, updated_at = ?
        WHERE id = ?
      `).run(data.payment_id, data.client_secret, new Date().toISOString(), bookingId);

      const booking = db.prepare(`
        SELECT * FROM bookings WHERE id = ?
      `).get(bookingId) as Booking;

      // 1) Do ledger pay in
      await Transactions.create({
        amount: booking.amount,
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
        amount: booking.amount,
        precision: 1,
        currency: "POINTS",
        source: "@TokenPool",
        destination: balances.clientBalanceId,
        reference: `${bookingId}_client_topup`,
        description: `Topup client balance with points for ${bookingId}`,
        allow_overdraft: true
      });

      return reply.send({
        bookingId,
        clientSecret: data.client_secret
      });

    } catch (err) {
      console.error("CREATE BOOKING ERROR:", err);
      return reply.status(500).send({
        error: "Internal Server Error",
      });
    }


    //---------------------------------------------------------------------

    // const booking = db.prepare(`
    //     SELECT * FROM bookings WHERE id = ?
    // `).get(bookingId) as Booking;

    // 🔵 Step A: Topup wallet
  //   await Transactions.create({
  //     amount: booking.amount,
  //     precision: 1,
  //     currency: "MAD",
  //     source: "@World",
  //     destinations: [
  //       {
  //           identifier: "@EscrowPool",
  //           distribution: "left",
  //       },
  //       {
  //           identifier: "@PlatformFees",
  //           distribution: "20%",
  //       }
  //     ],
  //     reference: `${bookingId}_EscrowPool_amount`,
  //     allow_overdraft: true,
  //     description: `Split the incoming payment for ${bookingId} between EscrowPool and PlatformFees`,
  //   });

  //   await Transactions.create({
  //     amount: booking.amount,
  //     precision: 1,
  //     currency: "POINTS",
  //     source: "@TokenPool",
  //     destination: balances.clientBalanceId,
  //     reference: `${bookingId}_client_topup`,
  //     description: `Topup client balance with points for ${bookingId}`,
  //     allow_overdraft: true,
  //   });

  //   return { bookingId, status: "CREATED", amount };
  });


  app.post("/webhook/hyperswitch", async (req, reply) => {
    const event = req.body as any;
    console.log("========WEB HOOK /webhook/hyperswitch reached: ",event)
    // Only handle success
    if (event.status === "succeeded") {
      const bookingId = event.bookingId;

      const booking = db.prepare(`
        SELECT * FROM bookings WHERE id = ?
      `).get(bookingId) as Booking;
        console.log("BOOKING: ", bookingId)
      if (!booking) {
        return reply.status(404).send({ error: "Booking not found===" });
      }

      if (booking.status !== "CREATED") {
        return reply.status(400).send({ error: "Booking already processed" });
      }

      // 3) Create payout inflight bulk
      const bulkPayOut = {
        atomic: true,
        inflight: true,
        transactions: [
          {
            amount: booking.amount,
            precision: 1,
            currency: "POINTS",
            source: balances.clientBalanceId,
            destination: "@TokenPool",
            reference: `${bookingId}_client_payback`,
            description: `Client payback for ${bookingId}`
          },
          {
            amount: booking.amount * 0.8,
            precision: 1,
            currency: "MAD",
            source: "@EscrowPool",
            destination: balances.merchantBalanceId,
            reference: `${bookingId}_escrow_to_merchant`,
            description: `Transfer from EscrowPool to Merchant balance for ${bookingId}`
          }
        ]
      };

      const payOutResponse = await Transactions.createBulk(bulkPayOut);
      const typedResponse = payOutResponse as unknown as BulkInflightResponse;
      const batchId = typedResponse.data.batch_id;

      // 4) Store inflight batch and update booking
      db.prepare(`
        UPDATE bookings
        SET status = ?, inflight_batch_id = ?, updated_at = ?
        WHERE id = ?
      `).run(
        "PAYOUT_INFLIGHT",
        batchId,
        new Date().toISOString(),
        bookingId
      );

      return reply.send({ success: true });
    }

    return reply.send({ ok: true });
  });










  //------------------------------------------------------------------
  // 2️⃣ PSP webhook simulation
  app.post("/webhook/psp", async (req: any, reply) => {
    const { bookingId } = req.body;

    const booking = db.prepare(`
        SELECT * FROM bookings WHERE id = ?
    `).get(bookingId) as Booking;

    if (!booking) {
      return reply.status(404).send({ error: "Booking not found" });
    }

    if (booking.status === "PAYOUT_VOIDED" || booking.status === "PAYOUT_COMMITTED") 
      return { success: true, message: "Already processed" };

    if (booking.status !== "CREATED")
      return reply.status(400).send({ error: "Invalid booking status" });

    // Bulk payout transaction to client and merchant
    const bulkPayOut = {
        atomic: true,
        inflight: true,
        transactions: [
            {
                amount: booking.amount,
                precision: 1,
                currency: "POINTS",
                source: balances.clientBalanceId,
                destination: "@TokenPool",
                reference: `${bookingId}_client_payback`,
                description: `Client payback for ${bookingId}`,
            },
            {
                amount: booking.amount * 0.8,
                precision: 1,
                currency: "MAD",
                source: "@EscrowPool",
                destination: balances.merchantBalanceId,
                reference: `${bookingId}_escrow_to_merchant`,
                description: `Transfer from EscrowPool to Merchant balance for ${bookingId}`,
            },
        ],
    };
    const payOutResponse = await Transactions.createBulk(bulkPayOut);
    console.log("Bulk transaction response:", payOutResponse);

    const typedResponse = payOutResponse as unknown as BulkInflightResponse;
    const batchId = typedResponse.data.batch_id;
    
    db.prepare(`
      UPDATE bookings
      SET status = ?, inflight_batch_id = ?, updated_at = ?
      WHERE id = ?
    `).run(
      "PAYOUT_INFLIGHT",
      batchId, // VERY IMPORTANT
      new Date().toISOString(),
      bookingId
    );

    return { success: true, booking_detail: db.prepare(`
        SELECT * FROM bookings WHERE id = ?
    `).get(bookingId) as Booking };
  });

  app.post("/hook", async (req: any, reply) => {
    const { id, status} = req.body;

    const booking = db.prepare(`SELECT * FROM bookings WHERE inflight_batch_id = ?`).get(id) as Booking;
    if (!booking)
      return reply.status(404).send({ error: "Unknown inflight transaction" });

    if (booking.status === "PAYOUT_COMMITTED")
      return { success: true, message: "Transaction already committed" };

    if (booking.status === "PAYOUT_VOIDED")
      return { success: true, message: "Transaction already voided" };

    if (status === "commit"){
      await Transactions.updateStatus(id, { status: "commit" });
      db.prepare(`
        UPDATE bookings
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        "PAYOUT_COMMITTED",
        new Date().toISOString(),
        booking.id
      );
    } else if (status === "void"){
      await Transactions.updateStatus(id, { status: "void" });
      db.prepare(`
        UPDATE bookings
        SET status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        "PAYOUT_VOIDED",
        new Date().toISOString(),
        booking.id
      );
    } else
      return reply.status(400).send({ error: "Invalid hook status" });


    return { success: true, booking_detail: db.prepare(`
        SELECT * FROM bookings WHERE inflight_batch_id = ?
    `).get(id) as Booking };
  });

  app.listen({ port: 3000 }, () => {
    console.log("🚀 Server running on http://localhost:3000");
  });
}

start();
