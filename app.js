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
let ACTIVE_SELLERS = [
  { id: "seller-1", name: "Grogan Spares Zone", PochiPhone: "0722987654", shortName: "Grogan", avatar: "🛠️", initItem: "Heavy-Duty Brake Pads (Pair)", initPrice: 3200, pin: "1234" },
  { id: "seller-2", name: "Amina Omondi Fashion", PochiPhone: "0722111111", shortName: "Amina", avatar: "👗", initItem: "Vintage Denim Jacket", initPrice: 1800, pin: "1234" },
  { id: "seller-3", name: "Velo Nicotine Shop", PochiPhone: "0711555555", shortName: "Velo", avatar: "🚬", initItem: "Velo Nicotine Pouches 2-Pack", initPrice: 1200, pin: "1234" },
  { id: "seller-4", name: "TechBrain Gadgets Hub", PochiPhone: "0799000000", shortName: "Gadgets", avatar: "💻", initItem: "Wireless ANC Earbuds Pro", initPrice: 4500, pin: "1234" }
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
  autoSelectSellerFromUrl(); // Automatically route URL parameters e.g., ?seller=grogan
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
  loadSellersAndHubs();
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

// Dynamically route and auto-select seller from URL parameters (e.g. ?seller=grogan or ?seller=0722987654)
function autoSelectSellerFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const sellerQuery = urlParams.get("seller");
  
  if (sellerQuery) {
    const cleanQuery = sellerQuery.trim().toLowerCase();
    
    // Scan matching seller by ID, shortName, or Pochi phone
    const matchedSeller = ACTIVE_SELLERS.find(s => 
      s.id.toLowerCase() === cleanQuery || 
      s.shortName.toLowerCase() === cleanQuery || 
      s.PochiPhone === cleanQuery
    );
    
    if (matchedSeller) {
      const selectEl = document.getElementById("checkout-live-seller");
      if (selectEl) {
        selectEl.value = matchedSeller.id;
        handleCheckoutSellerChange();
        console.log(`[URL Dispatcher] Auto-routing connected. Streamer channel loaded: ${matchedSeller.name}`);
      }
    }
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
    // Leave fields empty because item names and prices are random values entered explicitly by the buyer
    document.getElementById("buyer-form-item-name").value = "";
    document.getElementById("buyer-form-bid-price").value = "";
    
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
  
  // Prepare global pending object
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
    collectionPoint: hub.name,
    courierPochi: hub.PochiPhone,
    platformPochi: "0711000000"
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
  if (!checkSellerAuth()) return;
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
          <div style="font-size: 0.85rem; font-weight:600; color: var(--primary-green);">🛒 Sales Share: KES ${txn.productAmountPaid.toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">🚚 Shipping Fee: KES ${txn.courierFeePaid.toLocaleString()}</div>
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
      sellerPochi: pendingMatch.merchantPhone,
      courierPochi: pendingMatch.courierPochi || "0722000005",
      platformPochi: pendingMatch.platformPochi || "0711000000",
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
      merchantPhone: matchedSeller.PochiPhone,
      courierPochi: "0722000005",
      platformPochi: "0711000000"
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
    courierPochi: randHub.PochiPhone,
    platformPochi: "0711000000",
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
  if (!checkCourierAuth()) return;
  const tableBody = document.getElementById("courier-txn-table-body");
  if (!tableBody) return;

  tableBody.innerHTML = "";

  const authCourierStr = localStorage.getItem("duka_auth_courier");
  if (!authCourierStr) return;

  const courier = JSON.parse(authCourierStr);
  const courierTxns = transactions.filter((t) => t.matched && t.collectionPoint === courier.name);

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
          <div style="font-size: 0.8rem; font-weight:600; color: var(--primary-green);">🚚 Courier Share: KES ${txn.splitCourier.toLocaleString()} &rarr; ${txn.courierPochi || '0722000005'}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">💻 Platform Split: KES ${txn.splitPlatform.toLocaleString()}</div>
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
// DYNAMIC DUKA ONLINE REGISTRIES (LocalStorage & Asynchronous Firestore Sync)
// ==========================================================================
function loadSellersAndHubs() {
  // 1. Load from LocalStorage fallback first (instant offline render)
  const storedSellers = localStorage.getItem("duka_sellers");
  if (storedSellers) {
    ACTIVE_SELLERS = JSON.parse(storedSellers);
  }
  const storedHubs = localStorage.getItem("duka_hubs");
  if (storedHubs) {
    COLLECTION_POINTS = JSON.parse(storedHubs);
  }

  // 2. Fetch from Firestore if connected (syncs online updates in background!)
  if (db) {
    db.collection("sellers").get().then((snapshot) => {
      if (!snapshot.empty) {
        let cloudSellers = [];
        snapshot.forEach(doc => cloudSellers.push(doc.data()));
        
        // Merge cloud sellers with local (ensuring no duplicates by Pochi Phone)
        cloudSellers.forEach(cs => {
          if (!ACTIVE_SELLERS.some(s => s.PochiPhone === cs.PochiPhone)) {
            ACTIVE_SELLERS.push(cs);
          }
        });
        localStorage.setItem("duka_sellers", JSON.stringify(ACTIVE_SELLERS));
        populateDropdowns(); // Re-populate UI dropdowns
      }
    }).catch(err => console.log("Sellers fetch failed or offline:", err));

    db.collection("hubs").get().then((snapshot) => {
      if (!snapshot.empty) {
        let cloudHubs = [];
        snapshot.forEach(doc => cloudHubs.push(doc.data()));
        
        // Merge cloud hubs with local (ensuring no duplicates by ID)
        cloudHubs.forEach(ch => {
          if (!COLLECTION_POINTS.some(h => h.id === ch.id || h.PochiPhone === ch.PochiPhone)) {
            COLLECTION_POINTS.push(ch);
          }
        });
        localStorage.setItem("duka_hubs", JSON.stringify(COLLECTION_POINTS));
        populateDropdowns(); // Re-populate UI dropdowns
      }
    }).catch(err => console.log("Hubs fetch failed or offline:", err));
  }
}

// ==========================================================================
// DYNAMIC SIGN-UP REGISTRATIONS (Mobile-First Bottom-Sheets)
// ==========================================================================
function openSellerSignupModal() {
  const modal = document.getElementById("seller-signup-modal");
  if (modal) modal.classList.add("active");
}

function closeSellerSignupModal() {
  const modal = document.getElementById("seller-signup-modal");
  if (modal) modal.classList.remove("active");
  document.getElementById("seller-signup-form").reset();
}

// Register a New Seller
function registerNewSeller(event) {
  event.preventDefault();

  const name = document.getElementById("reg-seller-name").value.trim();
  const shortName = document.getElementById("reg-seller-short").value.trim();
  const PochiPhone = document.getElementById("reg-seller-pochi").value.trim();
  const initItem = document.getElementById("reg-seller-item").value.trim();
  const initPrice = parseFloat(document.getElementById("reg-seller-price").value) || 0;
  const avatar = document.getElementById("reg-seller-avatar").value;
  const pin = document.getElementById("reg-seller-pin").value.trim();

  if (!name || !shortName || !PochiPhone || !initItem || initPrice <= 0 || !pin) {
    showToast("Please fill in all registration fields!", "error");
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    showToast("Passcode must be a 4-digit numeric PIN!", "error");
    return;
  }

  // Check if Seller already exists by phone
  if (ACTIVE_SELLERS.some(s => s.PochiPhone === PochiPhone)) {
    showToast("A seller with this Pochi phone is already registered!", "error");
    return;
  }

  const newSeller = {
    id: `seller-${Date.now()}`,
    name: name,
    PochiPhone: PochiPhone,
    shortName: shortName,
    avatar: avatar,
    initItem: initItem,
    initPrice: initPrice,
    pin: pin
  };

  // Add locally instantly
  ACTIVE_SELLERS.push(newSeller);
  localStorage.setItem("duka_sellers", JSON.stringify(ACTIVE_SELLERS));

  // Sync in background with Firestore
  if (db) {
    db.collection("sellers").add(newSeller)
      .then(() => console.log("[Firebase] New merchant sync done:", name))
      .catch((err) => console.error("[Firebase] New merchant sync failed (offline queue active):", err));
  }

  // Update UI and clean up
  populateDropdowns();
  closeSellerSignupModal();
  showToast(`Shop "${name}" successfully registered!`, "success");
  
  // Auto login newly registered seller session
  localStorage.setItem("duka_auth_seller", JSON.stringify(newSeller));
  checkSellerAuth();
  
  // Auto-switch selector to the newly registered seller on the seller dashboard
  const channelSelector = document.getElementById("seller-channel-selector");
  if (channelSelector) {
    channelSelector.value = PochiPhone;
    handleSellerChannelChange();
  }
}

function openCourierSignupModal() {
  const modal = document.getElementById("courier-signup-modal");
  if (modal) modal.classList.add("active");
}

function closeCourierSignupModal() {
  const modal = document.getElementById("courier-signup-modal");
  if (modal) modal.classList.remove("active");
  document.getElementById("courier-signup-form").reset();
}

// Register a New Courier Depot
function registerNewCourier(event) {
  event.preventDefault();

  const name = document.getElementById("reg-courier-name").value.trim();
  const PochiPhone = document.getElementById("reg-courier-pochi").value.trim();
  const pin = document.getElementById("reg-courier-pin").value.trim();
  const fee = parseFloat(document.getElementById("reg-courier-fee").value) || 0;

  if (!name || !PochiPhone || fee <= 0 || !pin) {
    showToast("Please fill in all hub details!", "error");
    return;
  }

  if (!/^\d{4}$/.test(pin)) {
    showToast("Passcode must be a 4-digit numeric PIN!", "error");
    return;
  }

  // Check if Hub already exists
  if (COLLECTION_POINTS.some(h => h.PochiPhone === PochiPhone)) {
    showToast("A courier depot with this phone number already exists!", "error");
    return;
  }

  const newHub = {
    id: `hub-${Date.now()}`,
    name: name,
    fee: fee,
    PochiPhone: PochiPhone,
    pin: pin
  };

  // Add locally instantly
  COLLECTION_POINTS.push(newHub);
  localStorage.setItem("duka_hubs", JSON.stringify(COLLECTION_POINTS));

  // Sync in background with Firestore
  if (db) {
    db.collection("hubs").add(newHub)
      .then(() => console.log("[Firebase] New depot sync done:", name))
      .catch((err) => console.error("[Firebase] New depot sync failed (offline queue active):", err));
  }

  // Update UI and clean up
  populateDropdowns();
  closeCourierSignupModal();
  showToast(`Courier Depot "${name}" registered successfully!`, "courier");

  // Auto login newly registered courier depot session
  localStorage.setItem("duka_auth_courier", JSON.stringify(newHub));
  checkCourierAuth();
}

// ==========================================================================
// SELLER & COURIER PORTAL AUTHENTICATION GATES
// ==========================================================================

// Verify Seller Authentication
function checkSellerAuth() {
  const authSellerStr = localStorage.getItem("duka_auth_seller");
  const authGate = document.getElementById("seller-auth-gate");
  const dashContent = document.getElementById("seller-dashboard-content");

  if (authSellerStr) {
    try {
      const seller = JSON.parse(authSellerStr);
      // Verify credentials against ACTIVE_SELLERS
      const verified = ACTIVE_SELLERS.find(s => s.PochiPhone === seller.PochiPhone && s.pin === seller.pin);
      if (verified) {
        if (authGate) authGate.style.display = "none";
        if (dashContent) dashContent.style.display = "block";
        activeSellerChannel = seller.PochiPhone;

        const sellerChannelSelector = document.getElementById("seller-channel-selector");
        if (sellerChannelSelector) {
          sellerChannelSelector.value = activeSellerChannel;
          sellerChannelSelector.disabled = true;
        }
        return true;
      }
    } catch (e) {
      console.error("Error parsing seller auth:", e);
    }
  }

  if (authGate) authGate.style.display = "flex";
  if (dashContent) dashContent.style.display = "none";
  return false;
}

// Handle Seller Log In Form Submission
function handleSellerLogin(event) {
  event.preventDefault();
  const phone = document.getElementById("login-seller-phone").value.trim();
  const pin = document.getElementById("login-seller-pin").value.trim();

  const seller = ACTIVE_SELLERS.find(s => s.PochiPhone === phone && s.pin === pin);
  if (seller) {
    localStorage.setItem("duka_auth_seller", JSON.stringify(seller));
    showToast(`Welcome back, ${seller.name}!`, "success");

    // Clear login inputs
    document.getElementById("login-seller-phone").value = "";
    document.getElementById("login-seller-pin").value = "";

    checkSellerAuth();
  } else {
    showToast("Invalid Pochi phone number or PIN!", "error");
  }
}

// Handle Seller Log Out
function handleSellerLogout() {
  localStorage.removeItem("duka_auth_seller");
  showToast("Logged out of Merchant Control Panel", "success");
  checkSellerAuth();
}

// Verify Courier Authentication
function checkCourierAuth() {
  const authCourierStr = localStorage.getItem("duka_auth_courier");
  const authGate = document.getElementById("courier-auth-gate");
  const dashContent = document.getElementById("courier-dashboard-content");

  if (authCourierStr) {
    try {
      const courier = JSON.parse(authCourierStr);
      // Verify credentials against COLLECTION_POINTS
      const verified = COLLECTION_POINTS.find(h => h.PochiPhone === courier.PochiPhone && h.pin === courier.pin);
      if (verified) {
        if (authGate) authGate.style.display = "none";
        if (dashContent) dashContent.style.display = "block";
        return true;
      }
    } catch (e) {
      console.error("Error parsing courier auth:", e);
    }
  }

  if (authGate) authGate.style.display = "flex";
  if (dashContent) dashContent.style.display = "none";
  return false;
}

// Handle Courier Log In Form Submission
function handleCourierLogin(event) {
  event.preventDefault();
  const phone = document.getElementById("login-courier-phone").value.trim();
  const pin = document.getElementById("login-courier-pin").value.trim();

  const hub = COLLECTION_POINTS.find(h => h.PochiPhone === phone && h.pin === pin);
  if (hub) {
    localStorage.setItem("duka_auth_courier", JSON.stringify(hub));
    showToast(`Courier Depot "${hub.name}" unlocked!`, "courier");

    // Clear login inputs
    document.getElementById("login-courier-phone").value = "";
    document.getElementById("login-courier-pin").value = "";

    checkCourierAuth();
  } else {
    showToast("Invalid Depot Pochi phone number or PIN!", "error");
  }
}

// Handle Courier Log Out
function handleCourierLogout() {
  localStorage.removeItem("duka_auth_courier");
  showToast("Logged out of Courier Portal", "courier");
  checkCourierAuth();
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
