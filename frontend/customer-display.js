const displayChannelName = 'brew-benefits-customer-display';
const displayChannel = 'BroadcastChannel' in window ? new BroadcastChannel(displayChannelName) : null;
const displayMoney = amount => new Intl.NumberFormat('id-ID', {
  style:'currency',
  currency:'IDR',
  maximumFractionDigits:0
}).format(Number(amount || 0));
const displayEscape = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&':'&amp;',
  '<':'&lt;',
  '>':'&gt;',
  "'":'&#39;',
  '"':'&quot;'
}[character]));

const idleView = document.querySelector('#display-idle');
const orderView = document.querySelector('#display-order');
const completeView = document.querySelector('#display-complete');
const connectionLabel = document.querySelector('#display-connection');

function renderCustomerDisplay(snapshot) {
  if (!snapshot || snapshot.type !== 'customer-display-state') return;
  const isComplete = snapshot.status === 'complete';
  const hasItems = Array.isArray(snapshot.items) && snapshot.items.length > 0;
  idleView.hidden = isComplete || hasItems;
  orderView.hidden = isComplete || !hasItems;
  completeView.hidden = !isComplete;
  connectionLabel.textContent = 'Display connected';

  if (isComplete) {
    document.querySelector('#display-complete-total').textContent = displayMoney(snapshot.total);
    document.querySelector('#display-complete-items').innerHTML = (snapshot.items || []).map(item =>
      `<div><span>${displayEscape(item.name)}<small>${displayMoney(item.price)} × ${Number(item.qty)}</small></span><b>${displayMoney(Number(item.price) * Number(item.qty))}</b></div>`
    ).join('');
    document.querySelector('#display-complete-subtotal').textContent = displayMoney(snapshot.subtotal);
    const completeDiscount = document.querySelector('#display-complete-discount');
    completeDiscount.hidden = !(Number(snapshot.discountAmount) > 0);
    completeDiscount.textContent = `Membership discount (${Number(snapshot.discountPct)}%): − ${displayMoney(snapshot.discountAmount)}`;
    const paymentLabels = { CASH:'Cash', QRIS:'QRIS', DEBIT:'Debit', EWALLET:'E-Wallet' };
    document.querySelector('#display-complete-payment').textContent = paymentLabels[snapshot.paymentMethod] || '—';
    document.querySelector('#display-complete-cash-details').hidden = snapshot.paymentMethod !== 'CASH';
    document.querySelector('#display-receipt').textContent = snapshot.receiptNo
      ? `Receipt ${snapshot.receiptNo}`
      : 'Thank you for your purchase';
    return;
  }
  if (!hasItems) return;

  const items = snapshot.items.filter(item =>
    item && typeof item.name === 'string' && Number.isFinite(Number(item.price)) &&
    Number.isFinite(Number(item.qty)) && Number(item.qty) > 0
  );
  document.querySelector('#display-item-count').textContent =
    `${items.reduce((count, item) => count + Number(item.qty), 0)} ${items.reduce((count, item) => count + Number(item.qty), 0) === 1 ? 'item' : 'items'}`;
  document.querySelector('#display-items').innerHTML = items.map(item => {
    const image = typeof item.imageUrl === 'string' && item.imageUrl
      ? `<img src="${displayEscape(item.imageUrl)}" alt="" loading="lazy"><span class="customer-product-placeholder" hidden>☕</span>`
      : '<span class="customer-product-placeholder">☕</span>';
    return `<article class="customer-order-item"><div class="customer-product-image">${image}</div><div class="customer-product-details"><h2>${displayEscape(item.name)}</h2><p>${displayMoney(item.price)} <span>× ${Number(item.qty)}</span></p></div><strong class="customer-line-total">${displayMoney(Number(item.price) * Number(item.qty))}</strong></article>`;
  }).join('');
  document.querySelectorAll('.customer-product-image img').forEach(image => {
    image.addEventListener('error', () => {
      image.hidden = true;
      image.nextElementSibling.hidden = false;
    }, { once:true });
  });
  document.querySelector('#display-subtotal').textContent = displayMoney(snapshot.subtotal);
  document.querySelector('#display-discount-row').hidden = !(Number(snapshot.discountAmount) > 0);
  document.querySelector('#display-discount-rate').textContent = `(${Number(snapshot.discountPct)}%)`;
  document.querySelector('#display-discount').textContent = `− ${displayMoney(snapshot.discountAmount)}`;
  document.querySelector('#display-total').textContent = displayMoney(snapshot.total);
  const paymentLabels = { CASH:'Cash', QRIS:'QRIS', DEBIT:'Debit', EWALLET:'E-Wallet' };
  document.querySelector('#display-payment').textContent = paymentLabels[snapshot.paymentMethod] || '—';
  document.querySelector('#display-cash-details').hidden = true;
}

if (displayChannel) {
  displayChannel.onmessage = event => renderCustomerDisplay(event.data);
  displayChannel.postMessage({ type:'request-state' });
} else {
  connectionLabel.textContent = 'Live sync unavailable';
}

const fullscreenButton = document.querySelector('#display-fullscreen');
fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    console.error('Unable to change fullscreen mode:', error);
    fullscreenButton.textContent = 'Fullscreen unavailable';
  }
});
document.addEventListener('fullscreenchange', () => {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenButton.textContent = isFullscreen ? '× Exit fullscreen' : '⛶ Fullscreen';
  fullscreenButton.setAttribute('aria-pressed', String(isFullscreen));
});
