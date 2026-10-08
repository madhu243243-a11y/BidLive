/**
 * BidLive - Buyer & Seller Dashboard and Create Auction Controller (Step 1)
 */

document.addEventListener("DOMContentLoaded", () => {
  // If on Buyer Dashboard
  if (document.getElementById("buyer-dashboard-view")) {
    initBuyerDashboard().catch(error => showToast(error.message || 'Could not load your dashboard.', 'danger'));
  }

  // If on Seller Dashboard
  if (document.getElementById("seller-dashboard-view")) {
    initSellerDashboard().catch(error => showToast(error.message || 'Could not load your dashboard.', 'danger'));
  }

  // If on Create Auction Page
  if (document.getElementById("create-auction-form")) {
    initCreateAuctionPage();
  }
});

// ----------------------------------------------------
// BUYER DASHBOARD
// ----------------------------------------------------
async function initBuyerDashboard() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== "buyer") return;
  const userNameEl = document.getElementById("buyer-user-name");
  if (userNameEl) {
    userNameEl.textContent = currentUser.name;
  }

  const [allAuctions, userBids, watchlist] = await Promise.all([getAuctions({ status: 'all' }), getMyBids(), getWatchlist()]);
  const latestBidByAuction = userBids.filter((bid, index, list) => list.findIndex(candidate => candidate.auctionId === bid.auctionId) === index);
  const activeBids = latestBidByAuction.filter(bid => bid.endTimestamp > Date.now());
  const wonAuctions = latestBidByAuction.filter(bid => bid.endTimestamp <= Date.now() && bid.isWinning);

  // Compute metrics
  const winningBids = activeBids.filter(bid => bid.isWinning).length;
  const watchlistCount = watchlist.length;

  document.getElementById("buyer-stat-active-bids").textContent = activeBids.length;
  document.getElementById("buyer-stat-winning").textContent = winningBids;
  document.getElementById("buyer-stat-won").textContent = wonAuctions.length;
  document.getElementById("buyer-stat-watching").textContent = watchlistCount;

  // Render Active Bids Table
  const activeBidsTableBody = document.getElementById("buyer-active-bids-tbody");
  if (activeBidsTableBody) {
    activeBidsTableBody.innerHTML = activeBids.map(bid => {
      const liveItem = allAuctions.find(a => Number(a.id) === Number(bid.auctionId));
      const currentHighest = liveItem ? liveItem.currentBid : bid.currentBid;
      const isWinning = Boolean(bid.isWinning);
      const statusText = isWinning ? "Winning" : "Outbid";
      const statusClass = isWinning ? "winning" : "outbid";

      return `
        <tr>
          <td>
            <strong>${escapeHTML(bid.title)}</strong>
          </td>
          <td><strong>${formatCurrency(bid.amount)}</strong></td>
          <td>${formatCurrency(currentHighest)}</td>
          <td>
            <span class="status-pill ${statusClass}">${statusText}</span>
          </td>
          <td>
            <a href="auction-details.html?id=${bid.auctionId}" class="btn btn-secondary" style="font-size:0.8rem; padding: 0.35rem 0.75rem;">
              ${isWinning ? 'View' : 'Raise Bid'}
            </a>
          </td>
        </tr>
      `;
    }).join("");
    if (!activeBids.length) activeBidsTableBody.innerHTML = '<tr><td colspan="5">You have not placed any active bids yet.</td></tr>';
  }

  // Render Won Auctions Table
  const wonTableBody = document.getElementById("buyer-won-tbody");
  if (wonTableBody) {
    wonTableBody.innerHTML = wonAuctions.map(bid => `
      <tr>
          <td><strong>${escapeHTML(bid.title)}</strong></td>
          <td><strong>${formatCurrency(bid.highestBid)}</strong></td>
          <td>${new Date(bid.endTimestamp).toLocaleDateString()}</td>
        <td><span class="status-pill active">Auction won</span></td>
      </tr>
    `).join("");
    if (!wonAuctions.length) wonTableBody.innerHTML = '<tr><td colspan="4">You have not won any completed auctions yet.</td></tr>';
  }
}

// ----------------------------------------------------
// SELLER DASHBOARD
// ----------------------------------------------------
async function initSellerDashboard() {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.role !== "seller") return;
  const sellerNameEl = document.getElementById("seller-user-name");
  if (sellerNameEl) {
    sellerNameEl.textContent = currentUser.name;
  }

  const auctions = (await getAuctions({ status: 'all' })).filter(auction => Number(auction.sellerId) === Number(currentUser.id));
  const now = Date.now();

  const totalAuctions = auctions.length;
  const activeAuctions = auctions.filter(a => a.endTimestamp > now).length;
  const completedAuctions = totalAuctions - activeAuctions;
  const totalBids = auctions.reduce((sum, item) => sum + (item.bidsCount || 0), 0);

  document.getElementById("seller-stat-total").textContent = totalAuctions;
  document.getElementById("seller-stat-active").textContent = activeAuctions;
  document.getElementById("seller-stat-completed").textContent = completedAuctions;
  document.getElementById("seller-stat-bids").textContent = totalBids;

  // Render Seller's Listings Table
  const sellerTbody = document.getElementById("seller-auctions-tbody");
  if (sellerTbody) {
    sellerTbody.innerHTML = auctions.map(a => {
      const isEnded = a.endTimestamp <= now;
      const statusClass = isEnded ? "ended" : "active";
      const statusText = isEnded ? "Ended" : "Live";

      return `
        <tr>
          <td>
            <div style="display:flex; align-items:center; gap:0.75rem;">
              <img src="${escapeHTML(safeImageUrl(a.imageUrl))}" alt="${escapeHTML(a.title)}" style="width:44px; height:44px; border-radius:8px; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80'" />
              <div>
                <strong>${escapeHTML(a.title)}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHTML(a.category)}</div>
              </div>
            </div>
          </td>
          <td>${formatCurrency(a.startingPrice)}</td>
          <td><strong>${formatCurrency(a.currentBid)}</strong></td>
          <td><span class="bid-count-pill">${a.bidsCount}</span></td>
          <td><span class="status-pill ${statusClass}">${statusText}</span></td>
          <td>
            <a href="auction-details.html?id=${a.id}" class="btn btn-secondary" style="font-size:0.8rem; padding: 0.35rem 0.75rem;">View</a>
          </td>
        </tr>
      `;
    }).join("");
    if (!auctions.length) sellerTbody.innerHTML = '<tr><td colspan="6">You have not listed any auctions yet.</td></tr>';
  }
}

// ----------------------------------------------------
// CREATE AUCTION CONTROLLER
// ----------------------------------------------------
function initCreateAuctionPage() {
  const form = document.getElementById("create-auction-form");
  const titleInput = document.getElementById("auction-title");
  const categorySelect = document.getElementById("auction-category");
  const priceInput = document.getElementById("auction-price");
  const durationInput = document.getElementById("auction-duration");
  const imageInput = document.getElementById("auction-image");
  const descInput = document.getElementById("auction-desc");

  // Live preview elements
  const prevTitle = document.getElementById("prev-title");
  const prevCategory = document.getElementById("prev-category");
  const prevPrice = document.getElementById("prev-price");
  const prevImage = document.getElementById("prev-image");

  // Live updates to preview
  if (titleInput && prevTitle) {
    titleInput.addEventListener("input", (e) => {
      prevTitle.textContent = e.target.value || "Your Product Title";
    });
  }

  if (categorySelect && prevCategory) {
    categorySelect.addEventListener("change", (e) => {
      prevCategory.textContent = e.target.value || "Category";
    });
  }

  if (priceInput && prevPrice) {
    priceInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      prevPrice.textContent = isNaN(val) ? "₹0" : formatCurrency(val);
    });
  }

  if (imageInput && prevImage) {
    imageInput.addEventListener("input", (e) => {
      if (e.target.value.trim().length > 5) {
        prevImage.src = safeImageUrl(e.target.value.trim());
      }
    });
  }

  // Preset image selector helpers
  document.querySelectorAll(".preset-img-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-url");
      if (imageInput && prevImage) {
        imageInput.value = url;
        prevImage.src = url;
        showToast("Preset image applied", "info");
      }
    });
  });

  // Handle Form Submission
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const title = titleInput.value.trim();
      const category = categorySelect.value;
      const startingPrice = parseFloat(priceInput.value);
      const durationHours = parseFloat(durationInput.value);
      const imageUrl = safeImageUrl(imageInput.value.trim());
      const description = descInput.value.trim();

      // Validations
      if (!title) {
        showToast("Please enter a product title.", "warning");
        titleInput.focus();
        return;
      }
      if (title.length < 5) {
        showToast("Please enter a descriptive product title (at least 5 characters).", "warning");
        titleInput.focus();
        return;
      }

      if (!category) {
        showToast("Please select a category.", "warning");
        categorySelect.focus();
        return;
      }

      if (isNaN(startingPrice) || startingPrice <= 0) {
        showToast("Please enter a valid starting price greater than ₹0.", "warning");
        priceInput.focus();
        return;
      }

      if (!durationHours || isNaN(durationHours) || durationHours <= 0) {
        showToast("Please select an auction duration.", "warning");
        durationInput.focus();
        return;
      }

      if (!description) {
        showToast("Please enter a product description.", "warning");
        descInput.focus();
        return;
      }
      if (description.length < 15) {
        showToast("Product description must be at least 15 characters.", "warning");
        descInput.focus();
        return;
      }

      const currentUser = getCurrentUser();
      if (!currentUser || currentUser.role !== "seller") {
        showToast("Seller access is required to create an auction.", "warning");
        return;
      }
      // Create new listing
      let newAuction;
      try {
        newAuction = await createNewAuction({
          title,
          category,
          startingPrice,
          minimumIncrement: 100,
          endTime: new Date(Date.now() + durationHours * 3600000).toISOString(),
          imageUrl,
          description
        });
      } catch (error) {
        showToast(error.message, 'danger');
        return;
      }

      showToast("Auction created successfully! It is now live.", "success");

      setTimeout(() => {
        window.location.href = `auction-details.html?id=${newAuction.id}`;
      }, 1000);
    });
  }
}
