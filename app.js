/**
 * DUKA ONLINE - CORE APPLICATION CONTROLLER (FLATTENED & LIVE-TUNED)
 * Optimized for TikTok/FB Live shopping, Pochi la Biashara peer-to-peer transfers, and instant courier matching.
 */

// ==========================================================================
// FIREBASE BACKEND CONFIGURATION
// ==========================================================================
// Hudson: Replace the placeholder config below with your actual Firebase Web Config
// keys from your Firebase Console (Project Settings > Web App).
const firebaseConfig = {
  apiKey: "AIzaSyC0mY4xsh1miGiHQ3QfD7hPce-l_lLDOm0",
  authDomain: "duka-online-154b7.firebaseapp.com",
  projectId: "duka-online-154b7",
  storageBucket: "duka-online-154b7.firebasestorage.app",
  messagingSenderId: "838362381550",
  appId: "1:838362381550:web:68cab39c90c1c3ef4c87ff",
  measurementId: "G-EXBGB8Q71R"
};

// Registered Merchants (Dynamic Live Show Channels)
const ACTIVE_SELLERS = [
  { id: "seller-1", name: "Grogan Spares Zone", PochiPhone: "0722987654", shortName: "Grogan", avatar: "🛠️", initItem: "Heavy-Duty Brake Pads (Pair)", initPrice: 3200 },
  { id: "seller-2", name: "Amina Omondi Fashion", PochiPhone: "0722111111", shortName: "Amina", avatar: "👗", initItem: "Vintage Denim Jacket", initPrice: 1800 },
  { id: "seller-3", name: "Velo Nicotine Shop", PochiPhone: "0711555555", shortName: "Velo", avatar: "🚬", initItem: "Velo Nicotine Pouches 2-Pack", initPrice: 1200 },
  { id: "seller-4", name: "TechBrain Gadgets Hub", PochiPhone: "0799000000", shortName: "Gadgets", avatar: "💻", initItem: "Wireless ANC Earbuds Pro", initPrice: 4500 }
];

// Global State Variables
let transactions = [];
let products = [];
let currentRole = "buyer"; 
let pendingSTKPush = null; 
let deferredInstallPrompt = null; 
let db = null; // Firebase Firestore Reference
let firestoreUnsubscribe = null; // Firestore listener teardown
let selectedMerchantId = "seller-1"; // Active channel buyer is paying
let activeSellerChannel = "0722987654"; // Pochi phone number of active seller dashboard

const GA4_PROPERTY_ID = "G-FS40Z82Q3E"; // Pre-saved GA4 ID

// ==========================================================================
// INITIALIZATION & LIFECYCLE
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initPWA();
  initAnalytics();
  initFirebase();
  loadData();
  setupEventListeners();
  populateDropdowns();
  switchRole("buyer"); // Default to buyer view
});

// PWA & Service Worker registration
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js")
        .then((reg) => console.log("[PWA] Service Worker registered in root:", reg.scope))
        .catch((err) => console.error("[PWA] Service Worker registration failed:", err));
    });
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const installBanner = document.getElementById("pwa-install-banner");
    if (installBanner) installBanner.style.display = "flex";
  });
}

// GA4 Hook
function initAnalytics() {
  const propertyId = GA4_PROPERTY_ID || new URLSearchParams(window.location.search).get("ga4");
  if (propertyId) {
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${propertyId}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', propertyId);
  }
}

function trackEvent(eventName, eventParams = {}) {
  console.log(`[GA4 Event] ${eventName}:`, eventParams);
  if (typeof gtag === "function") {
    gtag("event", eventName, eventParams);
  }
}

// Initialize Firebase Cloud Backend (with local fallback)
function initFirebase() {
  if (typeof firebase !== "undefined" && firebaseConfig.projectId) {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      console.log("[Firebase Backend] Cloud Firestore initialized successfully.");
      showToast("Firebase Cloud Connected! Real-time syncing active.", "success");
    } catch (err) {
      console.error("[Firebase Backend] Initialization failed:", err);
      showToast("Firebase initialization error. Running in local simulation mode.", "error");
    }
  } else {
    console.log("[Firebase Backend] Config empty. Running in simulated local-fallback mode.");
  }
}

// Load seed data or subscribe to Firestore live sync
function loadData() {
  if (db) {
    if (firestoreUnsubscribe) firestoreUnsubscribe();
    
    // Listen to changes on "transactions" collection in real time
    firestoreUnsubscribe = db.collection("transactions")
      .orderBy("timestamp", "desc")
      .onSnapshot((snapshot) => {
        let oldLength = transactions.length;
        transactions = [];
        snapshot.forEach((doc) => {
          transactions.push({ firestoreId: doc.id, ...doc.data() });
        });
        console.log(`[Firebase Backend] Received ${transactions.length} sync logs.`);
        
        // Trigger live audio/visual banner alert for new matched transaction belonging to active channel
        if (transactions.length > oldLength && oldLength > 0) {
          const latest = transactions[0];
          if (latest.matched && (latest.merchantPhone === activeSellerChannel)) {
            triggerFomoNotification(latest);
          }
        }
        
        renderApp();
      }, (error) => {
        console.error("[Firebase Backend] Real-time sync error:", error);
        loadLocalFallback();
      });
  } else {
    loadLocalFallback();
  }
}

// Fallback logic using LocalStorage
function loadLocalFallback() {
  const storedTxns = localStorage.getItem("duka_transactions");
  if (storedTxns) {
    transactions = JSON.parse(storedTxns);
  } else if (typeof INITIAL_TRANSACTIONS !== "undefined") {
    transactions = INITIAL_TRANSACTIONS.map((txn) => {
      const seedSeller = ACTIVE_SELLERS[0];
      return {
        ...txn,
        merchantId: seedSeller.id,
        merchantName: seedSeller.name,
        merchantPhone: seedSeller.PochiPhone
      };
    });
    saveLocalFallback();
  }
}

function saveLocalFallback() {
  localStorage.setItem("duka_transactions", JSON.stringify(transactions));
}

// Populate dropdown options
function populateDropdowns() {
  // Populate Buyer Checkout Seller Selector
  const buyerSellerSelect = document.getElementById("checkout-live-seller");
  if (buyerSellerSelect) {
    buyerSellerSelect.innerHTML = "";
    ACTIVE_SELLERS.forEach((seller) => {
      const option = document.createElement("option");
      option.value = seller.id;
      option.textContent = `${seller.name} (${seller.avatar})`;
      buyerSellerSelect.appendChild(option);
    });
  }

  // Populate Seller Channel Filter Selector
  const sellerChannelSelector = document.getElementById("seller-channel-selector");
  if (sellerChannelSelector) {
    sellerChannelSelector.innerHTML = "";
    ACTIVE_SELLERS.forEach((seller) => {
      const option = document.createElement("option");
      option.value = seller.PochiPhone;
      option.textContent = `${seller.name} (${seller.PochiPhone})`;
      sellerChannelSelector.appendChild(option);
    });
  }

  // Populate Collection Points
  const collectionSelect = document.getElementById("checkout-collection-point");
  if (collectionSelect && collectionSelect.options.length <= 1) {
    COLLECTION_POINTS.forEach((hub) => {
      const option = document.createElement("option");
      option.value = hub.id;
      option.textContent = `${hub.name} (+ KES ${hub.fee})`;
      collectionSelect.appendChild(option);
    });
  }
}

// ==========================================================================
// VIEWS ROUTER & ROLE SWITCHER
// ==========================================================================
function switchRole(role) {
  currentRole = role;
  
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.role === role);
  });

  document.querySelectorAll(".view-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `${role}-view`);
  });

  trackEvent("role_view_changed", { role: role });

  if (role === "buyer") {
    document.body.style.backgroundColor = "var(--bg-light)";
  } else {
    document.body.style.backgroundColor = "var(--bg-dark)";
  }

  renderApp();
}

function renderApp() {
  if (currentRole === "buyer") {
    renderBuyerPortal();
  } else if (currentRole === "seller") {
    renderSellerDashboard();
  } else if (currentRole === "courier") {
    renderCourierDashboard();
  }
}

// ==========================================================================
// BUYER LIVE CHECKOUT FLOW (Direct Pochi Routing)
// ==========================================================================
function renderBuyerPortal() {
  const sellerSelect = document.getElementById("checkout-live-seller");
  if (!sellerSelect) return;

  const seller = ACTIVE_SELLERS.find((s) => s.id === sellerSelect.value) || ACTIVE_SELLERS[0];
  
  // Update streamer welcome details
  const streamerName = document.getElementById("streamer-name-tag");
  if (streamerName) {
    streamerName.textContent = `Checkout for: ${seller.name}`;
  }
}

function handleCheckoutSellerChange() {
  const sellerSelect = document.getElementById("checkout-live-seller");
  if (!sellerSelect) return;

  const seller = ACTIVE_SELLERS.find((s) => s.id === sellerSelect.value);
  if (seller) {
    // Autopopulate fields with selected seller's active demo values
    document.getElementById("buyer-form-item-name").value = seller.initItem;
    document.getElementById("buyer-form-bid-price").value = seller.initPrice;
    
    showToast(`Paying Seller Channel: ${seller.name}`, "success");
    
    renderBuyerPortal();
    updateCheckoutPricing();
  }
}

function updateCheckoutPricing() {
  const bidPriceInput = document.getElementById("buyer-form-bid-price");
  const collectionSelect = document.getElementById("checkout-collection-point");
  
  if (!bidPriceInput || !collectionSelect) return;

  const bidPrice = parseFloat(bidPriceInput.value) || 0;
  const selectedHubId = collectionSelect.value;
  const hub = COLLECTION_POINTS.find((h) => h.id === selectedHubId);
  const deliveryFee = hub ? hub.fee : 0;
  const totalPrice = bidPrice + deliveryFee;

  document.getElementById("breakdown-prod-price").textContent = `KES ${bidPrice.toLocaleString()}`;
  document.getElementById("breakdown-delivery-fee").textContent = `KES ${deliveryFee.toLocaleString()}`;
  document.getElementById("breakdown-total-price").textContent = `KES ${totalPrice.toLocaleString()}`;
}

// Trigger STK push prompt for buyer
function triggerBuyerCheckout(event) {
  event.preventDefault();
  
  const name = document.getElementById("buyer-form-name").value.trim();
  const contact = document.getElementById("buyer-form-contact").value.trim();
  const sellerSelect = document.getElementById("checkout-live-seller");
  const itemName = document.getElementById("buyer-form-item-name").value.trim();
  const bidPrice = parseFloat(document.getElementById("buyer-form-bid-price").value) || 0;
  const hubId = document.getElementById("checkout-collection-point").value;

  if (!name || !contact || !sellerSelect.value || !itemName || bidPrice <= 0 || !hubId) {
    showToast("Please fill in all Checkout details!", "error");
    return;
  }

  const seller = ACTIVE_SELLERS.find((s) => s.id === sellerSelect.value);
  const hub = COLLECTION_POINTS.find((h) => h.id === hubId);
  
  pendingSTKPush = {
    buyerName: name,
    buyerContact: contact,
    merchantId: seller.id,
    merchantName: seller.name,
    merchantPhone: seller.PochiPhone,
    productName: itemName,
    productId: "custom",
    productPrice: bidPrice,
    deliveryFee: hub.fee,
    totalPaid: bidPrice + hub.fee,
    collectionPoint: hub.name
  };

  trackEvent("checkout_stk_initiated", {
    sellerName: seller.name,
    itemName: itemName,
    totalAmount: pendingSTKPush.totalPaid
  });

  const modal = document.getElementById("stk-push-modal");
  const modalPromptText = document.getElementById("stk-prompt-text");
  
  if (modal && modalPromptText) {
    modalPromptText.innerHTML = `Do you want to pay <strong>KES ${pendingSTKPush.totalPaid.toLocaleString()}</strong> directly to <strong>Pochi la Biashara ${seller.name} (${seller.PochiPhone})</strong>? <br><br>Enter your M-PESA PIN below to confirm payment:`;
    document.getElementById("stk-pin-field").value = "";
    modal.classList.add("active");
  }
}

// Confirm checkout
function confirmSimulatedPayment() {
  const pinField = document.getElementById("stk-pin-field");
  if (!pinField || pinField.value.length < 4) {
    showToast("Please enter a valid 4-digit M-PESA PIN!", "error");
    return;
  }

  document.getElementById("stk-push-modal").classList.remove("active");
  showToast("STK Push Request processing...", "success");

  setTimeout(() => {
    const buyerData = pendingSTKPush;
    if (!buyerData) return;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "QR" + Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    
    const simulatedSMS = `${code} Confirmed. Ksh${buyerData.totalPaid.toLocaleString()}.00 sent to Pochi la Biashara ${buyerData.merchantName.toUpperCase()} ${buyerData.merchantPhone} on ${new Date().toLocaleDateString("en-KE")} at ${new Date().toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" })}. New M-PESA balance is Ksh154,200.00. Transaction cost Ksh0.00.`;

    const parsedSMS = MpesaParser.parseSMS(simulatedSMS);
    
    if (parsedSMS) {
      const mergedTxn = MpesaParser.mergeTransaction(parsedSMS, buyerData);
      
      mergedTxn.merchantId = buyerData.merchantId;
      mergedTxn.merchantName = buyerData.merchantName;
      mergedTxn.merchantPhone = buyerData.merchantPhone;

      if (db) {
        db.collection("transactions").add(mergedTxn)
          .then((docRef) => {
            console.log("[Firebase] Transaction uploaded:", docRef.id);
            showToast(`Payment Approved! Ref: ${code}`, "success");
            showToast(`SMS Auto-Merged with ${buyerData.collectionPoint} Destination.`, "courier");
          })
          .catch((err) => {
            console.error("[Firebase] Upload failed, falling back:", err);
            transactions.unshift(mergedTxn);
            saveLocalFallback();
            renderApp();
          });
      } else {
        transactions.unshift(mergedTxn);
        saveLocalFallback();
        
        if (mergedTxn.merchantPhone === activeSellerChannel) {
          triggerFomoNotification(mergedTxn);
        }
        
        renderApp();
        showToast(`Payment Approved! Ref: ${code}`, "success");
        showToast(`SMS Auto-Merged with ${buyerData.collectionPoint} Destination.`, "courier");
      }

      const smsTextarea = document.getElementById("sms-input-field");
      if (smsTextarea) {
        smsTextarea.value = simulatedSMS;
      }

      trackEvent("payment_completed", {
        transactionId: mergedTxn.id,
        amount: mergedTxn.totalPaid,
        seller: buyerData.merchantName
      });

      // Clear forms
      document.getElementById("buyer-form-name").value = "";
      document.getElementById("buyer-form-contact").value = "";
      document.getElementById("buyer-form-item-name").value = "";
      document.getElementById("buyer-form-bid-price").value = "";
      document.getElementById("checkout-collection-point").selectedIndex = 0;
      updateCheckoutPricing();

      pendingSTKPush = null;
    }
  }, 1200);
}

// ==========================================================================
// SELLER MULTI-MERCHANT DASHBOARD
// ==========================================================================
function handleSellerChannelChange() {
  const sellerChannelSelector = document.getElementById("seller-channel-selector");
  if (sellerChannelSelector) {
    activeSellerChannel = sellerChannelSelector.value;
    const seller = ACTIVE_SELLERS.find(s => s.PochiPhone === activeSellerChannel);
    showToast(`Switched active matching channel to: ${seller.name}`, "success");
    renderSellerDashboard();
  }
}

function renderSellerDashboard() {
  const merchantTxns = transactions.filter((t) => t.merchantPhone === activeSellerChannel);

  let totalProductSales = 0;
  let totalPlatformFees = 0;
  let totalCourierEarnings = 0;

  merchantTxns.forEach((t) => {
    if (t.matched) {
      totalProductSales += t.productAmountPaid;
      totalPlatformFees += t.splitPlatform;
      totalCourierEarnings += t.splitCourier;
    }
  });

  const sellerSalesVal = document.getElementById("seller-sales-value");
  const platformFeesVal = document.getElementById("platform-fees-value");
  const courierEarningsVal = document.getElementById("courier-earnings-value");

  if (sellerSalesVal) sellerSalesVal.textContent = `KES ${totalProductSales.toLocaleString()}`;
  if (platformFeesVal) platformFeesVal.textContent = `KES ${totalPlatformFees.toLocaleString()}`;
  if (courierEarningsVal) courierEarningsVal.textContent = `KES ${totalCourierEarnings.toLocaleString()}`;

  const tableBody = document.getElementById("seller-txn-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  if (merchantTxns.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-dark-secondary);">No payments matched for this channel yet. Live show is waiting...</td></tr>`;
    return;
  }

  merchantTxns.forEach((txn) => {
    tableBody.innerHTML += `
      <tr>
        <td><strong style="color:#FFF;">${txn.mpesaCode || "PENDING"}</strong></td>
        <td>
          <div style="font-weight: 600;">${txn.buyerName}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">${txn.buyerContact}</div>
        </td>
        <td>
          <div style="font-weight: 700; color:var(--secondary-orange);">${txn.productName}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">Product: KES ${txn.productAmountPaid.toLocaleString()}</div>
        </td>
        <td><span style="font-family: 'Outfit'; font-weight:700;">KES ${txn.totalPaid.toLocaleString()}</span></td>
        <td>
          <div style="font-size: 0.8rem; font-weight:600; color: var(--primary-green);">Seller: KES ${txn.productAmountPaid.toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">Courier Split (50%): KES ${txn.splitCourier.toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--accent-red);">Platform Split (50%): KES ${txn.splitPlatform.toLocaleString()}</div>
        </td>
        <td>
          <span style="font-size:0.8rem; font-weight:500;">${txn.collectionPoint}</span>
        </td>
        <td>
          <span class="badge ${txn.matched ? 'matched' : 'unmatched'}">${txn.matched ? 'Merged' : 'SMS Pending'}</span>
        </td>
        <td>
          <span class="badge ${getStatusClass(txn.status)}">${txn.status}</span>
        </td>
        <td>
          <select class="action-dropdown" onchange="updateTransactionStatus('${txn.firestoreId || txn.id}', this.value)">
            <option value="Pending Payment" ${txn.status === "Pending Payment" ? "selected" : ""}>Pending Payment</option>
            <option value="Ready for Dispatch" ${txn.status === "Ready for Dispatch" ? "selected" : ""}>Ready for Dispatch</option>
            <option value="Dispatched" ${txn.status === "Dispatched" ? "selected" : ""}>Dispatched</option>
            <option value="Delivered" ${txn.status === "Delivered" ? "selected" : ""}>Delivered</option>
          </select>
        </td>
      </tr>
    `;
  });
}

// Trigger sound and FOMO notification banner on dashboard
function triggerFomoNotification(txn) {
  const banner = document.getElementById("payout-banner");
  const bannerText = document.getElementById("payout-banner-text");
  
  if (banner && bannerText) {
    bannerText.innerHTML = `💰 <strong>${txn.mpesaCode} Matched!</strong> ${txn.buyerName} paid KES ${txn.productAmountPaid.toLocaleString()} for ${txn.productName} (${txn.collectionPoint} hub).`;
    banner.classList.add("active");

    // Play a gentle ping sound using web audio API to alert the streamer
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.log("Audio alert blocked by browser autoplay settings.");
    }
  }
}

// Manual SMS Parser
function handleManualSMSParse() {
  const smsInputField = document.getElementById("sms-input-field");
  if (!smsInputField) return;

  const smsText = smsInputField.value.trim();
  if (!smsText) {
    showToast("Please paste a valid M-PESA SMS notification first!", "error");
    return;
  }

  const parsed = MpesaParser.parseSMS(smsText);
  if (!parsed) {
    showToast("Invalid M-PESA SMS layout! Check syntax.", "error");
    return;
  }

  let matchedSeller = ACTIVE_SELLERS.find(s => smsText.includes(s.PochiPhone) || smsText.toUpperCase().includes(s.name.toUpperCase()) || smsText.toUpperCase().includes(s.shortName.toUpperCase()));
  if (!matchedSeller) {
    matchedSeller = ACTIVE_SELLERS.find(s => s.PochiPhone === activeSellerChannel);
  }

  const pendingMatch = transactions.find((t) => 
    !t.matched && 
    t.merchantPhone === matchedSeller.PochiPhone &&
    (t.buyerName.toUpperCase().includes(parsed.mpesaSender.toUpperCase()) || 
     parsed.mpesaSender.toUpperCase().includes(t.buyerName.toUpperCase()) ||
     t.buyerContact.includes(parsed.mpesaPhone.substring(parsed.mpesaPhone.length - 9)))
  );

  if (pendingMatch) {
    const courierFee = Math.max(0, parsed.amountPaid - pendingMatch.productPrice);
    
    const updateData = {
      mpesaCode: parsed.mpesaCode,
      mpesaSender: parsed.mpesaSender,
      mpesaPhone: parsed.mpesaPhone,
      productAmountPaid: pendingMatch.productPrice,
      courierFeePaid: courierFee,
      totalPaid: parsed.amountPaid,
      paymentMethod: parsed.paymentMethod,
      paymentRecipient: parsed.paymentRecipient,
      splitSeller: pendingMatch.productPrice,
      splitCourier: Number((courierFee * 0.5).toFixed(2)),
      splitPlatform: Number((courierFee * 0.5).toFixed(2)),
      matched: true,
      status: "Ready for Dispatch"
    };

    if (db && pendingMatch.firestoreId) {
      db.collection("transactions").doc(pendingMatch.firestoreId).update(updateData)
        .then(() => {
          showToast(`Merged: Matched with pending Buyer ${pendingMatch.buyerName}!`, "success");
        })
        .catch((err) => console.error("[Firebase] Merge failed:", err));
    } else {
      Object.assign(pendingMatch, updateData);
      saveLocalFallback();
      
      if (pendingMatch.merchantPhone === activeSellerChannel) {
        triggerFomoNotification(pendingMatch);
      }
      
      renderApp();
      showToast(`Merged: Matched with pending Buyer ${pendingMatch.buyerName}!`, "success");
    }
  } else {
    const mockBuyerForm = {
      buyerName: parsed.mpesaSender,
      buyerContact: parsed.mpesaPhone,
      collectionPoint: "Nairobi CBD Pick-up Centre",
      productName: `Direct Sale: ${matchedSeller.initItem}`,
      productPrice: Math.round(parsed.amountPaid * 0.85),
      merchantId: matchedSeller.id,
      merchantName: matchedSeller.name,
      merchantPhone: matchedSeller.PochiPhone
    };

    const newTxn = MpesaParser.mergeTransaction(parsed, mockBuyerForm);
    newTxn.merchantId = matchedSeller.id;
    newTxn.merchantName = matchedSeller.name;
    newTxn.merchantPhone = matchedSeller.PochiPhone;
    
    if (db) {
      db.collection("transactions").add(newTxn)
        .then(() => showToast(`Direct SMS Processed for ${matchedSeller.name}!`, "success"))
        .catch((err) => console.error("[Firebase] Direct add failed:", err));
    } else {
      transactions.unshift(newTxn);
      saveLocalFallback();
      
      if (newTxn.merchantPhone === activeSellerChannel) {
        triggerFomoNotification(newTxn);
      }
      
      renderApp();
      showToast(`Direct SMS Processed for ${matchedSeller.name}!`, "success");
    }
  }

  smsInputField.value = "";
}

// Simulate an incoming buyer order live
function simulateLiveBuyerPurchase() {
  const seller = ACTIVE_SELLERS.find(s => s.PochiPhone === activeSellerChannel);
  
  const sampleNames = ["Joseph Ndwiga", "Mercy Chepngetich", "Silas Kamau", "Teresia Wambui", "Hassan Omar"];
  const sampleContacts = ["0712883921", "0722883910", "0701889922", "0745812920", "0733891024"];
  const sampleHubs = COLLECTION_POINTS;

  const randName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
  const randContact = sampleContacts[Math.floor(Math.random() * sampleContacts.length)];
  const randHub = sampleHubs[Math.floor(Math.random() * sampleHubs.length)];

  const mockOrder = {
    buyerName: randName,
    buyerContact: randContact,
    merchantId: seller.id,
    merchantName: seller.name,
    merchantPhone: seller.PochiPhone,
    productName: seller.initItem,
    productId: "custom",
    productPrice: seller.initPrice,
    deliveryFee: randHub.fee,
    totalPaid: seller.initPrice + randHub.fee,
    collectionPoint: randHub.name,
    timestamp: new Date().toISOString(),
    mpesaCode: null,
    matched: false,
    status: "Pending Payment"
  };

  if (db) {
    db.collection("transactions").add(mockOrder)
      .then(() => showToast(`Simulated Live Order placed by ${randName} for ${seller.initItem}!`, "success"))
      .catch((err) => console.error("[Firebase] Mock order failed:", err));
  } else {
    transactions.unshift(mockOrder);
    saveLocalFallback();
    renderApp();
    showToast(`Simulated Live Order placed by ${randName} for ${seller.initItem}!`, "success");
  }
}

// ==========================================================================
// COURIER PORTAL
// ==========================================================================
function renderCourierDashboard() {
  const tableBody = document.getElementById("courier-txn-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  const courierTxns = transactions.filter((t) => t.matched);

  if (courierTxns.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dark-secondary);">No packages waiting for dispatch. Matched transactions appear here.</td></tr>`;
    return;
  }

  courierTxns.forEach((txn) => {
    tableBody.innerHTML += `
      <tr>
        <td><strong style="color:#FFF;">${txn.mpesaCode}</strong></td>
        <td>
          <div style="font-weight: 600;">${txn.buyerName}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">${txn.buyerContact}</div>
        </td>
        <td><span style="font-weight: 600;">${txn.collectionPoint}</span></td>
        <td><span style="font-family: 'Outfit'; font-weight:700;">KES ${txn.courierFeePaid.toLocaleString()}</span></td>
        <td>
          <div style="font-size: 0.8rem; font-weight:600; color: var(--primary-green);">Courier Cut (50%): KES ${txn.splitCourier.toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">Safaricom Fee (50%): KES ${txn.splitPlatform.toLocaleString()}</div>
        </td>
        <td>
          <span class="badge ${getStatusClass(txn.status)}">${txn.status}</span>
        </td>
        <td>
          <div style="display:flex; gap:8px;">
            ${txn.status === "Ready for Dispatch" ? 
              `<button class="parser-action-btn" style="padding: 6px 12px; font-size: 0.75rem; background: var(--secondary-orange);" onclick="updateTransactionStatus('${txn.firestoreId || txn.id}', 'Dispatched')">Dispatch Item</button>` : 
              ""
            }
            ${txn.status === "Dispatched" ? 
              `<button class="parser-action-btn" style="padding: 6px 12px; font-size: 0.75rem; background: var(--primary-green);" onclick="updateTransactionStatus('${txn.firestoreId || txn.id}', 'Delivered')">Confirm Delivery</button>` : 
              ""
            }
            ${txn.status === "Delivered" ? 
              `<span style="color:var(--text-dark-secondary); font-size:0.8rem;">📦 Item Delivered</span>` : 
              ""
            }
          </div>
        </td>
      </tr>
    `;
  });
}

function getStatusClass(status) {
  switch (status) {
    case "Pending Payment": return "pending";
    case "Ready for Dispatch": return "ready";
    case "Dispatched": return "dispatched";
    case "Delivered": return "delivered";
    default: return "pending";
  }
}

function updateTransactionStatus(id, newStatus) {
  const isFirestoreDocId = (db && transactions.some(t => t.firestoreId === id));
  
  if (isFirestoreDocId) {
    db.collection("transactions").doc(id).update({ status: newStatus })
      .then(() => showToast(`Status updated: ${newStatus}`, "success"))
      .catch((err) => console.error("[Firebase] Status update failed:", err));
  } else {
    const txn = transactions.find((t) => t.id === id || t.firestoreId === id);
    if (txn) {
      txn.status = newStatus;
      saveLocalFallback();
      showToast(`Status updated: ${newStatus}`, "success");
      renderApp();
    }
  }

  trackEvent("status_updated", {
    transactionId: id,
    newStatus: newStatus
  });
}

// ==========================================================================
// REPORT PRINTER & EXPORTER
// ==========================================================================
function triggerReportPrint(timeframe) {
  let filtered = [...transactions];
  const now = new Date();

  if (timeframe === "hourly") {
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    filtered = transactions.filter((t) => new Date(t.timestamp) >= oneHourAgo);
  } else if (timeframe === "daily") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    filtered = transactions.filter((t) => new Date(t.timestamp) >= startOfToday);
  } else if (timeframe === "weekly") {
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    filtered = transactions.filter((t) => new Date(t.timestamp) >= sevenDaysAgo);
  } else if (timeframe === "monthly") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filtered = transactions.filter((t) => new Date(t.timestamp) >= startOfMonth);
  }

  trackEvent("report_printed", { timeframe: timeframe, count: filtered.length });

  const oldPrintHeader = document.querySelector(".print-header");
  if (oldPrintHeader) oldPrintHeader.remove();

  const printHeaderDiv = document.createElement("div");
  printHeaderDiv.className = "print-header";
  printHeaderDiv.innerHTML = `
    <h1>DUKA ONLINE LOGISTICS & PAYOUT REPORT</h1>
    <p>Report Period: <strong>${timeframe.toUpperCase()}</strong> | Date Generated: ${now.toLocaleString("en-KE")}</p>
    <p>Total Matched Records: ${filtered.filter(t => t.matched).length} | Pending Matching: ${filtered.filter(t => !t.matched).length}</p>
  `;

  document.body.prepend(printHeaderDiv);
  window.print();
}

// ==========================================================================
// PWA INSTALLATION INTERFACES & TOASTS
// ==========================================================================
function installPWA() {
  if (!deferredInstallPrompt) return;
  
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === "accepted") {
      console.log("[PWA] User accepted installation prompt");
      trackEvent("pwa_installed");
    }
    deferredInstallPrompt = null;
    document.getElementById("pwa-install-banner").style.display = "none";
  });
}

function dismissInstallBanner() {
  document.getElementById("pwa-install-banner").style.display = "none";
}

function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "error" : type === "courier" ? "courier" : ""}`;
  
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(50px)";
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ==========================================================================
// EVENT LISTENERS SETUP
// ==========================================================================
function setupEventListeners() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchRole(btn.dataset.role));
  });

  const selectPoint = document.getElementById("checkout-collection-point");
  if (selectPoint) {
    selectPoint.addEventListener("change", updateCheckoutPricing);
  }
}
