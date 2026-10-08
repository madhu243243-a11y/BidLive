/**
 * BidLive - Auctions Listing, Filters, Sorting & Countdown Engine (Step 1)
 */

let auctionTimerInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  initializeAuctionViews().catch(error => {
    showToast(error.message || 'Could not load auctions.', 'danger');
  });
});

async function initializeAuctionViews() {
  const auctions = await getAuctions({ status: 'all' });
  renderCategoriesGrid(auctions);
  if (document.getElementById("live-auctions-grid")) renderHomeAuctions(auctions);
  if (document.getElementById("all-auctions-grid")) await initAuctionsListingPage(auctions);
  startGlobalCountdownLoop();
}

// Render Category Cards on Home Page
function renderCategoriesGrid(auctions) {
  const container = document.getElementById("categories-grid");
  if (!container || typeof CATEGORIES_DATA === "undefined") return;

  const now = Date.now();
  container.innerHTML = CATEGORIES_DATA.map(cat => {
    const count = auctions.filter(auction => auction.category === cat.name && auction.endTimestamp > now).length;
    return `
    <a class="category-card" href="auctions.html?category=${encodeURIComponent(cat.name)}">
      <div class="category-icon-box">${cat.icon}</div>
      <div class="category-details">
        <h4>${escapeHTML(cat.name)}</h4>
        <span>${count} Active Auctions</span>
      </div>
    </a>
  `;
  }).join("");
}

// Render Auctions for Home Page
function renderHomeAuctions(allAuctions) {
  const liveGrid = document.getElementById("live-auctions-grid");
  const featuredGrid = document.getElementById("featured-auctions-grid");

  if (liveGrid) {
    // Show 6 live sample products
    const liveSample = allAuctions.filter(auction => auction.endTimestamp > Date.now()).slice(0, 6);
    liveGrid.innerHTML = liveSample.length
      ? liveSample.map(auction => createAuctionCardHTML(auction)).join("")
      : '<p class="empty-state-note">There are no active auctions yet. Sellers can create the first listing.</p>';
    initCardWatchlistButtons(liveGrid);
  }

  if (featuredGrid) {
    // Show popular/featured items
    const featuredSample = allAuctions.filter(a => a.endTimestamp > Date.now() && (a.featured || a.bidsCount > 15)).slice(0, 4);
    featuredGrid.innerHTML = featuredSample.length
      ? featuredSample.map(auction => createAuctionCardHTML(auction, true)).join("")
      : '<p class="empty-state-note">Popular auctions will appear here when listings receive bids.</p>';
    initCardWatchlistButtons(featuredGrid);
  }
}

// Generate Individual Auction Card HTML
function createAuctionCardHTML(auction, isFeatured = false) {
  const now = Date.now();
  const isEnded = auction.endTimestamp <= now;
  const timeRemainingMs = Math.max(0, auction.endTimestamp - now);
  const timeDisplay = formatTimeRemaining(timeRemainingMs);
  const isUrgent = !isEnded && timeRemainingMs < 3600 * 1000; // Under 1 hour

  return `
    <div class="auction-card" data-id="${Number(auction.id)}" data-category="${escapeHTML(auction.category)}" data-end="${Number(auction.endTimestamp)}" data-bid="${Number(auction.currentBid)}" data-bids-count="${Number(auction.bidsCount)}">
      <div class="card-img-wrapper">
        <img src="${escapeHTML(safeImageUrl(auction.imageUrl))}" alt="${escapeHTML(auction.title)}" class="card-img" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80'" />
        <button type="button" class="card-save-btn" data-watchlist-id="${Number(auction.id)}">☆ Save</button>
        
        ${isEnded ? `
          <div class="card-badge badge-ended">Auction Ended</div>
        ` : `
          <div class="card-badge badge-live">
            <span class="pulse-circle"></span>
            LIVE
          </div>
        `}

        ${isFeatured ? `<div class="badge-featured">★ Popular</div>` : ''}
      </div>

      <div class="card-body">
        <span class="card-category">${escapeHTML(auction.category)}</span>
        <h3 class="card-title" title="${escapeHTML(auction.title)}">${escapeHTML(auction.title)}</h3>

        <div class="card-bid-meta">
          <div class="bid-col">
            <span class="bid-label">Current Bid</span>
            <span class="bid-amount">${formatCurrency(auction.currentBid)}</span>
          </div>
          <span class="bid-count-pill">${auction.bidsCount} Bids</span>
        </div>

        <div class="card-timer">
          <span class="timer-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            ${isEnded ? 'Status:' : 'Ends in:'}
          </span>
          <span class="timer-digits ${isUrgent ? 'urgent' : ''}" data-end-time="${auction.endTimestamp}">
            ${timeDisplay}
          </span>
        </div>

        <div class="card-footer">
          <a href="auction-details.html?id=${auction.id}" class="btn ${isEnded ? 'btn-secondary' : 'btn-primary'} btn-block view-auction-btn">
            ${isEnded ? 'View Result' : 'View Auction'}
          </a>
        </div>
      </div>
    </div>
  `;
}

function initCardWatchlistButtons(container) {
  container.querySelectorAll("[data-watchlist-id]").forEach(button =>
    initWatchlistButton(button, button.getAttribute("data-watchlist-id")));
}

// Global Countdown Loop (ticks every 1s)
function startGlobalCountdownLoop() {
  if (auctionTimerInterval) clearInterval(auctionTimerInterval);

  auctionTimerInterval = setInterval(() => {
    const timerElements = document.querySelectorAll(".timer-digits[data-end-time]");
    const now = Date.now();

    timerElements.forEach(el => {
      const endTimestamp = parseInt(el.getAttribute("data-end-time"));
      const remainingMs = endTimestamp - now;

      if (remainingMs <= 0) {
        el.textContent = "Auction Ended";
        el.classList.remove("urgent");

        // Find parent card and update badge and button
        const card = el.closest(".auction-card");
        if (card && !card.classList.contains("has-ended")) {
          card.classList.add("has-ended");
          const badge = card.querySelector(".card-badge");
          if (badge) {
            badge.className = "card-badge badge-ended";
            badge.textContent = "Auction Ended";
          }
          const btn = card.querySelector(".view-auction-btn");
          if (btn) {
            btn.className = "btn btn-secondary btn-block view-auction-btn";
            btn.textContent = "View Result";
          }
        }
      } else {
        el.textContent = formatTimeRemaining(remainingMs);
        if (remainingMs < 3600 * 1000) {
          el.classList.add("urgent");
        } else {
          el.classList.remove("urgent");
        }
      }
    });
  }, 1000);
}

// Full Auctions Listing Page Controller (`auctions.html`)
async function initAuctionsListingPage(allAuctions) {
  const container = document.getElementById("all-auctions-grid");
  const searchInput = document.getElementById("search-input");
  const categoryFilter = document.getElementById("category-filter");
  const priceFilter = document.getElementById("price-filter");
  const sortFilter = document.getElementById("sort-filter");
  const statusFilter = document.getElementById("status-filter");
  const resultsCount = document.getElementById("results-count");
  const pillsContainer = document.getElementById("category-pills-bar");

  // Read URL query params (e.g. ?category=Electronics)
  const urlParams = new URLSearchParams(window.location.search);
  const paramCategory = urlParams.get("category");
  const paramSearch = urlParams.get("search");
  const requestedStatus = urlParams.get("status");
  const allowedStatuses = ["all", "live", "ending_soon", "ended"];
  if (statusFilter) statusFilter.value = allowedStatuses.includes(requestedStatus) ? requestedStatus : "live";

  if (paramCategory && categoryFilter) {
    categoryFilter.value = paramCategory;
  }
  if (paramSearch && searchInput) {
    searchInput.value = paramSearch;
  }

  // Populate category filter dropdown if empty
  if (categoryFilter && categoryFilter.options.length <= 1 && typeof CATEGORIES_DATA !== "undefined") {
    CATEGORIES_DATA.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name;
      if (paramCategory && paramCategory.toLowerCase() === cat.name.toLowerCase()) {
        opt.selected = true;
      }
      categoryFilter.appendChild(opt);
    });
  }

  // Render Category Quick Pills
  if (pillsContainer && typeof CATEGORIES_DATA !== "undefined") {
    let pillsHtml = `<button class="pill-btn ${!paramCategory ? 'active' : ''}" data-cat="all">All</button>`;
    CATEGORIES_DATA.forEach(cat => {
      const isActive = paramCategory && paramCategory.toLowerCase() === cat.name.toLowerCase();
      pillsHtml += `<button type="button" class="pill-btn ${isActive ? 'active' : ''}" data-cat="${escapeHTML(cat.name)}">${cat.icon} ${escapeHTML(cat.name)}</button>`;
    });
    pillsContainer.innerHTML = pillsHtml;

    pillsContainer.querySelectorAll(".pill-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        pillsContainer.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        const selectedCat = btn.getAttribute("data-cat");
        if (categoryFilter) {
          categoryFilter.value = selectedCat === "all" ? "" : selectedCat;
        }
        applyFiltersAndRender();
      });
    });
  }

  // Function to filter and render items
  function applyFiltersAndRender() {
    let list = [...allAuctions];
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const selectedCategory = categoryFilter ? categoryFilter.value : "";
    const selectedPrice = priceFilter ? priceFilter.value : "all";
    const selectedSort = sortFilter ? sortFilter.value : "ending_soon";
    const selectedStatus = statusFilter ? statusFilter.value : "all";
    const now = Date.now();

    // 1. Text Search Filter (name & category & description)
    if (query) {
      list = list.filter(item => 
        item.title.toLowerCase().includes(query) ||
        item.category.toLowerCase().includes(query) ||
        String(item.description || '').toLowerCase().includes(query)
      );
    }

    // 2. Category Filter
    if (selectedCategory && selectedCategory !== "all") {
      list = list.filter(item => item.category.toLowerCase() === selectedCategory.toLowerCase());
    }

    // 3. Price Filter
    if (selectedPrice === "under_10k") {
      list = list.filter(item => item.currentBid < 10000);
    } else if (selectedPrice === "10k_50k") {
      list = list.filter(item => item.currentBid >= 10000 && item.currentBid <= 50000);
    } else if (selectedPrice === "50k_100k") {
      list = list.filter(item => item.currentBid > 50000 && item.currentBid <= 100000);
    } else if (selectedPrice === "above_100k") {
      list = list.filter(item => item.currentBid > 100000);
    }

    // 4. Status Filter
    if (selectedStatus === "live") {
      list = list.filter(item => item.endTimestamp > now);
    } else if (selectedStatus === "ending_soon") {
      list = list.filter(item => item.endTimestamp > now && (item.endTimestamp - now) <= 2 * 3600 * 1000);
    } else if (selectedStatus === "ended") {
      list = list.filter(item => item.endTimestamp <= now);
    }

    // 5. Sorting
    list.sort((a, b) => {
      if (selectedSort === "ending_soon") {
        return a.endTimestamp - b.endTimestamp;
      } else if (selectedSort === "lowest_bid") {
        return a.currentBid - b.currentBid;
      } else if (selectedSort === "highest_bid") {
        return b.currentBid - a.currentBid;
      } else if (selectedSort === "most_bids") {
        return b.bidsCount - a.bidsCount;
      }
      return 0;
    });

    // Update counter
    if (resultsCount) {
      resultsCount.textContent = `${list.length} ${list.length === 1 ? 'Auction' : 'Auctions'} Found`;
    }

    // Render results
    if (list.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
          <div style="font-size: 3rem; margin-bottom: 1rem;">🔍</div>
          <h3 style="font-size: 1.5rem; margin-bottom: 0.5rem;">No Auctions Found</h3>
          <p style="color: var(--text-muted); margin-bottom: 1.5rem;">We couldn't find any live auctions matching your filters. Try clearing your search.</p>
          <button id="reset-filters-btn" class="btn btn-secondary">Clear Filters</button>
        </div>
      `;

      const resetBtn = document.getElementById("reset-filters-btn");
      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          if (searchInput) searchInput.value = "";
          if (categoryFilter) categoryFilter.value = "";
          if (priceFilter) priceFilter.value = "all";
          if (statusFilter) statusFilter.value = "all";
          if (sortFilter) sortFilter.value = "ending_soon";
          if (pillsContainer) {
            pillsContainer.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
            pillsContainer.querySelector('[data-cat="all"]')?.classList.add("active");
          }
          applyFiltersAndRender();
        });
      }
    } else {
      container.innerHTML = list.map(item => createAuctionCardHTML(item)).join("");
      initCardWatchlistButtons(container);
    }
  }

  // Event Listeners
  if (searchInput) searchInput.addEventListener("input", applyFiltersAndRender);
  if (categoryFilter) categoryFilter.addEventListener("change", () => {
    // Sync pills
    if (pillsContainer) {
      pillsContainer.querySelectorAll(".pill-btn").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-cat") === (categoryFilter.value || "all"));
      });
    }
    applyFiltersAndRender();
  });
  if (priceFilter) priceFilter.addEventListener("change", applyFiltersAndRender);
  if (sortFilter) sortFilter.addEventListener("change", applyFiltersAndRender);
  if (statusFilter) statusFilter.addEventListener("change", applyFiltersAndRender);

  // Initial render
  applyFiltersAndRender();
}
