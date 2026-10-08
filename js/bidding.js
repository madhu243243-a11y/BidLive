/**
 * BidLive - Interactive Bidding Engine & Auction Details Controller (Step 1)
 */

let detailsTimerInterval = null;
let refreshDetailsCountdown = null;

document.addEventListener("DOMContentLoaded", () => {
  const detailsContainer = document.getElementById("auction-details-container");
  if (!detailsContainer) return;

  initAuctionDetailsPage().catch(error => showToast(error.message || 'Could not load this auction.', 'danger'));
});

async function initAuctionDetailsPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const auctionId = parseInt(urlParams.get("id")) || 1;
  const auction = await getAuctionById(auctionId);

  if (!auction) {
    document.getElementById("auction-details-container").innerHTML = `
      <div class="container" style="text-align: center; padding: 5rem 1rem;">
        <h2 style="font-size: 2rem; margin-bottom: 1rem;">Auction Not Found</h2>
        <p style="color: var(--text-muted); margin-bottom: 2rem;">The auction you are looking for does not exist or has been removed.</p>
        <a href="auctions.html" class="btn btn-primary">Browse Active Auctions</a>
      </div>
    `;
    return;
  }

  // Update Breadcrumb & Title
  document.title = `${auction.title} - BidLive`;
  const breadcrumbEl = document.getElementById("breadcrumb-current");
  if (breadcrumbEl) breadcrumbEl.textContent = auction.title;

  // Render product details
  renderAuctionDetails(auction);
  const watchButton = document.getElementById("details-watch-btn");
  if (watchButton) watchButton.setAttribute("data-watchlist-id", String(auction.id));
  initWatchlistButton(watchButton, auction.id);

  // Set up live countdown
  setupDetailsCountdown(auction);

  // Set up bid submission
  setupBiddingForm(auction);
  connectAuctionRealtime(auction.id, update => applyRealtimeBidUpdate(auction, update));
}

function applyRealtimeBidUpdate(auction, update) {
  const bidAmount = Number(update.bidAmount);
  const currentBid = Number(update.currentBid);
  if (!Number.isFinite(bidAmount) || !Number.isFinite(currentBid) || currentBid < Number(auction.currentBid)) return;
  if ((auction.bidHistory || []).some(bid => Number(bid.amount) === bidAmount)) return;

  auction.currentBid = currentBid;
  auction.bidsCount = Number(update.bidsCount);
  auction.endTimestamp = Number(update.endTimestamp);
  auction.endsInSeconds = Number(update.endsInSeconds);
  auction.bidHistory = [{
    id: Number(update.bidId),
    bidder: update.bidderName || 'Bidder',
    amount: bidAmount,
    time: update.createdAt ? new Date(update.createdAt).toLocaleString() : 'Recently'
  }, ...(auction.bidHistory || [])].slice(0, 50);

  const currentBidEl = document.getElementById('details-current-bid');
  if (currentBidEl) currentBidEl.textContent = formatCurrency(auction.currentBid);
  const minimumBid = auction.currentBid + (Number(auction.minimumIncrement) || 100);
  const minimumBidEl = document.getElementById('details-min-bid');
  if (minimumBidEl) minimumBidEl.textContent = formatCurrency(minimumBid);
  const bidsCountEl = document.getElementById('details-bids-count');
  if (bidsCountEl) bidsCountEl.textContent = `${auction.bidsCount} Bids`;

  const bidInput = document.getElementById('bid-amount-input');
  if (bidInput) {
    bidInput.min = minimumBid;
    if (Number(bidInput.value) < minimumBid) bidInput.value = minimumBid;
  }
  if (refreshDetailsCountdown) refreshDetailsCountdown();
  renderBidHistory(auction.bidHistory);
}

function renderAuctionDetails(auction) {
  const now = Date.now();
  const isEnded = auction.endTimestamp <= now;
  const minNextBid = auction.currentBid + (Number(auction.minimumIncrement) || 100);

  // Set image
  const imgEl = document.getElementById("details-img");
  if (imgEl) {
    setAuctionImage(imgEl, auction.imageUrl);
    imgEl.alt = auction.title;
  }

  // Badges & Categories
  const categoryEl = document.getElementById("details-category");
  if (categoryEl) categoryEl.textContent = auction.category;

  const statusBadgeEl = document.getElementById("details-status-badge");
  if (statusBadgeEl) {
    if (isEnded) {
      statusBadgeEl.className = "card-badge badge-ended";
      statusBadgeEl.textContent = "Auction Ended";
    } else {
      statusBadgeEl.className = "card-badge badge-live";
      statusBadgeEl.innerHTML = `<span class="pulse-circle"></span> LIVE`;
    }
  }

  // Title & Description
  const titleEl = document.getElementById("details-title");
  if (titleEl) titleEl.textContent = auction.title;

  const descEl = document.getElementById("details-desc");
  if (descEl) descEl.textContent = auction.description;

  const sellerEl = document.getElementById("details-seller");
  if (sellerEl) sellerEl.textContent = auction.seller;

  // Prices
  const startPriceEl = document.getElementById("details-start-price");
  if (startPriceEl) startPriceEl.textContent = formatCurrency(auction.startingPrice);

  const currentBidEl = document.getElementById("details-current-bid");
  if (currentBidEl) currentBidEl.textContent = formatCurrency(auction.currentBid);

  const minBidEl = document.getElementById("details-min-bid");
  if (minBidEl) minBidEl.textContent = formatCurrency(minNextBid);

  const bidsCountEl = document.getElementById("details-bids-count");
  if (bidsCountEl) bidsCountEl.textContent = `${auction.bidsCount} Bids`;

  // Pre-fill bid input with minNextBid
  const bidInput = document.getElementById("bid-amount-input");
  if (bidInput) {
    bidInput.value = minNextBid;
    bidInput.min = minNextBid;
  }

  // Quick Chips
  setupQuickChips(auction.currentBid);

  // Render Bid History
  renderBidHistory(auction.bidHistory);
}

// Quick increment chips: +100, +500, +1000, +5000
function setupQuickChips(currentBid) {
  const chipsContainer = document.getElementById("quick-chips-row");
  const bidInput = document.getElementById("bid-amount-input");
  if (!chipsContainer || !bidInput) return;

  chipsContainer.querySelectorAll(".chip-btn").forEach(chip => {
    chip.addEventListener("click", () => {
      const increment = parseInt(chip.getAttribute("data-add"));
      const currentVal = parseInt(bidInput.value) || (currentBid + 100);
      bidInput.value = currentVal + increment;
      bidInput.focus();
    });
  });
}

// Bid History Renderer
function renderBidHistory(history) {
  const container = document.getElementById("bid-history-list");
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem;">
        No bids placed yet. Be the first bidder!
      </div>
    `;
    return;
  }

  container.innerHTML = history.map((bid, index) => {
    const isNewest = index === 0;
    const bidderName = escapeHTML(bid.bidder || "Bidder");
    const initial = escapeHTML(bidderName.charAt(0).toUpperCase());
    return `
      <div class="history-item ${isNewest ? 'newest' : ''}">
        <div class="bidder-info">
          <div class="bidder-avatar">${initial}</div>
          <div>
            <div class="bidder-name">${bidderName} ${isNewest ? '<span style="font-size:0.75rem; color:var(--success); font-weight:700;">(Highest Bidder)</span>' : ''}</div>
            <div class="bid-time">${escapeHTML(bid.time || 'Recently')}</div>
          </div>
        </div>
        <div class="history-bid-val">${formatCurrency(bid.amount)}</div>
      </div>
    `;
  }).join("");
}

// Countdown timer loop for Details page
function setupDetailsCountdown(auction) {
  const timerDigitsEl = document.getElementById("details-timer-digits");
  const placeBidBtn = document.getElementById("place-bid-btn");
  const bidInput = document.getElementById("bid-amount-input");
  const statusBadge = document.getElementById("details-status-badge");

  if (!timerDigitsEl) return;

  if (detailsTimerInterval !== null) {
    clearInterval(detailsTimerInterval);
    detailsTimerInterval = null;
  }

  let auctionEndedToastShown = auction.endTimestamp <= Date.now();

  function update() {
    const now = Date.now();
    const remainingMs = auction.endTimestamp - now;

    if (remainingMs <= 0) {
      timerDigitsEl.textContent = "Auction Ended";
      timerDigitsEl.classList.remove("urgent");

      if (placeBidBtn) {
        placeBidBtn.disabled = true;
        placeBidBtn.textContent = "Auction Closed";
      }
      if (bidInput) {
        bidInput.disabled = true;
      }
      if (statusBadge) {
        statusBadge.className = "card-badge badge-ended";
        statusBadge.textContent = "Auction Ended";
      }

      if (!auctionEndedToastShown) {
        auctionEndedToastShown = true;
        showToast("This auction has ended. Bidding is now closed.", "info");
      }
      if (detailsTimerInterval !== null) {
        clearInterval(detailsTimerInterval);
        detailsTimerInterval = null;
      }
      return;
    }

    timerDigitsEl.textContent = formatTimeRemaining(remainingMs);
    if (remainingMs < 3600 * 1000) {
      timerDigitsEl.classList.add("urgent");
    }
  }

  update();
  refreshDetailsCountdown = update;
  if (auction.endTimestamp > Date.now()) detailsTimerInterval = setInterval(update, 1000);
}

// Setup Bidding Form Submission & Validations
function setupBiddingForm(auction) {
  const form = document.getElementById("place-bid-form");
  const bidInput = document.getElementById("bid-amount-input");
  const placeBidBtn = document.getElementById("place-bid-btn");

  if (!form || !bidInput) return;

  // Check if auction is ended
  if (auction.endTimestamp <= Date.now()) {
    if (placeBidBtn) placeBidBtn.disabled = true;
    if (bidInput) bidInput.disabled = true;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const enteredAmount = parseInt(bidInput.value);
    const minNextBid = auction.currentBid + (Number(auction.minimumIncrement) || 100);

    // Validation checks
    if (isNaN(enteredAmount) || enteredAmount <= 0) {
      showToast("Please enter a valid bid amount.", "danger");
      bidInput.focus();
      return;
    }

    if (enteredAmount > 1000000000) {
      showToast("Bid amount exceeds the maximum allowable limit (₹1,00,00,00,000).", "danger");
      bidInput.focus();
      return;
    }

    if (enteredAmount <= auction.currentBid) {
      showToast(`Your bid must be higher than the current bid of ${formatCurrency(auction.currentBid)}.`, "danger");
      bidInput.focus();
      return;
    }

    if (enteredAmount < minNextBid) {
      showToast(`Minimum acceptable bid is ${formatCurrency(minNextBid)}.`, "warning");
      bidInput.value = minNextBid;
      bidInput.focus();
      return;
    }

    // Determine bidder name from current user session or default
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== "buyer") {
      showToast("Sign in with a buyer account to place a bid.", "warning");
      return;
    }

    // Place simulated bid
    const submitButton = form.querySelector('[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    let result;
    try {
      result = await placeBid(auction.id, enteredAmount);
    } catch (error) {
      showToast(error.message, 'danger');
      return;
    } finally {
      if (submitButton && auction.endTimestamp > Date.now()) submitButton.disabled = false;
    }

    if (result.auction) {
      // Update auction reference
      auction.currentBid = result.auction.currentBid;
      auction.bidsCount = result.auction.bidsCount;
      auction.bidHistory = result.auction.bidHistory;
      auction.endTimestamp = result.auction.endTimestamp;
      auction.endsInSeconds = result.auction.endsInSeconds;
      if (refreshDetailsCountdown) refreshDetailsCountdown();

      // Update UI elements
      const currentBidEl = document.getElementById("details-current-bid");
      if (currentBidEl) currentBidEl.textContent = formatCurrency(auction.currentBid);

      const minBidEl = document.getElementById("details-min-bid");
      const newMin = auction.currentBid + (Number(auction.minimumIncrement) || 100);
      if (minBidEl) minBidEl.textContent = formatCurrency(newMin);

      const bidsCountEl = document.getElementById("details-bids-count");
      if (bidsCountEl) bidsCountEl.textContent = `${auction.bidsCount} Bids`;

      // Next pre-fill
      bidInput.value = newMin;
      bidInput.min = newMin;

      // Re-render bid history with animation
      renderBidHistory(auction.bidHistory);

      // Trigger Celebration Toast
      showToast(`Success! Your bid of ${formatCurrency(enteredAmount)} has been placed.`, "success");
      if (result.extended) showToast("Auction extended by 30 seconds to prevent last-second sniping.", "info");

      // Visual pulse on price card
      const priceCard = document.querySelector(".price-summary-card");
      if (priceCard) {
        priceCard.style.transition = "transform 0.2s ease, box-shadow 0.2s ease";
        priceCard.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.4)";
        setTimeout(() => {
          priceCard.style.boxShadow = "";
        }, 1200);
      }
    }
  });
}
