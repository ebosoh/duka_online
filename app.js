/**
 * DUKA ONLINE - CORE APPLICATION CONTROLLER (FLATTENED WITH FIREBASE SYNC)
 * Optimized for GitHub Pages & real-time Safaricom payout splits.
 */

// ==========================================================================
// FIREBASE BACKEND CONFIGURATION
// ==========================================================================
// Hudson: Replace the placeholder config below with your actual Firebase Web Config
// keys from your Firebase Console (Project Settings > Web App).
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Global State Variables
let transactions = [];
let products = [];
let currentRole = "buyer"; 
let pendingSTKPush = null; 
let deferredInstallPrompt = null; 
let db = null; // Firebase Firestore Reference
let firestoreUnsubscribe = null; // Firestore listener teardown

const GA4_PROPERTY_ID = ""; // Paste GA4 ID here if available

// ==========================================================================
// INITIALIZATION & LIFECYCLE
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  initPWA();
  initAnalytics();
  initFirebase();
  loadData();
  setupEventListeners();
  renderApp();
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
  // Check if firebase is loaded and user has entered a config
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
  // Load products from seeds
  if (typeof INITIAL_PRODUCTS !== "undefined") {
    products = INITIAL_PRODUCTS;
  }

  // Subscribe to real-time updates if Firebase is configured
  if (db) {
    if (firestoreUnsubscribe) firestoreUnsubscribe();
    
    // Listen to changes on "transactions" collection in real time
    firestoreUnsubscribe = db.collection("transactions")
      .orderBy("timestamp", "desc")
      .onSnapshot((snapshot) => {
        transactions = [];
        snapshot.forEach((doc) => {
          transactions.push({ firestoreId: doc.id, ...doc.data() });
        });
        console.log(`[Firebase Backend] Received ${transactions.length} sync logs.`);
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
    transactions = INITIAL_TRANSACTIONS;
    saveLocalFallback();
  }
}

function saveLocalFallback() {
  localStorage.setItem("duka_transactions", JSON.stringify(transactions));
}

// ==========================================================================
// VIEWS ROUTER & ROLE SWITCHER
// ==========================================================================
function switchRole(role) {
  currentRole = role;
  
  // Update Navigation Active State
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    if (btn.dataset.role === role) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Switch View Panels
  document.querySelectorAll(".view-panel").forEach((panel) => {
    if (panel.id === `${role}-view`) {
      panel.classList.add("active");
    } else {
      panel.classList.remove("active");
    }
  });

  trackEvent("role_view_changed", { role: role });

  // Custom styling for active panel
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
// BUYER EXPRESS CHECKOUT
// ==========================================================================
function renderBuyerPortal() {
  const productShowcase = document.getElementById("buyer-product-showcase");
  if (!productShowcase) return;

  const activeProduct = products[0]; 
  
  productShowcase.innerHTML = `
    <div class="product-showcase">
      <div class="product-img-container">
        <img src="${activeProduct.image}" alt="${activeProduct.name}">
      </div>
      <div class="product-details">
        <div>
          <span class="live-badge">Live Auction Active</span>
          <h2 class="product-title">${activeProduct.name}</h2>
          <div class="product-live-tag">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 9H3V5h9v7zm9 7h-9v-7h9v7zm0-9h-9V5h9v5z"/></svg>
            Auction Bid Code: <strong style="font-size:1.15rem; color:var(--secondary-orange);">${activeProduct.liveCode}</strong>
          </div>
          <p style="margin-bottom:0.75rem;">Instant buyout for live viewers. Match your pay immediately to secure shipping.</p>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
          <div class="product-price-tag">KES ${activeProduct.price.toLocaleString()}</div>
          <span class="product-stock">Only ${activeProduct.stock} Left in Stock</span>
        </div>
      </div>
    </div>
  `;

  const collectionSelect = document.getElementById("checkout-collection-point");
  if (collectionSelect && collectionSelect.options.length <= 1) {
    COLLECTION_POINTS.forEach((hub) => {
      const option = document.createElement("option");
      option.value = hub.id;
      option.textContent = `${hub.name} (+ KES ${hub.fee})`;
      collectionSelect.appendChild(option);
    });
  }

  updateCheckoutPricing();
}

function updateCheckoutPricing() {
  const collectionSelect = document.getElementById("checkout-collection-point");
  if (!collectionSelect) return;

  const activeProduct = products[0];
  const selectedHubId = collectionSelect.value;
  const hub = COLLECTION_POINTS.find((h) => h.id === selectedHubId);
  const deliveryFee = hub ? hub.fee : 0;
  const totalPrice = activeProduct.price + deliveryFee;

  document.getElementById("breakdown-prod-price").textContent = `KES ${activeProduct.price.toLocaleString()}`;
  document.getElementById("breakdown-delivery-fee").textContent = `KES ${deliveryFee.toLocaleString()}`;
  document.getElementById("breakdown-total-price").textContent = `KES ${totalPrice.toLocaleString()}`;
}

function triggerBuyerCheckout(event) {
  event.preventDefault();
  
  const name = document.getElementById("buyer-form-name").value.trim();
  const contact = document.getElementById("buyer-form-contact").value.trim();
  const hubId = document.getElementById("checkout-collection-point").value;

  if (!name || !contact || !hubId) {
    showToast("Please fill in all checkout details!", "error");
    return;
  }

  const activeProduct = products[0];
  const hub = COLLECTION_POINTS.find((h) => h.id === hubId);
  
  pendingSTKPush = {
    buyerName: name,
    buyerContact: contact,
    collectionPoint: hub.name,
    productName: activeProduct.name,
    productId: activeProduct.id,
    productPrice: activeProduct.price,
    deliveryFee: hub.fee,
    totalPaid: activeProduct.price + hub.fee
  };

  trackEvent("checkout_stk_initiated", {
    productName: activeProduct.name,
    totalAmount: pendingSTKPush.totalPaid
  });

  const modal = document.getElementById("stk-push-modal");
  const modalPromptText = document.getElementById("stk-prompt-text");
  
  if (modal && modalPromptText) {
    modalPromptText.innerHTML = `Do you want to pay <strong>KES ${pendingSTKPush.totalPaid.toLocaleString()}</strong> to <strong>Duka Online</strong>? <br><br>Enter your M-PESA PIN below to confirm payment:`;
    document.getElementById("stk-pin-field").value = "";
    modal.classList.add("active");
  }
}

function confirmSimulatedPayment() {
  const pinField = document.getElementById("stk-pin-field");
  if (!pinField || pinField.value.length < 4) {
    showToast("Please enter a 4-digit M-PESA PIN!", "error");
    return;
  }

  document.getElementById("stk-push-modal").classList.remove("active");
  showToast("STK Push Request processing...", "success");

  setTimeout(() => {
    const buyerData = pendingSTKPush;
    if (!buyerData) return;

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "QR" + Array.from({length: 8}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    
    // Choose Courier partner till
    const randomCourier = COURIER_PROVIDERS[Math.floor(Math.random() * COURIER_PROVIDERS.length)];
    
    const simulatedSMS = `${code} Confirmed. Ksh${buyerData.totalPaid.toLocaleString()}.00 paid to Duka Online on ${new Date().toLocaleDateString("en-KE")} at ${new Date().toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" })}. New M-PESA balance is Ksh154,200.00. Transaction cost Ksh0.00.`;

    const parsedSMS = MpesaParser.parseSMS(simulatedSMS);
    
    if (parsedSMS) {
      const mergedTxn = MpesaParser.mergeTransaction(parsedSMS, buyerData);
      
      // Save Transaction to cloud database or local fallback
      if (db) {
        db.collection("transactions").add(mergedTxn)
          .then((docRef) => {
            console.log("[Firebase] Transaction uploaded:", docRef.id);
            showToast(`Payment Approved! Ref: ${code}`, "success");
            showToast(`SMS Extracted & Auto-Merged with ${buyerData.collectionPoint} Delivery.`, "courier");
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
        renderApp();
        showToast(`Payment Approved! Ref: ${code}`, "success");
        showToast(`SMS Extracted & Auto-Merged with ${buyerData.collectionPoint} Delivery.`, "courier");
      }

      // Pre-fill text area automatically for presentation
      const smsTextarea = document.getElementById("sms-input-field");
      if (smsTextarea) {
        smsTextarea.value = simulatedSMS;
      }

      trackEvent("payment_completed", {
        transactionId: mergedTxn.id,
        amount: mergedTxn.totalPaid,
        buyer: mergedTxn.buyerName
      });

      document.getElementById("buyer-form-name").value = "";
      document.getElementById("buyer-form-contact").value = "";
      document.getElementById("checkout-collection-point").selectedIndex = 0;
      updateCheckoutPricing();

      pendingSTKPush = null;
    }
  }, 1200);
}

function cancelSimulatedPayment() {
  document.getElementById("stk-push-modal").classList.remove("active");
  showToast("M-PESA STK Push cancelled.", "error");
  pendingSTKPush = null;
}

// ==========================================================================
// SELLER DASHBOARD
// ==========================================================================
function renderSellerDashboard() {
  let totalProductSales = 0;
  let totalPlatformFees = 0;
  let totalCourierEarnings = 0;

  transactions.forEach((t) => {
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

  if (transactions.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-dark-secondary);">No transactions captured yet. Live show is waiting...</td></tr>`;
    return;
  }

  transactions.forEach((txn) => {
    tableBody.innerHTML += `
      <tr>
        <td><strong style="color:#FFF;">${txn.mpesaCode || "PENDING"}</strong></td>
        <td>
          <div style="font-weight: 600;">${txn.buyerName}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">${txn.buyerContact}</div>
        </td>
        <td><span style="font-family: 'Outfit'; font-weight:700;">KES ${txn.totalPaid.toLocaleString()}</span></td>
        <td>
          <div style="font-size: 0.8rem; font-weight:600; color: var(--primary-green);">Seller: KES ${txn.productAmountPaid.toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--text-dark-secondary);">Courier Partner: KES ${txn.splitCourier.toLocaleString()}</div>
          <div style="font-size: 0.75rem; color: var(--accent-red);">App Platform: KES ${txn.splitPlatform.toLocaleString()}</div>
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

  // Look for a pending unmatched transaction in local cache
  const pendingMatch = transactions.find((t) => 
    !t.matched && 
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
        .then(() => showToast(`Payment Merged! Matched with pending Buyer: ${pendingMatch.buyerName}`, "success"))
        .catch((err) => console.error("[Firebase] Merge failed, falling back:", err));
    } else {
      Object.assign(pendingMatch, updateData);
      saveLocalFallback();
      renderApp();
      showToast(`Payment Merged! Matched with pending Buyer: ${pendingMatch.buyerName}`, "success");
    }
  } else {
    // Generic direct matching
    const mockBuyerForm = {
      buyerName: parsed.mpesaSender,
      buyerContact: parsed.mpesaPhone,
      collectionPoint: "Nairobi CBD Pick-up Centre",
      productName: "Direct Sale (Auction Item)",
      productPrice: Math.round(parsed.amountPaid * 0.85)
    };

    const newTxn = MpesaParser.mergeTransaction(parsed, mockBuyerForm);
    
    if (db) {
      db.collection("transactions").add(newTxn)
        .then(() => showToast(`Direct SMS Processed! Extracted Buyer: ${parsed.mpesaSender}`, "success"))
        .catch((err) => console.error("[Firebase] Direct add failed:", err));
    } else {
      transactions.unshift(newTxn);
      saveLocalFallback();
      renderApp();
      showToast(`Direct SMS Processed! Extracted Buyer: ${parsed.mpesaSender}`, "success");
    }
  }

  smsInputField.value = "";
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

// Update state on Cloud or Local Storage
function updateTransactionStatus(id, newStatus) {
  const isFirestoreDocId = (db && transactions.some(t => t.firestoreId === id));
  
  if (isFirestoreDocId) {
    db.collection("transactions").doc(id).update({ status: newStatus })
      .then(() => showToast(`Status updated: ${newStatus}`, "success"))
      .catch((err) => console.error("[Firebase] Status update failed:", err));
  } else {
    // Local fallback search
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
