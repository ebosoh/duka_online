// Seed data for the live auction platform Duka Online
const INITIAL_PRODUCTS = [];

let COLLECTION_POINTS = [];

const COURIER_PROVIDERS = [
  { id: "cour-1", name: "G4S Secure Logistics", till: "402919" },
  { id: "cour-2", name: "Wells Fargo Courier", till: "883921" },
  { id: "cour-3", name: "Fargo Courier Ltd", till: "991024" },
  { id: "cour-4", name: "Speedaf East Africa", till: "557621" }
];

// Pre-seeded merged transaction data showing real-time matched SMS & Buyer Forms
const INITIAL_TRANSACTIONS = [];

if (typeof module !== "undefined") {
  module.exports = {
    INITIAL_PRODUCTS,
    COLLECTION_POINTS,
    COURIER_PROVIDERS,
    INITIAL_TRANSACTIONS
  };
}
