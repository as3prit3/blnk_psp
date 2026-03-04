import fs from "fs";
import path from "path";
import { Ledgers, LedgerBalances } from "./index";

const BOOTSTRAP_PATH = path.resolve(__dirname, "../bootstrap.json");

interface BootstrapData {
  ledgerId: string;
  clientBalanceId: string;
  merchantBalanceId: string;
}

export async function bootstrap(): Promise<BootstrapData> {
  // If file exists → reus

  if (fs.existsSync(BOOTSTRAP_PATH)) {
    const raw = fs.readFileSync(BOOTSTRAP_PATH, "utf-8");
    console.log("♻️ Reusing existing ledger setup");
    return JSON.parse(raw);
  }

  console.log("🚀 Creating ledger & balances...");

  // Create ledger
  const ledger = await Ledgers.create({
    name: "App main ledger",
    meta_data: {
        description: "Ledger for all app transactions"
    }
  });

  const ledgerId = ledger.data?.ledger_id as string;

  // Create balances
  const clientBalance = await LedgerBalances.create({
    ledger_id: ledgerId,
    currency: "POINTS",
    meta_data: {
        description: "Initial balance for Alice Johnson",
        customer_name: `Alice Johnson`,
        customer_id: `alice-5678`,
        account_opened_date: `2024-01-01`,
        account_status: `active`,
    }
  });

  const merchantBalanceId = await LedgerBalances.create({
    ledger_id: ledgerId,
    currency: "MAD",
    meta_data: {
        description: "Initial balance for Merchant",
        customer_name: `Merchant`,
        customer_id: `merchant-1234`,
        account_opened_date: `2024-01-01`,
        account_status: `active`,
    }
  });

  const data: BootstrapData = {
    ledgerId,
    clientBalanceId: clientBalance.data?.balance_id as string,
    merchantBalanceId: merchantBalanceId.data?.balance_id as string,
  };

  fs.writeFileSync(BOOTSTRAP_PATH, JSON.stringify(data, null, 2));

  console.log("✅ Bootstrap completed and saved");

  return data;
}
