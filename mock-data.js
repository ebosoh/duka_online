// Seed data for the live auction platform Duka Online
const INITIAL_PRODUCTS = [
  {
    id: "prod-1",
    name: "Grogan Heavy-Duty Brake Pads (Pair)",
    price: 3200,
    liveCode: "A01",
    stock: 5,
    image: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=150"
  },
  {
    id: "prod-2",
    name: "Vintage Distressed Denim Jacket",
    price: 1800,
    liveCode: "B12",
    stock: 3,
    image: "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=150"
  },
  {
    id: "prod-3",
    name: "Wireless Noise-Canceling Earbuds Pro",
    price: 2500,
    liveCode: "C05",
    stock: 8,
    image: "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=150"
  },
  {
    id: "prod-4",
    name: "Premium Croc-Embossed Leather Handbag",
    price: 4500,
    liveCode: "D44",
    stock: 2,
    image: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=150"
  },
  {
    id: "prod-5",
    name: "Ultra-Fast Smart Sports Fitness Band",
    price: 1500,
    liveCode: "E09",
    stock: 12,
    image: "https://images.unsplash.com/photo-1575311373937-040b8e1fd5b6?w=150"
  }
];

const COLLECTION_POINTS = [
  { id: "hub-1", name: "Eldoret Main Hub", fee: 250, PochiPhone: "0722000001" },
  { id: "hub-2", name: "Kisumu Lakeside Depot", fee: 300, PochiPhone: "0722000002" },
  { id: "hub-3", name: "Kakamega Junction Office", fee: 280, PochiPhone: "0722000003" },
  { id: "hub-4", name: "Nyeri Central Point", fee: 200, PochiPhone: "0722000004" },
  { id: "hub-5", name: "Nairobi CBD Pick-up Centre", fee: 150, PochiPhone: "0722000005" },
  { id: "hub-6", name: "Mombasa GPO Office", fee: 350, PochiPhone: "0722000006" },
  { id: "hub-7", name: "Nakuru Highway Hub", fee: 220, PochiPhone: "0722000007" }
];

const COURIER_PROVIDERS = [
  { id: "cour-1", name: "G4S Secure Logistics", till: "402919" },
  { id: "cour-2", name: "Wells Fargo Courier", till: "883921" },
  { id: "cour-3", name: "Fargo Courier Ltd", till: "991024" },
  { id: "cour-4", name: "Speedaf East Africa", till: "557621" }
];

// Pre-seeded merged transaction data showing real-time matched SMS & Buyer Forms
const INITIAL_TRANSACTIONS = [
  {
    id: "TXN-9801",
    timestamp: "2026-05-27T12:15:30Z",
    // Buyer Form Input
    buyerName: "Michael Kiprop",
    buyerContact: "0712345678",
    collectionPoint: "Eldoret Main Hub",
    productName: "Grogan Heavy-Duty Brake Pads (Pair)",
    productId: "prod-1",
    // MPESA SMS Extracted Fields
    mpesaCode: "QRE58KJS6F",
    mpesaSender: "MICHAEL KIPROP",
    mpesaPhone: "254712345678",
    productAmountPaid: 3200,
    courierFeePaid: 250,
    totalPaid: 3450,
    paymentMethod: "Lipa na M-PESA Till",
    paymentRecipient: "Grogan Spares Zone (Till 562104)",
    // Splits calculated
    splitSeller: 3200,          // 100% of product price
    splitCourier: 125,          // 50% of courier fee
    splitPlatform: 125,         // 50% platform fee
    // Target Split Accounts (Private routing)
    sellerPochi: "0722987654",
    courierPochi: "0722000001",
    platformPochi: "0711000000",
    // Status
    status: "Delivered",        // Pending | Paid & Merged | Ready for Dispatch | Dispatched | Delivered
    matched: true
  },
  {
    id: "TXN-9802",
    timestamp: "2026-05-27T13:40:10Z",
    buyerName: "Amina Omondi",
    buyerContact: "0722987654",
    collectionPoint: "Kisumu Lakeside Depot",
    productName: "Wireless Noise-Canceling Earbuds Pro",
    productId: "prod-3",
    mpesaCode: "QRF12LMN9X",
    mpesaSender: "AMINA OMONDI",
    mpesaPhone: "254722987654",
    productAmountPaid: 2500,
    courierFeePaid: 300,
    totalPaid: 2800,
    paymentMethod: "Pochi la Biashara",
    paymentRecipient: "0722987654",
    splitSeller: 2500,
    splitCourier: 150,
    splitPlatform: 150,
    sellerPochi: "0722111111",
    courierPochi: "0722000002",
    platformPochi: "0711000000",
    status: "Dispatched",
    matched: true
  },
  {
    id: "TXN-9803",
    timestamp: "2026-05-27T15:02:00Z",
    buyerName: "John Njuguna",
    buyerContact: "0701122334",
    collectionPoint: "Nyeri Central Point",
    productName: "Ultra-Fast Smart Sports Fitness Band",
    productId: "prod-5",
    mpesaCode: "QRG89PQR7Y",
    mpesaSender: "JOHN NJUGUNA",
    mpesaPhone: "254701122334",
    productAmountPaid: 1500,
    courierFeePaid: 200,
    totalPaid: 1700,
    paymentMethod: "M-PESA Paybill",
    paymentRecipient: "Duka Online (Paybill 880100)",
    splitSeller: 1500,
    splitCourier: 100,
    splitPlatform: 100,
    sellerPochi: "0711555555",
    courierPochi: "0722000004",
    platformPochi: "0711000000",
    status: "Ready for Dispatch",
    matched: true
  },
  {
    id: "TXN-9804",
    timestamp: "2026-05-27T15:58:22Z",
    buyerName: "Grace Wanjiku",
    buyerContact: "0745678901",
    collectionPoint: "Kakamega Junction Office",
    productName: "Premium Croc-Embossed Leather Handbag",
    productId: "prod-4",
    mpesaCode: null,
    mpesaSender: null,
    mpesaPhone: null,
    productAmountPaid: 0,
    courierFeePaid: 0,
    totalPaid: 0,
    paymentMethod: null,
    paymentRecipient: null,
    splitSeller: 0,
    splitCourier: 0,
    splitPlatform: 0,
    sellerPochi: "0799000000",
    courierPochi: "0722000003",
    platformPochi: "0711000000",
    status: "Pending Payment",
    matched: false
  }
];

if (typeof module !== "undefined") {
  module.exports = {
    INITIAL_PRODUCTS,
    COLLECTION_POINTS,
    COURIER_PROVIDERS,
    INITIAL_TRANSACTIONS
  };
}
