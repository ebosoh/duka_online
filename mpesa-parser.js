/**
 * M-PESA SMS Parser & Transaction Merge Logic (FLATTENED)
 * Designed for Kenya live-shopping operations
 */

class MpesaParser {
  /**
   * Cleans and parses a raw M-PESA SMS text.
   * Supports Till, Paybill, Pochi la Biashara, and Send Money formats.
   * @param {string} smsText
   * @returns {object|null} Extracted fields or null if not a valid M-PESA message
   */
  static parseSMS(smsText) {
    if (!smsText || typeof smsText !== "string") return null;
    
    // Clean whitespace and standardize casing
    const text = smsText.trim();
    
    // Extract Transaction Code (typically 10-character alphanumeric at the start)
    const codeMatch = text.match(/^([A-Z0-9]{10})\b/i);
    if (!codeMatch) return null;
    const mpesaCode = codeMatch[1].toUpperCase();

    // Extract Amount (e.g. Ksh1,500.00, Ksh 3200, Ksh.150.50)
    const amountMatch = text.match(/Ksh\.?\s*([\d,]+\.\d{2}|[\d,]+)/i);
    if (!amountMatch) return null;
    const amountPaid = parseFloat(amountMatch[1].replace(/,/g, ""));

    // Extract Phone Number (e.g. 254712345678 or 0712345678)
    const phoneMatch = text.match(/(?:254|0)(7\d{8}|1\d{8})/);
    const mpesaPhone = phoneMatch ? phoneMatch[0] : "";

    // Extract Date and Time (e.g. 27/5/26 at 4:15 PM)
    const dateMatch = text.match(/on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const timeMatch = text.match(/at\s+(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    
    const mpesaDate = dateMatch ? dateMatch[1] : new Date().toLocaleDateString("en-KE");
    const mpesaTime = timeMatch ? timeMatch[1] : new Date().toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit" });

    // Determine the payment type and name extraction
    let mpesaSender = "Unknown Buyer";
    let paymentMethod = "M-PESA Direct";
    let paymentRecipient = "livePAY";

    if (text.toLowerCase().includes("pochi la biashara")) {
      paymentMethod = "Pochi la Biashara";
      // E.g. "...sent to Pochi la Biashara AMINA OMONDI 0722987654..."
      const senderMatch = text.match(/sent to Pochi la Biashara\s+([A-Z\s]+)(?:07|254|1)/i);
      if (senderMatch) {
        mpesaSender = senderMatch[1].trim();
      }
    } else if (text.toLowerCase().includes("paid to") || text.toLowerCase().includes("sent to buy goods")) {
      paymentMethod = "Lipa na M-PESA Till";
      // E.g. "...Ksh3,450.00 paid to Grogan Spares Zone..."
      const recipientMatch = text.match(/paid to\s+([A-Z0-9\s'&]+?)(?:\.\s*on|\s+on|\s+for account)/i);
      if (recipientMatch) {
        paymentRecipient = recipientMatch[1].trim();
      }
      
      // Look for a sender name which might be at the end or derived
      const senderMatch = text.match(/from\s+([A-Z\s]+)(?:\s+\d|$)/i);
      if (senderMatch) {
        mpesaSender = senderMatch[1].trim();
      }
    } else if (text.toLowerCase().includes("sent to") && text.toLowerCase().includes("account")) {
      paymentMethod = "M-PESA Paybill";
      // E.g. "...sent to livePAY for account 0701122334..."
      const recipientMatch = text.match(/sent to\s+([A-Z0-9\s'&]+?)\s+for account/i);
      if (recipientMatch) {
        paymentRecipient = recipientMatch[1].trim();
      }
    } else if (text.toLowerCase().includes("received")) {
      paymentMethod = "M-PESA Send Money (Received)";
      // E.g. "...received Ksh1,500.00 from JOHN NJUGUNA 254701122334..."
      const senderMatch = text.match(/received\s+Ksh.*?from\s+([A-Z\s]+)(:\s+\d)/i);
      if (senderMatch) {
        mpesaSender = senderMatch[1].trim();
      }
    } else {
      // General Fallback Send Money
      // E.g. "...Ksh1,500.00 sent to JOHN NJUGUNA 0701122334..."
      const recipientMatch = text.match(/sent to\s+([A-Z\s]+)(?:\s+\d)/i);
      if (recipientMatch) {
        mpesaSender = recipientMatch[1].trim();
      }
    }

    return {
      mpesaCode,
      amountPaid,
      mpesaPhone,
      mpesaDate,
      mpesaTime,
      mpesaSender: mpesaSender.replace(/\s+/g, " "),
      paymentMethod,
      paymentRecipient
    };
  }

  /**
   * Merges Buyer Form Data with parsed M-PESA SMS Data
   * and calculates split payments.
   * 
   * Split Rules:
   * - Product amount = buyer product price (100% goes to Seller)
   * - Courier fee = total paid - product price
   * - Courier Partner share = 50% of courier fee
   * - Platform App fee (livePAY Provider) = 50% of courier fee
   * 
   * @param {object} parsedSMS Extracted M-PESA details
   * @param {object} buyerForm Buyer's pre-filled checkout details
   * @returns {object} Highly integrated single transaction log
   */
  static mergeTransaction(parsedSMS, buyerForm) {
    const totalPaid = parsedSMS.amountPaid;
    const productPrice = buyerForm.productPrice || 0;
    const courierFeePaid = Math.max(0, totalPaid - productPrice);

    // Calculate splits
    const splitSeller = productPrice;
    const splitCourier = Number((courierFeePaid * 0.5).toFixed(2));
    const splitPlatform = Number((courierFeePaid * 0.5).toFixed(2));

    return {
      id: "TXN-" + Math.floor(1000 + Math.random() * 9000),
      timestamp: new Date().toISOString(),
      buyerName: buyerForm.buyerName || parsedSMS.mpesaSender,
      buyerContact: buyerForm.buyerContact || parsedSMS.mpesaPhone,
      collectionPoint: buyerForm.collectionPoint || "Nairobi CBD Pick-up Centre",
      productName: buyerForm.productName || "Direct Live Sale Item",
      productId: buyerForm.productId || "custom",
      mpesaCode: parsedSMS.mpesaCode,
      mpesaSender: parsedSMS.mpesaSender,
      mpesaPhone: parsedSMS.mpesaPhone,
      productAmountPaid: splitSeller,
      courierFeePaid: courierFeePaid,
      totalPaid: totalPaid,
      paymentMethod: parsedSMS.paymentMethod,
      paymentRecipient: parsedSMS.paymentRecipient,
      splitSeller: splitSeller,
      splitCourier: splitCourier,
      splitPlatform: splitPlatform,
      sellerPochi: buyerForm.merchantPhone || parsedSMS.paymentRecipient,
      courierPochi: buyerForm.courierPochi || "0722000005",
      platformPochi: buyerForm.platformPochi || "0711000000",
      status: "Ready for Dispatch",
      matched: true
    };
  }
}

if (typeof module !== "undefined") {
  module.exports = MpesaParser;
}
