document.addEventListener('DOMContentLoaded', () => {
  const emailInput = document.getElementById('login-email');
  const remember = document.getElementById('remember-me');
  const rememberedEmail = localStorage.getItem('bidlive_remembered_email');
  if (emailInput && rememberedEmail) {
    emailInput.value = rememberedEmail;
    if (remember) remember.checked = true;
  }
  initLoginForm();
  initRegisterForm();
});

function getPostAuthDestination(user, fallback) {
  const hasIntent = localStorage.getItem('bidlive_start_selling_intent') === 'true';
  if (!hasIntent) return sessionStorage.getItem('bidlive_return_to') || fallback;
  localStorage.removeItem('bidlive_start_selling_intent');
  if (user.role === 'seller') return 'create-auction.html';
  showToast('Seller access is required to create an auction. You are signed in as a buyer.', 'info');
  return fallback;
}

function finishAuthentication(user, token, remember) {
  if (remember) localStorage.setItem('bidlive_remembered_email', user.email);
  else localStorage.removeItem('bidlive_remembered_email');
  setCurrentUser(user, token, remember);
  showToast(`Welcome${user.name ? `, ${user.name}` : ''}!`, 'success');
  const fallback = user.role === 'seller' ? 'seller-dashboard.html' : 'buyer-dashboard.html';
  const destination = getPostAuthDestination(user, fallback);
  sessionStorage.removeItem('bidlive_return_to');
  setTimeout(() => window.location.assign(destination), 450);
}

function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me');
    if (!isValidEmail(email) || !password) return showToast('Enter a valid email address and password.', 'warning');
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await apiRequest('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      finishAuthentication(result.user, result.token, Boolean(remember && remember.checked));
    } catch (error) { showToast(error.message, 'danger'); }
    finally { if (submit) submit.disabled = false; }
  });
}

function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;
  const roleOptions = document.querySelectorAll('.role-option');
  roleOptions.forEach(option => option.addEventListener('click', () => {
    roleOptions.forEach(item => item.classList.remove('active'));
    option.classList.add('active');
    const radio = option.querySelector('input[type="radio"]');
    if (radio) radio.checked = true;
  }));

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirmation = document.getElementById('reg-confirm-password').value;
    const role = document.querySelector('input[name="account-type"]:checked')?.value;
    const terms = document.getElementById('terms-agree');
    if (name.length < 2) return showToast('Enter your name (at least 2 characters).', 'warning');
    if (!isValidEmail(email)) return showToast('Enter a valid email address.', 'warning');
    if (password.length < 8 || password.length > 72) return showToast('Password must be between 8 and 72 characters.', 'warning');
    if (password !== confirmation) return showToast('Passwords do not match.', 'danger');
    if (!['buyer', 'seller'].includes(role)) return showToast('Select an account type (Buyer or Seller).', 'warning');
    if (terms && !terms.checked) return showToast('Please acknowledge the demo terms to continue.', 'warning');

    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const result = await apiRequest('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password, role }) });
      finishAuthentication(result.user, result.token, true);
    } catch (error) { showToast(error.message, 'danger'); }
    finally { if (submit) submit.disabled = false; }
  });
}

function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }

