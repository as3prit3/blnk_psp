# BLNK PSP

A payment processing prototype built with TypeScript and Fastify, integrating Hyperswitch payments with the BLNK ledger for handling booking payments, balances, and payouts.

## Features

* Create and track bookings
* Create payments through Hyperswitch
* Handle payment success webhooks
* Manage ledger transactions with BLNK
* Split incoming payments between escrow and platform fees
* Manage client and merchant balances
* Process bulk payouts
* Store booking and payment state in SQLite

## Tech Stack

* TypeScript
* Node.js
* Fastify
* SQLite
* BLNK
* Hyperswitch
* Axios

## Project Structure

```text
blnk_psp/
├── src/
│   ├── db.ts
│   ├── index.ts
│   └── ledger.ts
├── public/
├── BLNK/
├── package.json
├── tsconfig.json
└── .env
```

## Getting Started

Clone the repository:

```bash
git clone https://github.com/as3prit3/blnk_psp.git
cd blnk_psp
```

Install dependencies:

```bash
npm install
```

Configure your environment variables in `.env`.

Build the project:

```bash
npm run build
```

Start the server:

```bash
npm start
```

For development:

```bash
npm run dev
```

The server runs on:

```text
http://localhost:3000
```

## Payment Flow

1. A booking is created.
2. A payment is created through Hyperswitch.
3. The incoming amount is recorded in the BLNK ledger.
4. Funds are distributed between the escrow pool and platform fees.
5. A payment success webhook triggers the payout process.
6. A bulk transaction transfers the merchant's share and updates the booking state.

## Status

This project is a prototype for experimenting with payment processing, ledger management, and payout flows.
