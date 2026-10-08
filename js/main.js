/**
 * BidLive - Main Global Script (Step 1)
 * Handles navigation, mobile drawer, toast notifications, and user session UI updates.
 */

document.addEventListener("DOMContentLoaded", () => {
  enforcePageAccess();
  initNavbar();
  initToastContainer();
  initUserSessionBadge();
  initSellingLinks();
});

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function safeImageUrl(value) {
  const fallback = "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80";
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try {
    const parsed = new URL(value, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : fallback;
  } catch (error) {
    return fallback;
  }
}

function setAuctionImage(imageElement, value) {
  if (!imageElement) return;
  const fallback = safeImageUrl(null);
  let fallbackApplied = false;
  imageElement.onerror = () => {
    if (fallbackApplied) return;
    fallbackApplied = true;
    imageElement.src = fallback;
  };
  imageElement.src = safeImageUrl(value);
}

function initSellingLinks() {
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href="create-auction.html"]');
    if (!link) return;
    const user = getCurrentUser();
    if (user && user.role === "buyer") {
      event.preventDefault();
      showToast("Seller access is required to create an auction. Sign in with a seller demo account or register as a seller.", "info");
    } else if (!user) {
      localStorage.setItem("bidlive_start_selling_intent", "true");
    }
  });
}

// Client-side navigation guard for the browser-only demo. A real app must
// enforce authorization on its server as well.
function enforcePageAccess() {
  const page = window.location.pathname.split("/").pop().toLowerCase();
  const protectedRoles = {
    "buyer-dashboard.html": "buyer",
    "seller-dashboard.html": "seller",
    "create-auction.html": "seller"
  };
  const requiredRole = protectedRoles[page];
  if (!requiredRole) return;

  const user = getCurrentUser();
  if (!user) {
    window.location.replace("login.html");
    return;
  }
  if (user.role !== requiredRole) {
    window.location.replace(user.role === "seller" ? "seller-dashboard.html" : "buyer-dashboard.html");
  }
}

// Format Indian Rupee currency
function formatCurrency(amount) {
  if (amount === undefined || amount === null || isNaN(amount)) return "₹0";
  return "₹" + Number(amount).toLocaleString('en-IN');
}

// Format countdown remaining seconds to HH:MM:SS or DDd HH:MM:SS
function formatTimeRemaining(msRemaining) {
  if (msRemaining <= 0) return "Auction Ended";

  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (days > 0) {
    return `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Navbar & Mobile Hamburger initialization
function initNavbar() {
  const hamburgerBtn = document.querySelector(".hamburger-btn");
  const mobileDrawer = document.querySelector(".mobile-nav-drawer");

  if (hamburgerBtn && mobileDrawer) {
    hamburgerBtn.addEventListener("click", () => {
      const isOpen = mobileDrawer.classList.toggle("open");
      hamburgerBtn.innerHTML = isOpen ? "✕" : "☰";
      hamburgerBtn.setAttribute("aria-expanded", isOpen);
    });

    // Close drawer when clicking outside
    document.addEventListener("click", (e) => {
      if (!mobileDrawer.contains(e.target) && !hamburgerBtn.contains(e.target) && mobileDrawer.classList.contains("open")) {
        mobileDrawer.classList.remove("open");
        hamburgerBtn.innerHTML = "☰";
        hamburgerBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Close drawer immediately when any item inside the drawer is clicked
    mobileDrawer.querySelectorAll("a, button").forEach(item => {
      item.addEventListener("click", () => {
        mobileDrawer.classList.remove("open");
        hamburgerBtn.innerHTML = "☰";
        hamburgerBtn.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Highlight active link based on current path
  const currentPath = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-link").forEach(link => {
    const href = link.getAttribute("href");
    if (href === currentPath || (currentPath === "" && href === "index.html")) {
      link.classList.add("active");
    }
  });

}

// User session badge in navbar
function initUserSessionBadge() {
  const currentUser = getCurrentUser();
  const navActions = document.querySelector(".nav-actions");
  const mobileActions = document.querySelector(".mobile-nav-actions");

  if (!navActions) return;

  if (currentUser) {
    const isSeller = currentUser.role === "seller";
    const dashboardUrl = isSeller ? "seller-dashboard.html" : "buyer-dashboard.html";
    const roleBadge = isSeller ? "Seller" : "Buyer";

    const userHtml = `
      <div class="nav-user">
        <a href="${dashboardUrl}" class="user-badge" title="Go to Dashboard">
          <div class="user-avatar-mini">${escapeHTML(currentUser.name.charAt(0).toUpperCase())}</div>
          <span>${escapeHTML(currentUser.name)}</span>
          <span style="font-size: 0.7rem; background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 4px;">${roleBadge}</span>
        </a>
        <a href="${dashboardUrl}" class="btn btn-nav-outline" style="font-size: 0.85rem; padding: 0.45rem 0.85rem;">Dashboard</a>
        <button id="logout-btn" class="btn-nav-logout" title="Log Out">Sign Out</button>
      </div>
    `;

    navActions.innerHTML = userHtml;

    if (mobileActions) {
      mobileActions.innerHTML = `
        <a href="${dashboardUrl}" class="btn btn-primary btn-block">My Dashboard (${roleBadge})</a>
        <button id="mobile-logout-btn" class="btn btn-secondary btn-block">Sign Out</button>
      `;
    }

    const logoutBtns = [document.getElementById("logout-btn"), document.getElementById("mobile-logout-btn")];
    logoutBtns.forEach(btn => {
      if (btn) {
        btn.addEventListener("click", () => {
          logoutUser();
          showToast("You have been signed out.", "info");
          setTimeout(() => {
            window.location.href = "index.html";
          }, 600);
        });
      }
    });

  } else {
    // Guest view: Show standard Login / Register + Start Selling
    navActions.innerHTML = `
      <a href="login.html" class="nav-link">Login</a>
      <a href="register.html" class="btn btn-nav-outline">Register</a>
      <a href="create-auction.html" class="btn btn-sell">Start Selling</a>
    `;

    if (mobileActions) {
      mobileActions.innerHTML = `
        <a href="login.html" class="btn btn-secondary btn-block">Login</a>
        <a href="register.html" class="btn btn-primary btn-block">Register</a>
        <a href="create-auction.html" class="btn btn-sell btn-block">Start Selling</a>
      `;
    }
  }
}

// Toast notification container setup
function initToastContainer() {
  if (!document.getElementById("toast-container")) {
    const container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
}

// Global Toast Dispatcher
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  let icon = "✓";
  if (type === "danger") icon = "✕";
  if (type === "warning") icon = "⚠️";
  if (type === "info") icon = "ℹ️";

  toast.innerHTML = `
    <span class="toast-icon">${icon}</span>
    <span class="toast-msg">${escapeHTML(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  // Auto dismiss after 3.8s
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => {
      toast.remove();
    }, 400);
  }, 3800);
}
