// import { BlnkInit } from '@blnkfinance/blnk-typescript';
// import { bootstrap } from "./ledger";
// import Fastify from "fastify";
// import dotenv from "dotenv";
// import { pool, initDB } from "./db";
// import fastifyStatic from "@fastify/static";
// import path from "path";

// type BulkInflightResponse = {
//   status: number;
//   message: string;
//   data: {
//     batch_id: string;
//     status: string;
//     transaction_count: number;
//   };
// };
// console.log("API KEEEY=== ", process.env.SEC_API_KEY)

// const blnk = BlnkInit(process.env.SEC_API_KEY as string, { baseUrl: 'http://server:5001' });
// const { Ledgers, LedgerBalances, Transactions } = blnk;

// export { Ledgers, LedgerBalances, Transactions };

// dotenv.config();

// const app = Fastify({ logger: true });

// app.register(fastifyStatic, {
//   root: path.join(__dirname, "../public"),
// });

// interface Booking {
//   id: string;
//   amount: number;
//   status: string;
// }

// let balances: any;

// async function start() {
//   if (process.env.RUN_BOOTSTRAP === "true") {
//     console.log("🚀 Running bootstrap...");
//     balances = await bootstrap();
//   } else {
//     console.log("♻️ Skipping bootstrap");
//   }

//   app.get("/config", async (req, reply) => {
//     return {
//       publishableKey: process.env.HS_PNK_API_KEY
//     };
//   });


//   // 1️⃣ Create booking
//   app.post("/create-booking", async (req, reply) => {
//     const { amount, user_id, host_id } = req.body as {
//       amount: number;
//       user_id: string;
//       host_id: string;
//     };

//     const client = await pool.connect();

//     try {
//       await client.query("BEGIN");

//       // Create booking
//       const bookingResult = await client.query(
//         `
//         INSERT INTO bookings (user_id, host_id, amount)
//         VALUES ($1, $2, $3)
//         RETURNING id
//         `,
//         [user_id, host_id, amount * 100]
//       );

//       const bookingId = bookingResult.rows[0].id;
//       // Create Hyperswitch payment
//       const response = await fetch("http://hyperswitch-hyperswitch-server-1:8080/payments", {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "api-key": process.env.HS_SND_API_KEY as string,
//         },
//         body: JSON.stringify({
//           amount: amount * 100,
//           currency: "MAD",
//           confirm: false,
//           metadata: {
//             booking_id: bookingId
//           }
//         }),
//       });

//       const data = await response.json();
//       if (!data.client_secret)
//         throw new Error("Failed to create Hyperswitch payment");

//       console.log("HYPEEEERSWITCH FETCH=== ", data)
//       await client.query("COMMIT");

//       return reply.send({
//         bookingId,
//         clientSecret: data.client_secret,
//       });

//     } catch (err) {
//       await client.query("ROLLBACK");
//       console.error(err);
//       reply.status(500).send({ error: "Booking creation failed" });
//     } finally {
//       client.release();
//     }
//   });

  // app.post("/webhook/hyperswitch", async (req, reply) => {
  //   const event = req.body as any;
  //   const client = await pool.connect();

  //   try {
  //     const paymentObject = event.content?.object;
  //     const eventType = event.event_type;

  //     if (eventType !== "payment_succeeded")
  //       return reply.send({ ignored: true });

  //     const paymentId = paymentObject.payment_id;
  //     const bookingId = paymentObject.metadata?.booking_id;

  //     if (!bookingId)
  //       return reply.status(400).send({ error: "Missing booking_id metadata" });

  //     await client.query("BEGIN");
  //     // 1️⃣ Idempotency check
  //     const existing = await client.query(
  //       `SELECT 1 FROM payments WHERE hyperswitch_payment_id = $1`,
  //       [paymentId]
  //     );

  //     if (existing.rows.length > 0) {
  //       await client.query("ROLLBACK");
  //       return reply.send({ alreadyProcessed: true });
  //     }

  //     // 2️⃣ Store payment
  //     await client.query(
  //       `
  //       INSERT INTO payments
  //       (booking_id, hyperswitch_payment_id, amount, currency, status, raw_response)
  //       VALUES ($1, $2, $3, $4, $5, $6)
  //       `,
  //       [
  //         bookingId,
  //         paymentId,
  //         paymentObject.amount,
  //         paymentObject.currency,
  //         "succeeded",
  //         event,
  //       ]
  //     );

  //     // 3️⃣ Update booking
  //     await client.query(
  //       `
  //       UPDATE bookings
  //       SET status = 'paid',
  //           payment_processed = true,
  //           payment_id = $1,
  //           updated_at = NOW()
  //       WHERE id = $2
  //       `,
  //       [paymentId, bookingId]
  //     );

  //     await client.query("COMMIT");
  //     client.release();

  //     // 🚀 4️⃣ EXECUTE BLNK FLOW AFTER DB COMMIT
  //     const amount = paymentObject.amount / 100;
  //     await Transactions.create({
  //       amount: amount,
  //       precision: 1,
  //       currency: "MAD",
  //       source: "@World",
  //       destinations: [
  //         { identifier: "@EscrowPool", distribution: "left" },
  //         { identifier: "@PlatformFees", distribution: "20%" }
  //       ],
  //       reference: `${bookingId}_payin`,
  //       allow_overdraft: true,
  //       description: `Split the incoming payment for ${bookingId} between EscrowPool and PlatformFees`
  //     });
  //     await Transactions.create({
  //       amount: amount,
  //       precision: 1,
  //       currency: "POINTS",
  //       source: "@TokenPool",
  //       destination: balances.clientBalanceId,
  //       reference: `${bookingId}_client_topup`,
  //       description: `Topup client balance with points for ${bookingId}`,
  //       allow_overdraft: true
  //     });
  //     const fullLedgerFlow = {
  //       atomic: true,
  //       inflight: true,
  //       transactions: [
  //         // Client payback (burn)
  //         {
  //           amount,
  //           precision: 1,
  //           currency: "POINTS",
  //           source: balances.clientBalanceId,
  //           destination: "@TokenPool",
  //           reference: `${bookingId}_client_payback`,
  //           description: `Client payback for ${bookingId}`,
  //         },
  //         // Escrow → Merchant payout
  //         {
  //           amount: amount * 0.8,
  //           precision: 1,
  //           currency: "MAD",
  //           source: "@EscrowPool",
  //           destination: balances.merchantBalanceId,
  //           reference: `${bookingId}_escrow_to_merchant`,
  //           description: `Transfer from EscrowPool to Merchant balance for ${bookingId}`,
  //         }
  //       ]
  //     };

  //     try {
  //       await Transactions.createBulk(fullLedgerFlow);
  //     } catch (ledgerError) {
  //       console.error("BLNK transaction failed:", ledgerError);

  //       // 🚨 REFUND BECAUSE INTERNAL FAILURE
  //       await fetch(
  //         `http://hyperswitch-hyperswitch-server-1:8080/payments/${paymentId}/refunds`,
  //         {
  //           method: "POST",
  //           headers: {
  //             "Content-Type": "application/json",
  //             "api-key": process.env.HS_SND_API_KEY as string,
  //           },
  //           body: JSON.stringify({
  //             amount: paymentObject.amount
  //           })
  //         }
  //       );

  //       return reply.status(500).send({
  //         error: "Ledger failed — payment refunded"
  //       });
  //     }

  //     return reply.send({ success: true });

  //   } catch (err) {
  //     await client.query("ROLLBACK");
  //     client.release();
  //     console.error("Webhook error:", err);
  //     reply.status(500).send({ error: "Webhook failed" });
  //   }
  // });

//   await initDB();
//   app.listen({ port: 3000, host: "0.0.0.0" }, () => {
//     console.log("🚀 Server running on http://localhost:3000");
//   });
// }

// start();






















// // ✅ dotenv MUST be first — before any process.env usage
// import dotenv from "dotenv";
// dotenv.config();

// import { BlnkInit } from "@blnkfinance/blnk-typescript";
// import { bootstrap } from "./ledger";
// import Fastify, { FastifyRequest } from "fastify";
// import { pool, initDB } from "./db";
// import fastifyStatic from "@fastify/static";
// import fastifyRateLimit from "@fastify/rate-limit";
// import fastifyCors from "@fastify/cors";
// import path from "path";
// import crypto from "crypto";

// // ─────────────────────────────────────────
// // BLNK CLIENT
// // ─────────────────────────────────────────
// const blnk = BlnkInit(process.env.SEC_API_KEY as string, {
//   baseUrl: "http://server:5001",
// });
// const { Ledgers, LedgerBalances, Transactions } = blnk;
// export { Ledgers, LedgerBalances, Transactions };

// // ─────────────────────────────────────────
// // FASTIFY
// // ─────────────────────────────────────────
// const app = Fastify({ logger: true });

// // ✅ Capture raw body before Fastify parses it
// // This runs for every request but only stores on the request object
// app.addHook("preParsing", (req, reply, payload, done) => {
//   const chunks: string[] = [];
//   payload.on("data", (chunk: Buffer | string) => {
//     chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
//   });
//   payload.on("end", () => {
//     (req as any).rawBody = chunks.join("");
//   });
//   done(null, payload);
// });

// app.register(fastifyCors, {
//   origin: ["https://localhost:3443", "http://localhost:3000"],
//   methods: ["GET", "POST"],
// });

// // Rate limiting — max 100 requests per minute per IP
// app.register(fastifyRateLimit, {
//   max: 100,
//   timeWindow: "1 minute",
// });

// app.register(fastifyStatic, {
//   root: path.join(__dirname, "../public"),
// });

// // ─────────────────────────────────────────
// // HELPERS
// // ─────────────────────────────────────────
// const HS_URL = "http://hyperswitch-hyperswitch-server-1:8080";

// function verifyHyperswitchSignature(
//   rawBody: string,
//   signatureHeader: string,
//   secret: string
// ): boolean {
//   try {
//     const hmac = crypto.createHmac("sha512", secret);
//     hmac.update(rawBody);
//     const expectedSignature = hmac.digest("hex");
//     return crypto.timingSafeEqual(
//       Buffer.from(signatureHeader),
//       Buffer.from(expectedSignature)
//     );
//   } catch {
//     return false;
//   }
// }

// async function triggerRefund(paymentId: string, amount: number, bookingId?: string) {
//   try {
//     await fetch(`${HS_URL}/refunds`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "api-key": process.env.HS_SND_API_KEY as string,
//       },
//       body: JSON.stringify({
//         amount,
//         payment_id: paymentId,
//         refund_type: "instant",
//       }),
//     });
//     console.log(`✅ Refund triggered for payment ${paymentId}`);

//     if (bookingId) {
//       await pool.query(
//         `UPDATE bookings SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
//         [bookingId]
//       );
//     }

//   } catch (refundError) {
//     console.error(
//       `CRITICAL: Refund failed for payment ${paymentId}. Manual action required.`,
//       refundError
//     );
//   }
// }

// // ─────────────────────────────────────────
// // BOOTSTRAP
// // ─────────────────────────────────────────
// let balances: any;

// async function start() {
//   if (process.env.RUN_BOOTSTRAP === "true") {
//     console.log("🚀 Running bootstrap...");
//     balances = await bootstrap();
//   } else {
//     console.log("♻️ Skipping bootstrap");
//   }

//   // ─────────────────────────────────────────
//   // ROUTES
//   // ─────────────────────────────────────────

//   app.get("/config", async (req, reply) => {
//     return { publishableKey: process.env.HS_PNK_API_KEY };
//   });

//   // ── 1️⃣ Create booking ──────────────────
//   app.post("/create-booking", async (req, reply) => {
//     const { amount, user_id, host_id } = req.body as {
//       amount: number;
//       user_id: string;
//       host_id: string;
//     };

//     const client = await pool.connect();
//     try {
//       await client.query("BEGIN");

//       const bookingResult = await client.query(
//         `INSERT INTO bookings (user_id, host_id, amount)
//          VALUES ($1, $2, $3)
//          RETURNING id`,
//         [user_id, host_id, amount * 100]
//       );

//       const bookingId = bookingResult.rows[0].id;

//       const response = await fetch(`${HS_URL}/payments`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "api-key": process.env.HS_SND_API_KEY as string,
//         },
//         body: JSON.stringify({
//           amount: amount * 100,
//           currency: "MAD",
//           confirm: false,
//           metadata: { booking_id: bookingId },
//         }),
//       });

//       const data = await response.json();
//       if (!data.client_secret)
//         throw new Error("Failed to create Hyperswitch payment");

//       await client.query("COMMIT");
//       return reply.send({ bookingId, clientSecret: data.client_secret });
//     } catch (err) {
//       await client.query("ROLLBACK");
//       console.error(err);
//       return reply.status(500).send({ error: "Booking creation failed" });
//     } finally {
//       client.release();
//     }
//   });

//   // ── 2️⃣ Hyperswitch webhook ─────────────
//   app.post("/webhook/hyperswitch", async (req, reply) => {
//     // ✅ 1. Verify signature
//     const signatureHeader = req.headers["x-webhook-signature-512"] as string;
//     const webhookSecret = process.env.HS_WEBHOOK_SECRET as string;
//     const rawBody = (req as any).rawBody as string;

//     console.log("signature:", signatureHeader ? "present" : "missing");
//     console.log("secret:", webhookSecret ? "present" : "missing");
//     console.log("rawBody:", rawBody ? rawBody : "missing");

//     if (!signatureHeader || !webhookSecret || !rawBody) {
//       console.error("Missing signature, secret, or raw body");
//       return reply.status(401).send({ error: "Unauthorized" });
//     }

//     const isValid = verifyHyperswitchSignature(rawBody, signatureHeader, webhookSecret);
//     if (!isValid) {
//       console.error("Invalid webhook signature — request rejected");
//       return reply.status(401).send({ error: "Invalid signature" });
//     }

//     const event = req.body as any;
//     const eventType = event.event_type;
//     const paymentObject = event.content?.object;

//     // ✅ 2. Only handle payment_succeeded
//     if (eventType !== "payment_succeeded")
//       return reply.send({ ignored: true });

//     const paymentId = paymentObject?.payment_id;
//     const bookingId = paymentObject?.metadata?.booking_id;

//     if (!paymentId || !bookingId)
//       return reply.status(400).send({ error: "Missing payment_id or booking_id" });

//     // ✅ 3. DB operations
//     const client = await pool.connect();
//     try {
//       await client.query("BEGIN");

//       const existing = await client.query(
//         `SELECT 1 FROM payments WHERE hyperswitch_payment_id = $1`,
//         [paymentId]
//       );
//       if (existing.rows.length > 0) {
//         await client.query("ROLLBACK");
//         return reply.send({ alreadyProcessed: true });
//       }

//       await client.query(
//         `INSERT INTO payments
//          (booking_id, hyperswitch_payment_id, amount, currency, status, raw_response)
//          VALUES ($1, $2, $3, $4, $5, $6)`,
//         [
//           bookingId,
//           paymentId,
//           paymentObject.amount,
//           paymentObject.currency,
//           "succeeded",
//           event,
//         ]
//       );

//       await client.query(
//         `UPDATE bookings
//          SET status = 'paid',
//              payment_processed = true,
//              payment_id = $1,
//              updated_at = NOW()
//          WHERE id = $2`,
//         [paymentId, bookingId]
//       );

//       await client.query("COMMIT");
//     } catch (err) {
//       await client.query("ROLLBACK");
//       console.error("Webhook DB error:", err);
//       return reply.status(500).send({ error: "Webhook DB failed" });
//     } finally {
//       client.release();
//     }

//     // ✅ 4. Blnk ledger flow
//     const amount = paymentObject.amount / 100;
//     console.log("🚀 Starting Blnk ledger flow for booking:", bookingId);
//     try {
//       const result = await Transactions.create({
//         amount,
//         precision: 1,
//         currency: "MAD",
//         source: "@World",
//         destinations: [
//           { identifier: "@EscrowPool", distribution: "left" },
//           { identifier: "@PlatformFees", distribution: "20%" },
//         ],
//         reference: `${bookingId}_payin`,
//         allow_overdraft: true,
//         description: `Split payment for booking ${bookingId}`,
//       });
//       console.log("Blnk payin result:", JSON.stringify(result));
//       if (result?.status !== 200) {
//         throw new Error(`Blnk payin failed: ${JSON.stringify(result)}`);
//       }

//       const topup = await Transactions.create({
//         amount,
//         precision: 1,
//         currency: "POINTS",
//         source: "@TokenPool",
//         destination: balances.clientBalanceId,
//         reference: `${bookingId}_client_topup`,
//         description: `Points topup for booking ${bookingId}`,
//         allow_overdraft: true,
//       });
//       if (topup?.status !== 200) {
//         throw new Error(`Blnk transaction failed: ${JSON.stringify(topup)}`);
//       }

//       const bulk = await Transactions.createBulk({
//         atomic: true,
//         inflight: true,
//         transactions: [
//           {
//             amount,
//             precision: 1,
//             currency: "POINTS",
//             source: balances.clientBalanceId,
//             destination: "@TokenPool",
//             reference: `${bookingId}_client_payback`,
//             description: `Client points burn for booking ${bookingId}`,
//           },
//           {
//             amount: amount * 0.8,
//             precision: 1,
//             currency: "MAD",
//             source: "@EscrowPool",
//             destination: balances.merchantBalanceId,
//             reference: `${bookingId}_escrow_to_merchant`,
//             description: `Escrow → Merchant payout for booking ${bookingId}`,
//           },
//         ],
//       });
//       if (bulk?.status !== 200) {
//         throw new Error(`Blnk transaction failed: ${JSON.stringify(bulk)}`);
//       }
//     } catch (ledgerError) {
//       console.error("Blnk transaction failed:", ledgerError);
//       await triggerRefund(paymentId, paymentObject.amount, bookingId);
//       return reply.status(500).send({ error: "Ledger failed — payment refunded" });
//     }

//     return reply.send({ success: true });
//   });

//   // ─────────────────────────────────────────
//   // START SERVER
//   // ─────────────────────────────────────────
//   await initDB();
//   await app.listen({ port: 3000, host: "0.0.0.0" });
//   console.log("🚀 Server running on http://localhost:3000");
// }

// start();














// ✅ dotenv MUST be first — before any process.env usage
import dotenv from "dotenv";
dotenv.config();

import { BlnkInit } from "@blnkfinance/blnk-typescript";
import { bootstrap } from "./ledger";
import Fastify from "fastify";
import { pool, initDB } from "./db";
import fastifyStatic from "@fastify/static";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyCors from "@fastify/cors";
import path from "path";
import crypto from "crypto";

// ─────────────────────────────────────────
// BLNK CLIENT
// ─────────────────────────────────────────
const blnk = BlnkInit(process.env.SEC_API_KEY as string, {
  baseUrl: "http://server:5001",
});
const { Ledgers, LedgerBalances, Transactions } = blnk;
export { Ledgers, LedgerBalances, Transactions };

// ─────────────────────────────────────────
// FASTIFY
// ─────────────────────────────────────────
const app = Fastify({ logger: true });

// ✅ Capture raw body before Fastify parses it
app.addHook("preParsing", (req, reply, payload, done) => {
  const chunks: string[] = [];
  payload.on("data", (chunk: Buffer | string) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  });
  payload.on("end", () => {
    (req as any).rawBody = chunks.join("");
  });
  done(null, payload);
});

app.register(fastifyCors, {
  origin: ["https://localhost:3443", "http://localhost:3000"],
  methods: ["GET", "POST"],
});

app.register(fastifyRateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

app.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
});

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
const HS_URL = "http://hyperswitch-hyperswitch-server-1:8080";

function verifyHyperswitchSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  try {
    const hmac = crypto.createHmac("sha512", secret);
    hmac.update(rawBody);
    const expectedSignature = hmac.digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

async function triggerRefund(paymentId: string, amount: number, bookingId?: string){
  try {
    await fetch(`${HS_URL}/refunds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.HS_SND_API_KEY as string,
      },
      body: JSON.stringify({
        amount,
        payment_id: paymentId,
        refund_type: "instant",
      }),
    });
    console.log(`✅ Refund triggered for payment ${paymentId}`);

    if (bookingId) {
      await pool.query(
        `UPDATE bookings SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [bookingId]
      );
    }
  } catch (refundError) {
    console.error(
      `CRITICAL: Refund failed for payment ${paymentId}. Manual action required.`,
      refundError
    );
  }
}

// ✅ Reverse Blnk entries using transaction IDs stored at payment time
// Only reverses what actually succeeded — safe to call with nulls
async function reverseLedgerEntries(payinTxId: string | null, topupTxId: string | null, bookingId: string){
  console.log(`🔄 Reversing Blnk entries for booking ${bookingId}`);

  // Blnk reversal: POST /transactions/:id/refund
  const reverseUrl = (txId: string) =>
    `http://server:5001/refund-transaction/${txId}`;

  try {
    if (payinTxId) {
      const res = await fetch(reverseUrl(payinTxId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-blnk-key": `${process.env.SEC_API_KEY}`,
        }
      });
      const data = await res.json();
      console.log(`✅ Reversed payin tx ${payinTxId}:`, data);
    }

    if (topupTxId) {
      const res = await fetch(reverseUrl(topupTxId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-blnk-key": `${process.env.SEC_API_KEY}`,
        }
      });
      const data = await res.json();
      console.log(`✅ Reversed topup tx ${topupTxId}:`, data);
    }
  } catch (err) {
    console.error(
      `CRITICAL: Blnk reversal failed for booking ${bookingId}. Manual action required.`,
      err
    );
  }
}

// ─────────────────────────────────────────
// BOOTSTRAP
// ─────────────────────────────────────────
let balances: any;

async function start() {
  if (process.env.RUN_BOOTSTRAP === "true") {
    console.log("🚀 Running bootstrap...");
    balances = await bootstrap();
  } else {
    console.log("♻️ Skipping bootstrap");
  }

  // ─────────────────────────────────────────
  // ROUTES
  // ─────────────────────────────────────────

  app.get("/config", async (req, reply) => {
    return { publishableKey: process.env.HS_PNK_API_KEY };
  });

  // ── 1️⃣ Create booking ──────────────────
  app.post("/create-booking", async (req, reply) => {
    const { amount, user_id, host_id } = req.body as {
      amount: number;
      user_id: string;
      host_id: string;
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const bookingResult = await client.query(
        `INSERT INTO bookings (user_id, host_id, amount)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [user_id, host_id, amount * 100]
      );

      const bookingId = bookingResult.rows[0].id;

      const response = await fetch(`${HS_URL}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.HS_SND_API_KEY as string,
        },
        body: JSON.stringify({
          amount: amount * 100,
          currency: "MAD",
          confirm: false,
          metadata: { booking_id: bookingId },
        }),
      });

      const data = await response.json();
      if (!data.client_secret)
        throw new Error("Failed to create Hyperswitch payment");

      await client.query("COMMIT");
      return reply.send({ bookingId, clientSecret: data.client_secret });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      return reply.status(500).send({ error: "Booking creation failed" });
    } finally {
      client.release();
    }
  });

  // ── 2️⃣ Hyperswitch webhook ─────────────
  app.post("/webhook/hyperswitch", async (req, reply) => {

    // ✅ 1. Verify signature
    const signatureHeader = req.headers["x-webhook-signature-512"] as string;
    const webhookSecret = process.env.HS_WEBHOOK_SECRET as string;
    const rawBody = (req as any).rawBody as string;

    if (!signatureHeader || !webhookSecret || !rawBody) {
      console.error("Missing signature, secret, or raw body");
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const isValid = verifyHyperswitchSignature(rawBody, signatureHeader, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature — request rejected");
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const event = req.body as any;
    const eventType = event.event_type;
    const eventId = event.event_id;

    // ✅ 2. Store raw webhook event for audit trail + idempotency
    try {
      await pool.query(
        `INSERT INTO webhook_events (event_id, event_type, payload, processed)
         VALUES ($1, $2, $3, false)
         ON CONFLICT (event_id) DO NOTHING`,
        [eventId, eventType, event]
      );
    } catch (err) {
      console.error("Failed to store webhook event:", err);
    }

    const paymentObject = event.content?.object;

    // ── payment_succeeded ──────────────────
    if (eventType === "payment_succeeded") {
      const paymentId = paymentObject?.payment_id;
      const bookingId = paymentObject?.metadata?.booking_id;

      if (!paymentId || !bookingId)
        return reply.status(400).send({ error: "Missing payment_id or booking_id" });

      // ✅ 3. DB operations
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const existing = await client.query(
          `SELECT 1 FROM payments WHERE hyperswitch_payment_id = $1`,
          [paymentId]
        );
        if (existing.rows.length > 0) {
          await client.query("ROLLBACK");
          return reply.send({ alreadyProcessed: true });
        }

        await client.query(
          `INSERT INTO payments
           (booking_id, hyperswitch_payment_id, amount, currency, status, raw_response)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            bookingId,
            paymentId,
            paymentObject.amount,
            paymentObject.currency,
            "succeeded",
            event,
          ]
        );

        await client.query(
          `UPDATE bookings
           SET status = 'paid',
               payment_processed = true,
               payment_id = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [paymentId, bookingId]
        );

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Webhook DB error:", err);
        return reply.status(500).send({ error: "Webhook DB failed" });
      } finally {
        client.release();
      }

      // ✅ 4. Blnk ledger flow — track each tx ID as it succeeds
      const amount = paymentObject.amount / 100;
      let payinTxId: string | null = null;
      let topupTxId: string | null = null;
      console.log("EVEEEENT TYYYPE ==== ", eventType)
      console.log("🚀 Starting Blnk ledger flow for booking:", bookingId);
      try {
        // Split incoming payment → EscrowPool + PlatformFees
        const payinResult = await Transactions.create({
          amount,
          precision: 1,
          currency: "MAD",
          source: "@World",
          destinations: [
            { identifier: "@EscrowPool", distribution: "left" },
            { identifier: "@PlatformFees", distribution: "20%" },
          ],
          reference: `${bookingId}_payin`,
          allow_overdraft: true,
          description: `Split payment for booking ${bookingId}`,
        });
        if (payinResult?.status === 500)
          throw new Error(`Blnk payin failed: ${JSON.stringify(payinResult)}`);
        console.log("PAYIN DETAILS=== ", payinResult)
        payinTxId = payinResult.data?.transaction_id ?? null;

        // Topup client points
        const topupResult = await Transactions.create({
          amount,
          precision: 1,
          currency: "POINTS",
          source: "@TokenPool",
          destination: balances.clientBalanceId,
          reference: `${bookingId}_client_topup`,
          description: `Points topup for booking ${bookingId}`,
          allow_overdraft: true,
        });
        if (topupResult?.status === 500)
          throw new Error(`Blnk topup failed: ${JSON.stringify(topupResult)}`);
        topupTxId = topupResult.data?.transaction_id ?? null;

        // ✅ Save Blnk tx IDs to DB before the bulk call
        // so we can reverse them even if bulk fails
        await pool.query(
          `UPDATE payments
           SET blnk_payin_tx_id = $1, blnk_topup_tx_id = $2
           WHERE hyperswitch_payment_id = $3`,
          [payinTxId, topupTxId, paymentId]
        );

        // Atomic: client burns points + escrow pays merchant
        const bulkResult = await Transactions.createBulk({
          atomic: true,
          inflight: true,
          transactions: [
            {
              amount,
              precision: 1,
              currency: "POINTS",
              source: balances.clientBalanceId,
              destination: "@TokenPool",
              reference: `${bookingId}_client_payback`,
              description: `Client points burn for booking ${bookingId}`,
            },
            {
              amount: amount * 0.8,
              precision: 1,
              currency: "MAD",
              source: "@EscrowPool",
              destination: balances.merchantBalanceId,
              reference: `${bookingId}_escrow_to_merchant`,
              description: `Escrow → Merchant payout for booking ${bookingId}`,
            },
          ],
        });
        if (bulkResult?.status === 500)
          throw new Error(`Blnk bulk failed: ${bulkResult}`);

        // ✅ Mark webhook as processed
        await pool.query(
          `UPDATE webhook_events SET processed = true WHERE event_id = $1`,
          [eventId]
        );

      } catch (ledgerError) {
        console.error("Blnk transaction failed:", ledgerError);
        // Reverse whatever made it into Blnk
        await reverseLedgerEntries(payinTxId, topupTxId, bookingId);
        await triggerRefund(paymentId, paymentObject.amount, bookingId);
        return reply.status(500).send({ error: "Ledger failed — payment refunded" });
      }

      return reply.send({ success: true });
    }
    console.log("AFTEEEEER EVEEEENT TYYYPE ==== ", eventType)
    // ── refund.succeeded ──────────────────
    // Triggered when ANY refund completes — internal failure, client cancel, manual
    if (eventType === "refund_succeeded") {
      console.log("INSIDE REFUND SUCCEEDED ==== ", eventType)
      const refundObject = event.content?.object;
      const paymentId = refundObject?.payment_id;

      if (!paymentId)
        return reply.status(400).send({ error: "Missing payment_id in refund event" });

      // Look up the payment to get booking + Blnk tx IDs
      const paymentRow = await pool.query(
        `SELECT p.booking_id, p.blnk_payin_tx_id, p.blnk_topup_tx_id, b.status
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         WHERE p.hyperswitch_payment_id = $1`,
        [paymentId]
      );

      if (!paymentRow.rows.length) {
        console.warn(`refund.succeeded for unknown payment ${paymentId} — ignoring`);
        return reply.send({ ignored: true });
      }

      const { booking_id, blnk_payin_tx_id, blnk_topup_tx_id, status } = paymentRow.rows[0];
      console.log("PAYIN_TX DETAILS ====== ", blnk_payin_tx_id, status)
      console.log("TOPUP_TX DETAILS ====== ", blnk_topup_tx_id, status)
      // Skip if already refunded (idempotency)
      if (status === "refunded")
        return reply.send({ alreadyProcessed: true });

      // Reverse Blnk entries
      await reverseLedgerEntries(blnk_payin_tx_id, blnk_topup_tx_id, booking_id);

      // Update booking status
      await pool.query(
        `UPDATE bookings SET status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [booking_id]
      );

      // Update payment status
      await pool.query(
        `UPDATE payments SET status = 'refunded' WHERE hyperswitch_payment_id = $1`,
        [paymentId]
      );

      // Mark webhook as processed
      await pool.query(
        `UPDATE webhook_events SET processed = true WHERE event_id = $1`,
        [eventId]
      );

      console.log(`✅ Refund processed for payment ${paymentId}, booking ${booking_id}`);
      return reply.send({ success: true });
    }

    // ── payment_failed / payment_cancelled ─
    if (eventType === "payment_failed" || eventType === "payment_cancelled") {
      const paymentId = paymentObject?.payment_id;
      const bookingId = paymentObject?.metadata?.booking_id;

      if (bookingId) {
        await pool.query(
          `UPDATE bookings
           SET status = $1, updated_at = NOW()
           WHERE id = $2`,
          [eventType === "payment_failed" ? "failed" : "cancelled", bookingId]
        );
      }

      await pool.query(
        `UPDATE webhook_events SET processed = true WHERE event_id = $1`,
        [eventId]
      );

      console.log(`Payment ${eventType} for ${paymentId}`);
      return reply.send({ success: true });
    }

    // All other event types — already stored above, just acknowledge
    return reply.send({ ignored: true });
  });

  // ── Booking status (for frontend polling) ──
  // app.get("/booking/:id/status", async (req, reply) => {
  //   const { id } = req.params as { id: string };
  //   const result = await pool.query(
  //     `SELECT status FROM bookings WHERE id = $1`,
  //     [id]
  //   );
  //   if (!result.rows.length)
  //     return reply.status(404).send({ error: "Booking not found" });
  //   return reply.send({ status: result.rows[0].status });
  // });

  // ─────────────────────────────────────────
  // START SERVER
  // ─────────────────────────────────────────
  await initDB();
  await app.listen({ port: 3000, host: "0.0.0.0" });
  console.log("🚀 Server running on http://localhost:3000");
}

start();
