const gnzSurrounding = [
  { wallet: "0xwallet1" },
  { wallet: "0xwallet2" }
];

const buzzSurrounding = [
  { wallet: "0xwallet2" },
  { wallet: "0xwallet3" }
];

// Step 1: Extract wallet addresses
const gnzWallets = new Set(gnzSurrounding.map(t => t.wallet));
const buzzWallets = new Set(buzzSurrounding.map(t => t.wallet));

// Step 2: Find common wallets
const commonWallets = [...gnzWallets].filter(wallet => buzzWallets.has(wallet));

console.log("Wallets trading in both GNZ and BUZZ surrounding trades:");
console.log(commonWallets);
