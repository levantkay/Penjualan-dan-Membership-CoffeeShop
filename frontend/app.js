const { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY } = window.SUPABASE_CONFIG || {};
const configured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient &&
  !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE')
);
const db = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const PRODUCT_IMAGE_BUCKET = 'product-images';
const PRODUCT_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
const PRODUCT_IMAGE_TYPES = {
  jpg: { mime:'image/jpeg', extension:'jpg' },
  jpeg: { mime:'image/jpeg', extension:'jpg' },
  png: { mime:'image/png', extension:'png' },
  webp: { mime:'image/webp', extension:'webp' }
};
const DEFAULT_PRODUCT_IMAGES = {
  'CF-001':'photo-1517701604599-bb29b565090c',
  'CF-002':'photo-1461023058943-07fcbe16d735',
  'CF-003':'photo-1511920170033-f8396924c348',
  'CF-004':'photo-1515823064-d6e0c04616a7',
  'CF-005':'photo-1544787219-7f47ccb76574',
  'CF-006':'photo-1495474472287-4d71bcdd2085',
  'CF-007':'photo-1509042239860-f550ce710b93',
  'FD-001':'photo-1555507036-ab1f4038808a',
  'FD-002':'photo-1509365465985-25d11c17e812',
  'FD-004':'photo-1623334044303-241021148842',
  'SN-001':'photo-1573080496219-bb080dd4f877',
  'SN-002':'photo-1547592180-85f173990554'
};
const DEFAULT_CATEGORY_IMAGES = {
  Coffee:'photo-1509042239860-f550ce710b93',
  'Non-Coffee':'photo-1544787219-7f47ccb76574',
  Pastry:'photo-1555507036-ab1f4038808a',
  Snack:'photo-1573080496219-bb080dd4f877'
};

const state = {
  products: [],
  members: [],
  memberLookup: null,
  cart: [],
  activeCategory: 'All',
  sales: [],
  transactionFilter: 'ALL',
  revenueFilter: 'ALL',
  membershipFees: { monthly:35000, reactivation:10000 },
  membershipBillingReady: false,
  pendingMembershipAction: null,
  editingMemberId: null,
  editingProductId: null,
  accountingEntries: [],
  journalFilter: 'ALL',
  journalQueryId: 0,
  journalLoading: false,
  journalError: null,
  accountingReady: false,
  accountingError: null,
  revenueEntries: [],
  revenueRange: null,
  revenueQueryId: 0,
  revenueLoading: false,
  charts: {}
};

const BUSINESS_TIME_ZONE = 'Asia/Jakarta';
const money = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n || 0));
function dateValue(value) {
  const text = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T00:00:00+07:00`);
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(text) && !/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(text)) {
    return new Date(`${text.replace(' ', 'T')}+07:00`);
  }
  return new Date(value);
}
const dateFmt = value => dateValue(value).toLocaleDateString('id-ID', {
  day:'2-digit',
  month:'short',
  year:'numeric',
  timeZone:BUSINESS_TIME_ZONE
});
const dateTimeFmt = value => dateValue(value).toLocaleString('id-ID', {
  day:'2-digit',
  month:'short',
  hour:'2-digit',
  minute:'2-digit',
  timeZone:BUSINESS_TIME_ZONE
});
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const unsplashImage = photoId => `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=480&q=85`;
let productImagePreviewObjectUrl = null;

function productImageUrl(product) {
  if (product.image_path) {
    if (/^https?:\/\//i.test(product.image_path)) return product.image_path;
    if (configured) return db.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(product.image_path).data.publicUrl;
  }
  const photoId = DEFAULT_PRODUCT_IMAGES[product.sku] || DEFAULT_CATEGORY_IMAGES[product.category];
  return photoId ? unsplashImage(photoId) : '';
}

function isStoredProductImage(path) {
  return Boolean(path && !/^https?:\/\//i.test(path));
}

function validateProductImage(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  const imageType = PRODUCT_IMAGE_TYPES[extension];
  if (!imageType || (file.type && file.type !== imageType.mime)) {
    throw new Error('Pilih gambar berformat JPG, JPEG, PNG, atau WEBP.');
  }
  if (!file.size || file.size > PRODUCT_IMAGE_MAX_SIZE) {
    throw new Error('Ukuran gambar harus lebih dari 0 dan maksimal 5 MB.');
  }
  return imageType;
}

async function uploadProductImage(file) {
  const imageType = validateProductImage(file);
  if (!window.crypto?.randomUUID) throw new Error('Browser ini tidak mendukung upload gambar yang aman.');
  const path = `products/${window.crypto.randomUUID()}.${imageType.extension}`;
  const { error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, file, {
    cacheControl:'31536000',
    contentType:imageType.mime,
    upsert:false
  });
  if (error) throw error;
  return path;
}

async function removeStoredProductImage(path) {
  if (!isStoredProductImage(path)) return;
  const { error } = await db.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  if (error) throw error;
}

function toast(message, type = 'info') {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.className = `toast show ${type}`;
  setTimeout(() => el.className = 'toast', 2600);
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.querySelector(`#view-${name}`).classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelector('#page-title').textContent = { dashboard:'Dashboard', sales:'Sales', 'transaction-history':'Transaction History', membership:'Membership', products:'Products', accounting:'Accounting & Finance' }[name];
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
document.querySelectorAll('[data-go]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.go)));
document.querySelectorAll('[data-transaction-filter]').forEach(button => button.addEventListener('click', () => {
  state.transactionFilter = button.dataset.transactionFilter;
  renderSalesHistory();
}));
document.querySelectorAll('[data-accounting-tab]').forEach(button => button.addEventListener('click', () => showAccountingPane(button.dataset.accountingTab)));
document.querySelector('#journal-period').addEventListener('change', () => {
  if (document.querySelector('#journal-period').value !== 'custom') setJournalReportingPeriod();
  applyJournalFilters();
});
['#journal-date-from', '#journal-date-to'].forEach(selector => {
  document.querySelector(selector).addEventListener('change', () => {
    document.querySelector('#journal-period').value = 'custom';
    applyJournalFilters();
  });
});
document.querySelector('#apply-journal-filters').addEventListener('click', applyJournalFilters);
document.querySelectorAll('[data-journal-filter]').forEach(button => button.addEventListener('click', () => {
  state.journalFilter = button.dataset.journalFilter;
  document.querySelectorAll('[data-journal-filter]').forEach(filterButton => {
    const selected = filterButton.dataset.journalFilter === state.journalFilter;
    filterButton.classList.toggle('active', selected);
    filterButton.setAttribute('aria-pressed', String(selected));
  });
  applyJournalFilters();
}));
document.querySelector('#revenue-period').addEventListener('change', () => {
  if (document.querySelector('#revenue-period').value !== 'custom') setRevenueReportPeriod();
  renderRevenueReport();
});
document.querySelector('#apply-revenue-period').addEventListener('click', renderRevenueReport);
['#revenue-date-from', '#revenue-date-to'].forEach(selector => {
  document.querySelector(selector).addEventListener('change', () => {
    document.querySelector('#revenue-period').value = 'custom';
    renderRevenueReport();
  });
});
document.querySelectorAll('[data-revenue-filter]').forEach(button => button.addEventListener('click', () => {
  state.revenueFilter = button.dataset.revenueFilter;
  document.querySelectorAll('[data-revenue-filter]').forEach(filterButton => {
    const selected = filterButton.dataset.revenueFilter === state.revenueFilter;
    filterButton.classList.toggle('active', selected);
    filterButton.setAttribute('aria-pressed', String(selected));
  });
  renderRevenueReport();
}));
document.querySelector('#print-revenue-report').addEventListener('click', () => window.print());
document.querySelector('#export-revenue-report').addEventListener('click', exportRevenueReport);
window.addEventListener('beforeprint', () => {
  const pane = document.querySelector('#accounting-pane-revenue-report');
  if (!pane.classList.contains('active')) return;
  const from = document.querySelector('#revenue-date-from').value;
  const to = document.querySelector('#revenue-date-to').value;
  if (!state.revenueLoading && state.revenueRange?.from === from &&
      state.revenueRange?.to === to && state.revenueRange?.filter === state.revenueFilter) {
    renderRevenueChart(calculateRevenueReport(state.revenueEntries, from, to, state.revenueFilter), true);
  }
});
window.addEventListener('afterprint', () => {
  if (document.querySelector('#accounting-pane-revenue-report').classList.contains('active')) renderRevenueReport();
});

document.querySelector('#today-pill').textContent = new Date().toLocaleDateString('id-ID', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
document.querySelector('#refresh-btn').addEventListener('click', loadAll);

function membershipRule(joinedAt) {
  const joined = new Date(joinedAt);
  const now = new Date();
  let months = (now.getFullYear() - joined.getFullYear()) * 12 + (now.getMonth() - joined.getMonth());
  if (now.getDate() < joined.getDate()) months -= 1;
  months = Math.max(0, months);
  if (months < 3) return { months, tier:'BRONZE', discount:5 };
  if (months < 6) return { months, tier:'SILVER', discount:10 };
  return { months, tier:'GOLD', discount:15 };
}

function getTierBadge(tier) {
  return `<span class="tier-badge ${tier.toLowerCase()}">${tier}</span>`;
}

async function loadAll() {
  if (!configured) {
    toast('Isi backend/config.js dengan Supabase URL + anon key.', 'warn');
    renderDemoState();
    return;
  }
  try {
    const [{ data: products, error: pErr }, { data: members, error: mErr }, sales, { data: fees, error: feeErr }] = await Promise.all([
      db.from('products').select('*').order('category').order('name'),
      db.from('members').select('*').order('joined_at', { ascending:false }),
      loadSalesHistory(),
      db.rpc('get_membership_fees').single()
    ]);
    if (pErr) throw pErr;
    if (mErr) throw mErr;
    state.products = products || [];
    state.members = members || [];
    state.sales = sales || [];
    state.membershipBillingReady = !feeErr;
    if (feeErr) {
      state.membershipFees = { monthly:35000, reactivation:10000 };
      toast('Jalankan backend/membership_billing_migration.sql di Supabase untuk mengaktifkan iuran dan perubahan status.', 'warn');
    } else {
      state.membershipFees = { monthly:Number(fees.monthly_fee), reactivation:Number(fees.reactivation_fee) };
    }
    renderAll();
    await loadAccountingData();
  } catch (err) {
    console.error(err);
    toast(`Supabase error: ${err.message}`, 'error');
  }
}

async function loadSalesHistory() {
  const pageSize = 1000;
  const sales = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from('sales')
      .select('id, receipt_no, sold_at, member_id, subtotal, discount_pct, discount_amount, total, payment_method')
      .order('sold_at', { ascending:false })
      .order('id', { ascending:false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    sales.push(...(data || []));
    if (!data || data.length < pageSize) return sales;
  }
}

async function loadAccountingData() {
  if (!configured) {
    state.accountingReady = false;
    state.journalLoading = false;
    state.journalError = null;
    state.accountingError = 'Hubungkan Supabase dan jalankan backend/accounting_migration.sql untuk menggunakan Accounting & Finance.';
    renderAccounting();
    return;
  }
  state.journalQueryId += 1;
  state.accountingReady = false;
  state.journalLoading = true;
  state.journalError = null;
  renderJournal();
  try {
    ensureJournalReportingPeriod();
    const { from, to } = journalDateRange();
    state.accountingEntries = await loadJournalEntries(from, to, state.journalFilter);
    state.accountingReady = true;
    state.accountingError = null;
    state.journalError = null;
  } catch (err) {
    console.error(err);
    state.accountingReady = false;
    state.accountingEntries = [];
    state.journalError = null;
    state.accountingError = `Accounting database belum siap. Jalankan backend/accounting_migration.sql. (${err.message})`;
  }
  state.journalLoading = false;
  renderAccounting();
}

async function loadJournalEntries(from, to, filter) {
  const pageSize = 500;
  const entries = [];
  const sourceTypes = filter === 'ALL' ? ['SALE', 'MEMBERSHIP'] : [filter];
  // Include adjacent stored dates, then apply the exact Asia/Jakarta source-date range in renderJournal.
  const queryFrom = shiftJournalDate(from, -1);
  const queryTo = shiftJournalDate(to, 1);
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from('journal_entries')
      .select('id,journal_no,entry_date,source_type,source_reference,description,status,journal_lines(id,account_id,description,debit,credit,chart_of_accounts(account_code,account_name,account_type,system_role))')
      .eq('status', 'POSTED')
      .in('source_type', sourceTypes)
      .gte('entry_date', queryFrom)
      .lte('entry_date', queryTo)
      .order('entry_date', { ascending:false })
      .order('journal_no', { ascending:false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    entries.push(...(data || []));
    if (!data || data.length < pageSize) return entries;
  }
}

async function loadRevenueEntries(from, to, filter) {
  const pageSize = 500;
  const sourceTypes = filter === 'ALL' ? ['SALE', 'MEMBERSHIP'] : [filter];
  const entries = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from('journal_entries')
      .select('id,journal_no,entry_date,source_type,source_reference,description,status,journal_lines(id,account_id,description,debit,credit,chart_of_accounts(account_code,account_name,account_type,system_role))')
      .eq('status', 'POSTED')
      .in('source_type', sourceTypes)
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending:false })
      .order('journal_no', { ascending:false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    entries.push(...(data || []));
    if (!data || data.length < pageSize) return entries;
  }
}

function showAccountingPane(name) {
  document.querySelectorAll('[data-accounting-tab]').forEach(button => {
    const selected = button.dataset.accountingTab === name;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  document.querySelectorAll('.accounting-pane').forEach(pane => {
    const selected = pane.id === `accounting-pane-${name}`;
    pane.classList.toggle('active', selected);
    pane.hidden = !selected;
  });
  if (name === 'revenue-report') renderRevenueReport();
}

function renderAccounting() {
  const setupMessage = document.querySelector('#accounting-setup-message');
  setupMessage.hidden = !state.accountingError;
  setupMessage.textContent = state.accountingError || '';
  renderProducts();
  renderJournal();
  renderRevenueReport();
}

function journalLineAccount(line) {
  return Array.isArray(line.chart_of_accounts) ? line.chart_of_accounts[0] : line.chart_of_accounts;
}

function journalTransactionDate(entry) {
  const reference = String(entry.source_reference || '').toUpperCase();
  if (entry.source_type === 'SALE') {
    return state.sales.find(sale => String(sale.receipt_no || '').toUpperCase() === reference)?.sold_at || entry.entry_date;
  }
  if (entry.source_type === 'MEMBERSHIP') {
    for (const member of state.members) {
      const payments = Array.isArray(member.membership_payments) ? member.membership_payments : [];
      const index = payments.findIndex((payment, paymentIndex) => {
        const receipt = payment.receipt_no || `MBR-${member.id}-${paymentIndex + 1}`;
        return String(receipt).toUpperCase() === reference;
      });
      if (index >= 0) {
        const payment = payments[index];
        return payment.paid_at || payment.coverage_start || member.joined_at || entry.entry_date;
      }
    }
  }
  return entry.entry_date;
}

function journalIsoDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function journalBusinessToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:BUSINESS_TIME_ZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(new Date()).reduce((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
}

function journalPeriodDates(period) {
  const today = journalBusinessToday();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  let start;
  let end;
  if (period === 'daily') {
    start = new Date(Date.UTC(year, month, day));
    end = new Date(Date.UTC(year, month, day));
  } else if (period === 'weekly') {
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    start = new Date(Date.UTC(year, month, day - mondayOffset));
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
  } else if (period === 'yearly') {
    start = new Date(Date.UTC(year, 0, 1));
    end = new Date(Date.UTC(year, 11, 31));
  } else {
    start = new Date(Date.UTC(year, month, 1));
    end = new Date(Date.UTC(year, month + 1, 0));
  }
  return { from:journalIsoDate(start), to:journalIsoDate(end) };
}

function setJournalReportingPeriod() {
  const range = journalPeriodDates(document.querySelector('#journal-period').value);
  document.querySelector('#journal-date-from').value = range.from;
  document.querySelector('#journal-date-to').value = range.to;
}

function ensureJournalReportingPeriod() {
  const from = document.querySelector('#journal-date-from');
  const to = document.querySelector('#journal-date-to');
  if (!from.value || !to.value) {
    const period = document.querySelector('#journal-period');
    if (period.value === 'custom') period.value = 'monthly';
    setJournalReportingPeriod();
  }
}

function journalDateRange() {
  return {
    from:document.querySelector('#journal-date-from').value,
    to:document.querySelector('#journal-date-to').value
  };
}

function shiftJournalDate(value, days) {
  const [year, month, day] = value.split('-').map(Number);
  return journalIsoDate(new Date(Date.UTC(year, month - 1, day + days)));
}

function journalDateKey(value) {
  const date = dateValue(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:BUSINESS_TIME_ZONE,
    year:'numeric',
    month:'2-digit',
    day:'2-digit'
  }).formatToParts(date).reduce((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function applyJournalFilters() {
  ensureJournalReportingPeriod();
  const { from, to } = journalDateRange();
  const requestId = ++state.journalQueryId;
  state.journalError = null;
  if (!from || !to) {
    state.accountingEntries = [];
    state.journalError = 'Select both a start date and an end date.';
    state.journalLoading = false;
    renderJournal();
    return;
  }
  if (from > to) {
    state.accountingEntries = [];
    state.journalError = 'The start date must be on or before the end date.';
    state.journalLoading = false;
    renderJournal();
    return;
  }
  if (!state.accountingReady) {
    state.journalLoading = false;
    renderJournal();
    return;
  }

  state.journalLoading = true;
  renderJournal();
  try {
    const entries = await loadJournalEntries(from, to, state.journalFilter);
    if (requestId !== state.journalQueryId) return;
    state.accountingEntries = entries;
  } catch (err) {
    if (requestId !== state.journalQueryId) return;
    console.error(err);
    state.accountingEntries = [];
    state.journalError = `Unable to load General Journal: ${err.message}`;
  } finally {
    if (requestId === state.journalQueryId) {
      state.journalLoading = false;
      renderJournal();
    }
  }
}

function renderJournal() {
  ensureJournalReportingPeriod();
  const { from, to } = journalDateRange();
  const label = document.querySelector('#journal-period-label');
  const periodLabels = { daily:'Daily', weekly:'Weekly', monthly:'Monthly', yearly:'Yearly', custom:'Custom Range' };
  const filterLabels = { ALL:'All Transactions', SALE:'Sales', MEMBERSHIP:'Membership' };
  const period = document.querySelector('#journal-period').value;
  const periodDescription = `${periodLabels[period]} · ${from && to ? `${dateFmt(from)} – ${dateFmt(to)}` : ''} · ${filterLabels[state.journalFilter]}`;
  const filtersDisabled = !state.accountingReady;
  document.querySelector('#journal-period').disabled = filtersDisabled;
  document.querySelector('#journal-date-from').disabled = filtersDisabled;
  document.querySelector('#journal-date-to').disabled = filtersDisabled;
  document.querySelector('#apply-journal-filters').disabled = filtersDisabled;
  document.querySelectorAll('[data-journal-filter]').forEach(button => { button.disabled = filtersDisabled; });

  const renderEmpty = message => {
    document.querySelector('#journal-body').innerHTML = `<tr><td colspan="7" class="empty-cell">${escapeHtml(message)}</td></tr>`;
    document.querySelector('#journal-total-debit').textContent = money(0);
    document.querySelector('#journal-total-credit').textContent = money(0);
  };
  if (state.journalError) {
    label.textContent = state.journalError;
    renderEmpty(state.journalError);
    return;
  }
  if (!state.accountingReady) {
    label.textContent = state.accountingError || periodDescription;
    renderEmpty('Accounting data is unavailable.');
    return;
  }
  if (!from || !to || from > to) {
    label.textContent = !from || !to ? 'Select both a start date and an end date.' : 'The start date must be on or before the end date.';
    renderEmpty(label.textContent);
    return;
  }
  label.textContent = `${periodDescription}${state.journalLoading ? ' · Loading…' : ''}`;
  const entries = state.accountingEntries
    .filter(entry => entry.status === 'POSTED' &&
      (state.journalFilter === 'ALL' || entry.source_type === state.journalFilter))
    .map(entry => {
      const transactionDate = journalTransactionDate(entry);
      return { entry, transactionDate, dateKey:journalDateKey(transactionDate) };
    })
    .filter(entry => entry.dateKey >= from && entry.dateKey <= to)
    .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  const rows = [];
  let totalDebit = 0;
  let totalCredit = 0;
  entries.forEach(({ entry, transactionDate }) => {
    (entry.journal_lines || []).forEach(line => {
      const account = journalLineAccount(line) || {};
      totalDebit += Number(line.debit || 0);
      totalCredit += Number(line.credit || 0);
      rows.push(`<tr><td><span class="mono">${escapeHtml(entry.journal_no)}</span></td><td>${dateFmt(transactionDate)}</td><td><span class="mono">${escapeHtml(entry.source_reference)}</span><br><small>${escapeHtml(entry.source_type)}</small></td><td>${escapeHtml(account.account_code || '')} · ${escapeHtml(account.account_name || 'Account unavailable')}</td><td>${escapeHtml(line.description || entry.description || '')}</td><td>${Number(line.debit) ? money(line.debit) : '—'}</td><td>${Number(line.credit) ? money(line.credit) : '—'}</td></tr>`);
    });
  });
  document.querySelector('#journal-body').innerHTML = rows.join('') || '<tr><td colspan="7" class="empty-cell">No journal entries match the selected filters.</td></tr>';
  document.querySelector('#journal-total-debit').textContent = money(totalDebit);
  document.querySelector('#journal-total-credit').textContent = money(totalCredit);
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function setRevenueReportPeriod() {
  const today = new Date();
  const period = document.querySelector('#revenue-period').value;
  let start;
  let end;
  if (period === 'quarter') {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    start = new Date(today.getFullYear(), quarterStartMonth, 1);
    end = new Date(today.getFullYear(), quarterStartMonth + 3, 0);
  } else if (period === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear(), 11, 31);
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }
  document.querySelector('#revenue-date-from').value = isoDate(start);
  document.querySelector('#revenue-date-to').value = isoDate(end);
}

function calculateRevenueReport(entries, from, to, filter = 'ALL') {
  const totals = { salesRevenue:0, membershipRevenue:0 };
  const seenReferences = new Set();
  entries.filter(entry =>
    entry.status === 'POSTED' &&
    (entry.source_type === 'SALE' || entry.source_type === 'MEMBERSHIP') &&
    entry.entry_date >= from && entry.entry_date <= to &&
    (filter === 'ALL' || entry.source_type === filter)
  ).forEach(entry => {
    const reference = String(entry.source_reference || entry.id);
    if (seenReferences.has(reference)) return;
    seenReferences.add(reference);
    (entry.journal_lines || []).forEach(line => {
      const account = journalLineAccount(line) || {};
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      if (entry.source_type === 'SALE' && account.system_role === 'SALES_REVENUE') totals.salesRevenue += credit - debit;
      else if (entry.source_type === 'MEMBERSHIP' && account.system_role === 'MEMBERSHIP_REVENUE') totals.membershipRevenue += credit - debit;
    });
  });
  totals.totalRevenue = totals.salesRevenue + totals.membershipRevenue;
  return totals;
}

function renderRevenueChart(totals, printMode = false) {
  const canvas = document.querySelector('#revenueChart');
  if (state.charts.revenue) state.charts.revenue.destroy();
  if (!window.Chart) return;
  state.charts.revenue = new Chart(canvas, {
    type:'bar',
    data:{
      labels:['Sales Revenue', 'Membership Revenue'],
      datasets:[{
        data:[totals.salesRevenue, totals.membershipRevenue],
        backgroundColor:['rgba(214,160,84,.78)', 'rgba(126,161,137,.78)'],
        borderRadius:8,
        borderSkipped:false
      }]
    },
    options:{
      indexAxis:'y',
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:context => money(context.raw) } } },
      scales:{
        x:{ beginAtZero:true, grid:{ color:printMode ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.06)' }, ticks:{ color:printMode ? '#111' : '#bdb4aa', callback:value => `Rp ${Math.round(value / 1000)}k` } },
        y:{ grid:{ display:false }, ticks:{ color:printMode ? '#111' : '#bdb4aa' } }
      }
    }
  });
}

function setRevenueReportLoading(isLoading) {
  state.revenueLoading = isLoading;
  ['#apply-revenue-period', '#print-revenue-report', '#export-revenue-report'].forEach(selector => {
    document.querySelector(selector).disabled = isLoading;
  });
}

function renderRevenueReport() {
  const reportSelectors = ['#revenue-sales', '#revenue-membership', '#revenue-total'];
  const requestId = ++state.revenueQueryId;
  if (!state.accountingReady) {
    document.querySelector('#revenue-report-period-label').textContent = 'Accounting data is unavailable until the database migration is applied.';
    reportSelectors.forEach(selector => { document.querySelector(selector).textContent = '—'; });
    state.revenueEntries = [];
    state.revenueRange = null;
    setRevenueReportLoading(false);
    if (state.charts.revenue) {
      state.charts.revenue.destroy();
      state.charts.revenue = null;
    }
    return;
  }
  if (!document.querySelector('#revenue-date-from').value && !document.querySelector('#revenue-date-to').value &&
      document.querySelector('#revenue-period').value !== 'custom') setRevenueReportPeriod();
  const rangeStart = document.querySelector('#revenue-date-from').value;
  const rangeEnd = document.querySelector('#revenue-date-to').value;
  const label = document.querySelector('#revenue-report-period-label');
  if (!rangeStart || !rangeEnd) {
    label.textContent = 'Select both a start date and an end date.';
    reportSelectors.forEach(selector => { document.querySelector(selector).textContent = '—'; });
    state.revenueEntries = [];
    state.revenueRange = null;
    setRevenueReportLoading(false);
    if (state.charts.revenue) {
      state.charts.revenue.destroy();
      state.charts.revenue = null;
    }
    return;
  }
  if (rangeStart > rangeEnd) {
    label.textContent = 'The start date must be on or before the end date.';
    reportSelectors.forEach(selector => { document.querySelector(selector).textContent = '—'; });
    state.revenueEntries = [];
    state.revenueRange = null;
    setRevenueReportLoading(false);
    if (state.charts.revenue) {
      state.charts.revenue.destroy();
      state.charts.revenue = null;
    }
    return;
  }
  const filterLabels = { ALL:'All Revenue', SALE:'Sales', MEMBERSHIP:'Membership' };
  const filter = state.revenueFilter;
  label.textContent = `${dateFmt(rangeStart)} – ${dateFmt(rangeEnd)} · ${filterLabels[filter]}`;
  reportSelectors.forEach(selector => { document.querySelector(selector).textContent = '—'; });
  state.revenueRange = null;
  if (state.charts.revenue) {
    state.charts.revenue.destroy();
    state.charts.revenue = null;
  }
  setRevenueReportLoading(true);
  loadRevenueEntries(rangeStart, rangeEnd, filter)
    .then(entries => {
      if (requestId !== state.revenueQueryId) return;
      state.revenueEntries = entries;
      state.revenueRange = { from:rangeStart, to:rangeEnd, filter };
      const totals = calculateRevenueReport(entries, rangeStart, rangeEnd, filter);
      document.querySelector('#revenue-sales').textContent = money(totals.salesRevenue);
      document.querySelector('#revenue-membership').textContent = money(totals.membershipRevenue);
      document.querySelector('#revenue-total').textContent = money(totals.totalRevenue);
      renderRevenueChart(totals);
    })
    .catch(error => {
      if (requestId !== state.revenueQueryId) return;
      console.error(error);
      state.revenueEntries = [];
      state.revenueRange = null;
      label.textContent = `Unable to load revenue report: ${error.message}`;
    })
    .finally(() => {
      if (requestId === state.revenueQueryId) setRevenueReportLoading(false);
    });
}

function exportRevenueReport() {
  if (!state.accountingReady) {
    toast('Accounting data is unavailable until the database migration is applied.', 'warn');
    return;
  }
  const from = document.querySelector('#revenue-date-from').value;
  const to = document.querySelector('#revenue-date-to').value;
  if (!from || !to || from > to) {
    toast('Select a valid reporting date range before exporting.', 'warn');
    return;
  }
  if (state.revenueLoading || !state.revenueRange ||
      state.revenueRange.from !== from || state.revenueRange.to !== to ||
      state.revenueRange.filter !== state.revenueFilter) {
    toast('Wait for the report to finish updating before exporting.', 'warn');
    return;
  }
  const totals = calculateRevenueReport(state.revenueEntries, from, to, state.revenueFilter);
  const rows = [
    ['Revenue Report', `${from} to ${to}`],
    ['Revenue Type', state.revenueFilter],
    ['Currency', 'IDR'],
    ['Sales Revenue', totals.salesRevenue],
    ['Membership Revenue', totals.membershipRevenue],
    ['Total Revenue', totals.totalRevenue]
  ];
  const csv = `\uFEFF${rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `revenue-report-${from}-${to}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderAll() {
  renderProducts();
  renderPOS();
  renderSalesHistory();
  renderMembers();
  renderDashboard();
  renderCart();
  renderAccounting();
}

function renderDemoState() {
  state.products = [
    { id:'demo1', sku:'CF-001', name:'Cloud Latte', category:'Coffee', price:28000, is_active:true },
    { id:'demo2', sku:'CF-002', name:'Brown Sugar Oat', category:'Coffee', price:32000, is_active:true },
    { id:'demo3', sku:'CF-003', name:'Americano', category:'Coffee', price:22000, is_active:true },
    { id:'demo4', sku:'CF-004', name:'Matcha Cream', category:'Non-Coffee', price:30000, is_active:true },
    { id:'demo5', sku:'FD-001', name:'Butter Croissant', category:'Pastry', price:24000, is_active:true },
    { id:'demo6', sku:'FD-002', name:'Cinnamon Roll', category:'Pastry', price:26000, is_active:true }
  ];
  state.members = [
    {id:'m1',membership_number:'BRW-0001',joined_at:'2025-07-01',status:'ACTIVE'},
    {id:'m2',membership_number:'BRW-0002',joined_at:'2026-01-10',status:'ACTIVE'},
    {id:'m3',membership_number:'BRW-0003',joined_at:'2026-04-01',status:'ACTIVE'},
    {id:'m4',membership_number:'BRW-0004',joined_at:'2026-08-01',status:'ACTIVE'},
    {id:'m5',membership_number:'BRW-0005',joined_at:'2026-08-20',status:'ACTIVE'}
  ];
  state.sales = [];
  state.accountingReady = false;
  state.accountingError = 'Hubungkan Supabase dan jalankan backend/accounting_migration.sql untuk menggunakan Accounting & Finance.';
  renderAll();
}

function renderPOS() {
  const cats = ['All', ...new Set(state.products.filter(p => p.is_active).map(p => p.category))];
  const filter = document.querySelector('#category-filter');
  filter.innerHTML = cats.map(cat => `<button class="filter-chip ${cat===state.activeCategory ? 'active':''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`).join('');
  filter.querySelectorAll('.filter-chip').forEach(btn => btn.addEventListener('click', () => { state.activeCategory = btn.dataset.cat; renderPOS(); }));

  const items = state.products.filter(p => p.is_active && (state.activeCategory === 'All' || p.category === state.activeCategory));
  document.querySelector('#pos-products').innerHTML = items.map(p => {
    const imageUrl = productImageUrl(p);
    return `<button class="product-card" data-id="${escapeHtml(p.id)}"><span class="product-thumb ${imageUrl ? '' : 'is-placeholder'}">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(p.name)}" loading="lazy">` : ''}<span class="product-image-placeholder">No image</span></span><div><b>${escapeHtml(p.name)}</b><span>${escapeHtml(p.category)}</span><strong>${money(p.price)}</strong></div></button>`;
  }).join('');
  document.querySelectorAll('.product-thumb img').forEach(image => image.addEventListener('error', () => {
    image.parentElement.classList.add('is-placeholder');
    image.hidden = true;
  }, { once:true }));
  document.querySelectorAll('.product-card').forEach(btn => btn.addEventListener('click', () => addToCart(btn.dataset.id)));
}

function addToCart(id) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  const current = state.cart.find(i => i.product.id === id);
  if (current) current.qty += 1; else state.cart.push({ product, qty: 1 });
  renderCart();
}

function renderCart() {
  const wrap = document.querySelector('#cart-items');
  if (!state.cart.length) {
    wrap.innerHTML = '<div class="empty-state"><span>☕</span><p>Belum ada item.<br>Pilih minuman atau pastry.</p></div>';
  } else {
    wrap.innerHTML = state.cart.map(i => `
      <div class="cart-row"><div><b>${escapeHtml(i.product.name)}</b><small>${money(i.product.price)} × ${i.qty}</small></div><div class="cart-actions"><strong>${money(i.product.price * i.qty)}</strong><button data-remove="${i.product.id}">−</button><span>${i.qty}</span><button data-add="${i.product.id}">＋</button></div></div>
    `).join('');
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.remove, -1)));
    wrap.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => changeQty(b.dataset.add, 1)));
  }
  updateSummary();
}

function renderSalesHistory() {
  const body = document.querySelector('#sales-history-body');
  const transactions = getTransactionHistory().filter(transaction =>
    state.transactionFilter === 'ALL' || transaction.type === state.transactionFilter
  );
  body.innerHTML = transactions.map(transaction => `
    <tr>
      <td><span class="mono">${escapeHtml(transaction.receiptNo || '—')}</span></td>
      <td>${dateTimeFmt(transaction.date)}</td>
      <td><span class="transaction-type-badge ${transaction.type.toLowerCase()}">${transaction.type === 'SALE' ? 'Sales' : 'Membership'}</span></td>
      <td>${escapeHtml(transaction.label)}</td>
      <td>${escapeHtml(transaction.memberNumber)}</td>
      <td><b>${money(transaction.amount)}</b></td>
      <td>${escapeHtml(transaction.paymentMethod)}</td>
      <td><button class="text-button" data-transaction-detail="${escapeHtml(transaction.id)}">Detail</button></td>
    </tr>
  `).join('') || '<tr><td colspan="8" class="empty-cell">Tidak ada transaksi untuk filter ini.</td></tr>';
  document.querySelectorAll('[data-transaction-filter]').forEach(button => {
    button.classList.toggle('active', button.dataset.transactionFilter === state.transactionFilter);
    button.setAttribute('aria-pressed', String(button.dataset.transactionFilter === state.transactionFilter));
  });
  body.querySelectorAll('[data-transaction-detail]').forEach(button => button.addEventListener('click', () => showTransactionDetail(button.dataset.transactionDetail)));
}

function getTransactionHistory() {
  const transactions = state.sales
    .filter(sale => !String(sale.receipt_no || '').toUpperCase().startsWith('MBR-'))
    .map(sale => ({
      id:`sale:${sale.id}`,
      type:'SALE',
      receiptNo:sale.receipt_no,
      date:sale.sold_at,
      label:'POS Sale',
      memberNumber:state.members.find(member => member.id === sale.member_id)?.membership_number || 'Walk-in',
      amount:Number(sale.total),
      paymentMethod:sale.payment_method,
      sale
    }));
  const seenMembershipReceipts = new Set();
  state.members.forEach(member => {
    (Array.isArray(member.membership_payments) ? member.membership_payments : []).forEach((payment, index) => {
      const receiptNo = payment.receipt_no ? String(payment.receipt_no) : '';
      const receiptKey = receiptNo.toUpperCase();
      if (receiptKey && seenMembershipReceipts.has(receiptKey)) return;
      if (receiptKey) seenMembershipReceipts.add(receiptKey);
      const amount = Number(payment.total_amount ?? (Number(payment.subscription_fee || 0) + Number(payment.reactivation_fee || 0)));
      transactions.push({
        id:`membership:${member.id}:${receiptNo || index}`,
        type:'MEMBERSHIP',
        receiptNo,
        date:payment.paid_at || payment.coverage_start || member.joined_at,
        label:membershipPaymentTypeLabel(payment.payment_type),
        memberNumber:member.membership_number,
        amount,
        paymentMethod:payment.payment_method || '—',
        payment
      });
    });
  });
  return transactions
    .filter(transaction => transaction.type !== 'SALE' || !seenMembershipReceipts.has(String(transaction.receiptNo || '').toUpperCase()))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function membershipPaymentTypeLabel(paymentType) {
  const labels = {
    NEW:'Registration',
    REGISTRATION:'Registration',
    RENEWAL:'Renewal',
    REACTIVATION:'Reactivation'
  };
  return labels[String(paymentType || '').toUpperCase()] || 'Membership Payment';
}

async function showTransactionDetail(transactionId) {
  const transaction = getTransactionHistory().find(item => item.id === transactionId);
  if (!transaction) return;
  const content = document.querySelector('#sale-detail-content');
  document.querySelector('#sale-detail-title').textContent = transaction.receiptNo
    ? `Receipt ${transaction.receiptNo}`
    : `${transaction.label}`;
  if (transaction.type === 'MEMBERSHIP') {
    const payment = transaction.payment;
    document.querySelector('#sale-detail-title').textContent = transaction.receiptNo
      ? `Receipt ${transaction.receiptNo}`
      : 'Membership Payment';
    content.innerHTML = `<p class="micro-copy">${dateTimeFmt(transaction.date)}</p><div class="membership-payment-summary"><div><span>Membership No.</span><b>${escapeHtml(transaction.memberNumber)}</b></div><div><span>Transaction Type</span><b>${escapeHtml(transaction.label)}</b></div><div><span>Payment Method</span><b>${escapeHtml(transaction.paymentMethod)}</b></div><div class="summary-total"><span>Payment Amount</span><strong>${money(transaction.amount)}</strong></div>${payment.coverage_start || payment.coverage_end ? `<p class="micro-copy">Coverage: ${payment.coverage_start ? dateFmt(payment.coverage_start) : '—'} – ${payment.coverage_end ? dateFmt(payment.coverage_end) : '—'}</p>` : ''}</div>`;
    openModal('sale-detail-modal');
    return;
  }
  const sale = transaction.sale;
  content.innerHTML = '<p class="micro-copy">Memuat rincian transaksi…</p>';
  openModal('sale-detail-modal');
  if (!configured) {
    content.innerHTML = '<p class="form-message warn">Rincian item hanya tersedia untuk transaksi yang tersimpan di Supabase.</p>';
    return;
  }
  try {
    const { data: items, error } = await db.from('sale_items')
      .select('qty, unit_price, line_total, products(name, sku)')
      .eq('sale_id', sale.id);
    if (error) throw error;
    const member = state.members.find(m => m.id === sale.member_id)?.membership_number || 'Walk-in';
    const itemRows = (items || []).map(item => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return `<tr><td><b>${escapeHtml(product?.name || 'Produk')}</b><br><small class="mono">${escapeHtml(product?.sku || '')}</small></td><td>${item.qty}</td><td>${money(item.unit_price)}</td><td>${money(item.line_total)}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty-cell">Rincian produk tidak ditemukan.</td></tr>';
    content.innerHTML = `<p class="micro-copy">${dateTimeFmt(sale.sold_at)} · ${escapeHtml(member)} · ${escapeHtml(sale.payment_method)}</p><div class="table-wrap"><table><thead><tr><th>Produk</th><th>Qty</th><th>Harga</th><th>Jumlah</th></tr></thead><tbody>${itemRows}</tbody></table></div><div class="summary-box"><div><span>Subtotal</span><b>${money(sale.subtotal)}</b></div><div><span>Diskon (${sale.discount_pct}%)</span><b>- ${money(sale.discount_amount)}</b></div><div class="summary-total"><span>Total</span><strong>${money(sale.total)}</strong></div></div>`;
  } catch (err) {
    console.error(err);
    content.innerHTML = `<p class="form-message error">Gagal memuat detail: ${escapeHtml(err.message)}</p>`;
  }
}

function changeQty(id, delta) {
  const row = state.cart.find(i => i.product.id === id);
  if (!row) return;
  row.qty += delta;
  if (row.qty <= 0) state.cart = state.cart.filter(i => i.product.id !== id);
  renderCart();
}

document.querySelector('#clear-cart').addEventListener('click', () => { state.cart = []; state.memberLookup = null; document.querySelector('#member-number').value = ''; document.querySelector('#member-status').textContent='Belum ada member.'; renderCart(); });

function currentDiscount() {
  const member = state.memberLookup;
  if (!member) return 0;
  return member.rule.discount;
}

function updateSummary() {
  const subtotal = state.cart.reduce((s, i) => s + Number(i.product.price) * i.qty, 0);
  const discountAmount = subtotal * (currentDiscount() / 100);
  const total = subtotal - discountAmount;
  document.querySelector('#cart-subtotal').textContent = money(subtotal);
  document.querySelector('#cart-discount').textContent = `- ${money(discountAmount)}`;
  document.querySelector('#cart-total').textContent = money(total);
}

document.querySelector('#check-member').addEventListener('click', lookupMember);
document.querySelector('#member-number').addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); lookupMember(); } });

async function lookupMember() {
  const value = document.querySelector('#member-number').value.trim().toUpperCase();
  const status = document.querySelector('#member-status');
  if (!value) { state.memberLookup=null; status.textContent='Belum ada member.'; updateSummary(); return; }
  const local = state.members.find(m => m.membership_number.toUpperCase() === value);
  if (!local) { state.memberLookup=null; status.innerHTML='<span class="status-error">Membership number tidak ditemukan.</span>'; updateSummary(); return; }
  if (local.status !== 'ACTIVE') { state.memberLookup=null; status.innerHTML='<span class="status-error">Membership tidak aktif.</span>'; updateSummary(); return; }
  const rule = membershipRule(local.joined_at);
  state.memberLookup = { ...local, rule };
  status.innerHTML = `<span class="status-success">✓ ${escapeHtml(local.membership_number)} · ${rule.tier} · Diskon ${rule.discount}%</span>`;
  updateSummary();
}

document.querySelector('#checkout-btn').addEventListener('click', checkout);

async function checkout() {
  const msg = document.querySelector('#checkout-message');
  msg.textContent='';
  if (!state.cart.length) { msg.textContent='Tambahkan minimal satu produk.'; msg.className='form-message error'; return; }
  if (!configured) { msg.textContent='Demo UI aktif. Hubungkan Supabase untuk menyimpan transaksi.'; msg.className='form-message warn'; toast('Checkout demo tidak disimpan ke database.', 'warn'); return; }
  try {
    const subtotal = state.cart.reduce((s, i) => s + Number(i.product.price) * i.qty, 0);
    const discountPct = currentDiscount();
    const discountAmount = subtotal * discountPct / 100;
    const total = subtotal - discountAmount;
    const receipt = `BRW-${Date.now().toString().slice(-8)}`;
    const payment = document.querySelector('#payment-method').value;
    const { data: sale, error } = await db.from('sales').insert({ receipt_no:receipt, member_id:state.memberLookup?.id || null, subtotal, discount_pct:discountPct, discount_amount:discountAmount, total, payment_method:payment }).select().single();
    if (error) throw error;
    const lineRows = state.cart.map(i => ({
      sale_id:sale.id,
      product_id:i.product.id,
      qty:i.qty,
      unit_price:i.product.price,
      line_total:Number(i.product.price)*i.qty
    }));
    const { error: lineError } = await db.from('sale_items').insert(lineRows);
    if (lineError) throw lineError;
    toast(`Transaksi ${receipt} berhasil disimpan.`, 'success');
    state.cart = []; state.memberLookup=null; document.querySelector('#member-number').value=''; document.querySelector('#member-status').textContent='Belum ada member.'; renderCart();
    await loadAll();
  } catch (err) {
    console.error(err);
    msg.textContent = `Gagal menyimpan: ${err.message}`; msg.className='form-message error';
  }
}

function renderMembers() {
  const query = document.querySelector('#member-search').value.trim().toUpperCase();
  const rows = state.members
    .filter(m => !query || m.membership_number.toUpperCase().includes(query))
    .sort((left, right) => left.membership_number.localeCompare(right.membership_number, undefined, { numeric:true, sensitivity:'base' }));
  document.querySelector('#new-member-fee').textContent = money(state.membershipFees.monthly);
  document.querySelector('#members-body').innerHTML = rows.map(m => {
    const r = membershipRule(m.joined_at);
    const action = m.status === 'ACTIVE'
      ? `<button class="text-button" data-renew-member="${escapeHtml(m.id)}">Bayar iuran</button><button class="text-button status-action" data-deactivate-member="${escapeHtml(m.id)}">Nonaktifkan</button>`
      : `<button class="text-button" data-reactivate-member="${escapeHtml(m.id)}">Aktifkan kembali</button>`;
    return `<tr><td><b>${escapeHtml(m.membership_number)}</b></td><td>${dateFmt(m.joined_at)}</td><td>${r.months} bln</td><td>${getTierBadge(r.tier)}</td><td><b>${r.discount}%</b></td><td>${m.paid_through ? dateFmt(m.paid_through) : 'Belum tercatat'}</td><td><span class="status-pill ${m.status.toLowerCase()}">${m.status}</span></td><td><div class="member-actions"><button class="text-button" data-member-edit="${escapeHtml(m.id)}">Edit</button>${action}</div></td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty-cell">Member tidak ditemukan.</td></tr>';
  document.querySelectorAll('[data-renew-member]').forEach(button => button.addEventListener('click', () => openMembershipPayment(button.dataset.renewMember, 'RENEWAL')));
  document.querySelectorAll('[data-reactivate-member]').forEach(button => button.addEventListener('click', () => openMembershipPayment(button.dataset.reactivateMember, 'REACTIVATION')));
  document.querySelectorAll('[data-deactivate-member]').forEach(button => button.addEventListener('click', () => deactivateMember(button.dataset.deactivateMember)));
  document.querySelectorAll('[data-member-edit]').forEach(button => button.addEventListener('click', () => openMemberEditor(button.dataset.memberEdit)));
}
document.querySelector('#member-search').addEventListener('input', renderMembers);

function openMembershipPayment(memberId, paymentType) {
  const member = state.members.find(item => item.id === memberId);
  if (!member) return;
  state.pendingMembershipAction = { memberId, paymentType };
  const monthly = state.membershipFees.monthly;
  const reactivation = paymentType === 'REACTIVATION' ? state.membershipFees.reactivation : 0;
  const total = monthly + reactivation;
  document.querySelector('#membership-payment-title').textContent = paymentType === 'REACTIVATION' ? 'Aktifkan kembali membership' : 'Bayar iuran membership';
  document.querySelector('#membership-payment-summary').innerHTML = `<p><b>${escapeHtml(member.membership_number)}</b></p><div><span>Iuran 1 bulan</span><b>${money(monthly)}</b></div>${reactivation ? `<div><span>Biaya aktivasi ulang</span><b>${money(reactivation)}</b></div>` : ''}<div class="summary-total"><span>Total pembayaran</span><strong>${money(total)}</strong></div>${reactivation ? '<p class="micro-copy">Tanggal bergabung dan masa membership tetap berlanjut, tidak direset.</p>' : ''}`;
  document.querySelector('#membership-payment-message').textContent = '';
  openModal('membership-payment-modal');
}

async function deactivateMember(memberId) {
  const member = state.members.find(item => item.id === memberId);
  if (!member || !window.confirm(`Nonaktifkan membership ${member.membership_number}?`)) return;
  if (!configured || !state.membershipBillingReady) { toast('Jalankan membership_billing_migration.sql di Supabase terlebih dahulu.', 'warn'); return; }
  try {
    const { error } = await db.rpc('change_membership_status', { p_member_id:memberId, p_status:'INACTIVE', p_payment_method:null });
    if (error) throw error;
    toast('Membership dinonaktifkan.', 'success');
    await loadAll();
  } catch (err) {
    console.error(err);
    toast(`Gagal mengubah status: ${err.message}`, 'error');
  }
}

document.querySelector('#membership-payment-submit').addEventListener('click', async () => {
  const action = state.pendingMembershipAction;
  const message = document.querySelector('#membership-payment-message');
  if (!action) return;
  if (!configured || !state.membershipBillingReady) { message.textContent = 'Jalankan membership_billing_migration.sql di Supabase terlebih dahulu.'; message.className = 'form-message warn'; return; }
  const submit = document.querySelector('#membership-payment-submit');
  submit.disabled = true;
  message.textContent = '';
  try {
    const paymentMethod = document.querySelector('#membership-payment-method').value;
    const result = action.paymentType === 'REACTIVATION'
      ? await db.rpc('change_membership_status', { p_member_id:action.memberId, p_status:'ACTIVE', p_payment_method:paymentMethod })
      : await db.rpc('renew_membership', { p_member_id:action.memberId, p_payment_method:paymentMethod });
    if (result.error) throw result.error;
    closeModal('membership-payment-modal');
    state.pendingMembershipAction = null;
    toast(action.paymentType === 'REACTIVATION' ? 'Membership aktif kembali dan pembayaran tercatat.' : 'Iuran membership berhasil dibayar.', 'success');
    await loadAll();
  } catch (err) {
    console.error(err);
    message.textContent = `Pembayaran gagal: ${err.message}`;
    message.className = 'form-message error';
  } finally {
    submit.disabled = false;
  }
});

function compareProductSku(left, right) {
  const leftSku = String(left.sku || '');
  const rightSku = String(right.sku || '');
  const skuPattern = /^([a-z]+)-(\d+)$/i;
  const leftParts = leftSku.match(skuPattern);
  const rightParts = rightSku.match(skuPattern);

  if (leftParts && rightParts) {
    const prefixOrder = leftParts[1].localeCompare(rightParts[1], undefined, { sensitivity:'base' });
    if (prefixOrder) return prefixOrder;

    const leftSuffix = leftParts[2].replace(/^0+(?=\d)/, '');
    const rightSuffix = rightParts[2].replace(/^0+(?=\d)/, '');
    const suffixOrder = leftSuffix.length - rightSuffix.length ||
      leftSuffix.localeCompare(rightSuffix) ||
      leftParts[2].localeCompare(rightParts[2]);
    if (suffixOrder) return suffixOrder;
  }

  return leftSku.localeCompare(rightSku, undefined, { numeric:true, sensitivity:'base' });
}

function renderProducts() {
  const q = document.querySelector('#product-search').value.trim().toLowerCase();
  const rows = state.products.filter(p => [p.sku,p.name,p.category].some(v => String(v).toLowerCase().includes(q))).sort(compareProductSku);
  document.querySelector('#products-body').innerHTML = rows.map(p => `<tr><td><span class="mono">${escapeHtml(p.sku)}</span></td><td><b>${escapeHtml(p.name)}</b></td><td>${escapeHtml(p.category)}</td><td>${money(p.price)}</td><td>${state.accountingReady ? money(p.cost) : '—'}</td><td><span class="status-pill ${p.is_active ? 'active':'inactive'}">${p.is_active ? 'AVAILABLE':'NON-AVAILABLE'}</span></td><td><div class="product-actions"><button class="text-button" data-product-edit="${escapeHtml(p.id)}">Edit</button><button class="text-button product-action" data-product-availability="${escapeHtml(p.id)}" data-next-availability="${!p.is_active}">${p.is_active ? 'Non-available' : 'Jadikan available'}</button><button class="text-button status-action" data-product-delete="${escapeHtml(p.id)}">Hapus</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="empty-cell">Produk tidak ditemukan.</td></tr>';
  document.querySelectorAll('[data-product-availability]').forEach(button => button.addEventListener('click', () => setProductAvailability(button.dataset.productAvailability, button.dataset.nextAvailability === 'true')));
  document.querySelectorAll('[data-product-edit]').forEach(button => button.addEventListener('click', () => openProductEditor(button.dataset.productEdit)));
  document.querySelectorAll('[data-product-delete]').forEach(button => button.addEventListener('click', () => deleteProduct(button.dataset.productDelete)));
}

async function setProductAvailability(productId, isActive) {
  if (!configured) { toast('Hubungkan Supabase untuk mengubah ketersediaan produk.', 'warn'); return; }
  try {
    const { error } = await db.rpc('set_product_availability', { p_product_id:productId, p_is_active:isActive });
    if (error) throw error;
    toast(isActive ? 'Produk tersedia kembali di menu POS.' : 'Produk ditandai non-available.', 'success');
    await loadAll();
  } catch (err) {
    console.error(err);
    toast(`Gagal mengubah ketersediaan: ${err.message}`, 'error');
  }
}

async function deleteProduct(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product || !window.confirm(`Hapus produk ${product.name}? Produk yang pernah tercatat dalam transaksi tidak dapat dihapus.`)) return;
  if (!configured) { toast('Hubungkan Supabase untuk menghapus produk.', 'warn'); return; }
  try {
    const { error } = await db.rpc('delete_product', { p_product_id:productId });
    if (error) throw error;
    let imageCleanupWarning = false;
    try {
      await removeStoredProductImage(product.image_path);
    } catch (imageError) {
      console.error(imageError);
      imageCleanupWarning = true;
    }
    toast(imageCleanupWarning ? 'Produk dihapus, tetapi gambar lama gagal dihapus dari Storage.' : 'Produk berhasil dihapus.', imageCleanupWarning ? 'warn' : 'success');
    await loadAll();
  } catch (err) {
    console.error(err);
    toast(`Gagal menghapus produk: ${err.message}`, 'error');
  }
}
document.querySelector('#product-search').addEventListener('input', renderProducts);

function openMemberEditor(memberId) {
  const member = state.members.find(item => item.id === memberId);
  if (!member) return;
  state.editingMemberId = memberId;
  const form = document.querySelector('#member-form');
  form.reset();
  form.elements.membership_number.value = member.membership_number;
  form.elements.joined_at.value = member.joined_at;
  document.querySelector('#member-modal-eyebrow').textContent = 'CORRECT MEMBERSHIP';
  document.querySelector('#member-modal-title').textContent = 'Edit Membership';
  document.querySelector('#member-new-payment-fields').hidden = true;
  document.querySelector('#member-form-submit').textContent = 'Simpan Perubahan';
  document.querySelector('#member-form-message').textContent = '';
  document.querySelector('#member-form-message').className = 'form-message';
  openModal('member-modal');
}

function openProductEditor(productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return;
  state.editingProductId = productId;
  const form = document.querySelector('#product-form');
  form.reset();
  resetProductImagePicker(product);
  form.elements.sku.value = product.sku;
  form.elements.name.value = product.name;
  form.elements.category.value = product.category;
  form.elements.price.value = product.price;
  document.querySelector('#product-modal-eyebrow').textContent = 'CORRECT PRODUCT';
  document.querySelector('#product-modal-title').textContent = 'Edit Produk';
  document.querySelector('#product-form-submit').textContent = 'Simpan Perubahan';
  document.querySelector('#product-form-message').textContent = '';
  document.querySelector('#product-form-message').className = 'form-message';
  openModal('product-modal');
}

function setProductImagePreview(source) {
  const image = document.querySelector('#product-image-preview');
  const placeholder = document.querySelector('#product-image-placeholder');
  image.onerror = () => {
    image.hidden = true;
    placeholder.textContent = 'Image unavailable';
    placeholder.hidden = false;
  };
  placeholder.textContent = 'Select an image to preview';
  image.hidden = !source;
  placeholder.hidden = Boolean(source);
  if (source) image.src = source;
  else image.removeAttribute('src');
}

function resetProductImagePicker(product = null) {
  const input = document.querySelector('#product-image-input');
  if (productImagePreviewObjectUrl) URL.revokeObjectURL(productImagePreviewObjectUrl);
  productImagePreviewObjectUrl = null;
  input.value = '';
  input.required = !product;
  document.querySelector('#product-image-requirement').hidden = Boolean(product);
  setProductImagePreview(product ? productImageUrl(product) : '');
}

document.querySelector('#product-image-input').addEventListener('change', event => {
  const input = event.currentTarget;
  const file = input.files[0];
  if (!file) return;
  const message = document.querySelector('#product-form-message');
  try {
    validateProductImage(file);
    if (productImagePreviewObjectUrl) URL.revokeObjectURL(productImagePreviewObjectUrl);
    productImagePreviewObjectUrl = URL.createObjectURL(file);
    setProductImagePreview(productImagePreviewObjectUrl);
    message.textContent = '';
    message.className = 'form-message';
  } catch (err) {
    input.value = '';
    if (productImagePreviewObjectUrl) URL.revokeObjectURL(productImagePreviewObjectUrl);
    productImagePreviewObjectUrl = null;
    const product = state.products.find(item => item.id === state.editingProductId);
    setProductImagePreview(product ? productImageUrl(product) : '');
    message.textContent = err.message;
    message.className = 'form-message error';
  }
});

function renderDashboard() {
  const now = new Date();
  const todaySales = state.sales.filter(s => new Date(s.sold_at).toDateString() === now.toDateString());
  const total = todaySales.reduce((s,x)=>s+Number(x.total),0);
  document.querySelector('#stat-today-sales').textContent = money(total);
  document.querySelector('#stat-today-tx').textContent = todaySales.length;
  document.querySelector('#stat-members').textContent = state.members.filter(m=>m.status==='ACTIVE').length;
  document.querySelector('#stat-avg-ticket').textContent = money(todaySales.length ? total/todaySales.length : 0);
  document.querySelector('#recent-sales-body').innerHTML = state.sales.slice(0,6).map(s => {
    const member = state.members.find(m=>m.id===s.member_id)?.membership_number || 'Walk-in';
    return `<tr><td><span class="mono">${escapeHtml(s.receipt_no)}</span></td><td>${escapeHtml(member)}</td><td>${money(s.subtotal)}</td><td>${s.discount_pct}%</td><td><b>${money(s.total)}</b></td></tr>`;
  }).join('') || '<tr><td colspan="5" class="empty-cell">Belum ada transaksi.</td></tr>';
  drawCharts();
}

function drawCharts() {
  const salesByDay = [];
  for (let i=6;i>=0;i--) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-i);
    const label = d.toLocaleDateString('id-ID',{day:'2-digit',month:'short'});
    const val = state.sales.filter(s=>new Date(s.sold_at).toDateString()===d.toDateString()).reduce((a,s)=>a+Number(s.total),0);
    salesByDay.push({label,val});
  }
  const counts = { BRONZE:0, SILVER:0, GOLD:0 };
  state.members.filter(m=>m.status==='ACTIVE').forEach(m=>counts[membershipRule(m.joined_at).tier]++);
  const Chart = window.Chart;
  if (!Chart) return;
  if (state.charts.sales) state.charts.sales.destroy();
  if (state.charts.membership) state.charts.membership.destroy();
  state.charts.sales = new Chart(document.querySelector('#salesChart'), { type:'bar', data:{labels:salesByDay.map(x=>x.label),datasets:[{data:salesByDay.map(x=>x.val),borderRadius:8,borderSkipped:false,backgroundColor:'rgba(214,160,84,.72)'}]}, options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#bdb4aa'}},y:{grid:{color:'rgba(255,255,255,.06)'},ticks:{color:'#bdb4aa', callback:v=>`Rp ${Math.round(v/1000)}k`}}}} });
  state.charts.membership = new Chart(document.querySelector('#membershipChart'), { type:'doughnut', data:{labels:['Bronze','Silver','Gold'],datasets:[{data:[counts.BRONZE,counts.SILVER,counts.GOLD],backgroundColor:['#a97649','#9ea5ad','#d6a054'],borderColor:'rgba(25,18,14,.8)',borderWidth:4}]}, options:{cutout:'72%',plugins:{legend:{display:false}}} });
  document.querySelector('#tier-legend').innerHTML = [['bronze','Bronze',counts.BRONZE],['silver','Silver',counts.SILVER],['gold','Gold',counts.GOLD]].map(([c,n,v])=>`<span><i class="tier-dot ${c}"></i>${n} <b>${v}</b></span>`).join('');
}

function openModal(id){ document.querySelector(`#${id}`).classList.add('open'); }
function closeModal(id){
  document.querySelector(`#${id}`).classList.remove('open');
  if (id === 'product-modal') resetProductImagePicker();
}
document.querySelector('#open-member-form').addEventListener('click', () => {
  state.editingMemberId = null;
  document.querySelector('#member-form').reset();
  document.querySelector('#member-modal-eyebrow').textContent = 'NEW MEMBER';
  document.querySelector('#member-modal-title').textContent = 'Tambah Membership';
  document.querySelector('#member-new-payment-fields').hidden = false;
  document.querySelector('#member-form-submit').textContent = 'Simpan & Bayar';
  document.querySelector('#member-form-message').textContent = '';
  document.querySelector('#member-form-message').className = 'form-message';
  openModal('member-modal');
});
document.querySelector('#open-product-form').addEventListener('click', () => {
  state.editingProductId = null;
  document.querySelector('#product-form').reset();
  resetProductImagePicker();
  document.querySelector('#product-modal-eyebrow').textContent = 'NEW PRODUCT';
  document.querySelector('#product-modal-title').textContent = 'Tambah Produk';
  document.querySelector('#product-form-submit').textContent = 'Simpan Produk';
  document.querySelector('#product-form-message').textContent = '';
  document.querySelector('#product-form-message').className = 'form-message';
  openModal('product-modal');
});
document.querySelectorAll('.modal-close').forEach(b=>b.addEventListener('click',()=>closeModal(b.dataset.close)));

document.querySelector('#member-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (!configured) { document.querySelector('#member-form-message').textContent='Demo UI aktif. Hubungkan Supabase untuk menyimpan member.'; document.querySelector('#member-form-message').className='form-message warn'; return; }
  if (!state.editingMemberId && !state.membershipBillingReady) { document.querySelector('#member-form-message').textContent='Jalankan membership_billing_migration.sql di Supabase terlebih dahulu.'; document.querySelector('#member-form-message').className='form-message warn'; return; }
  const submit = document.querySelector('#member-form-submit');
  submit.disabled = true;
  const message = document.querySelector('#member-form-message');
  message.textContent = '';
  try {
    const result = state.editingMemberId
      ? await db.rpc('update_membership_details', {
        p_member_id:state.editingMemberId,
        p_membership_number:String(fd.get('membership_number')).trim().toUpperCase(),
        p_joined_at:fd.get('joined_at')
      })
      : await db.rpc('register_member', {
        p_membership_number:String(fd.get('membership_number')).trim().toUpperCase(),
        p_joined_at:fd.get('joined_at'),
        p_payment_method:fd.get('payment_method')
      });
    const { error } = result;
    if (error) throw error;
    toast(state.editingMemberId ? 'Data membership berhasil diperbarui.' : 'Member baru dibuat dan iuran bulan pertama tercatat.', 'success');
    state.editingMemberId = null;
    e.target.reset(); closeModal('member-modal'); await loadAll();
  } catch(err){ message.textContent = err.message; message.className = 'form-message error'; }
  finally { submit.disabled = false; }
});

document.querySelector('#product-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (!configured) { document.querySelector('#product-form-message').textContent='Demo UI aktif. Hubungkan Supabase untuk menyimpan produk.'; document.querySelector('#product-form-message').className='form-message warn'; return; }
  const editingProductId = state.editingProductId;
  const imageFile = fd.get('image');
  const hasImage = imageFile instanceof File && imageFile.size > 0;
  const previousProduct = state.products.find(item => item.id === editingProductId);
  let uploadedImagePath = null;
  let imageCleanupWarning = false;
  const submit = document.querySelector('#product-form-submit');
  submit.disabled = true;
  const message = document.querySelector('#product-form-message');
  message.textContent = '';
  try {
    if (!editingProductId && !hasImage) throw new Error('Pilih gambar untuk produk baru.');
    if (hasImage) uploadedImagePath = await uploadProductImage(imageFile);
    const product = {
      p_product_id:editingProductId,
      p_sku:String(fd.get('sku')).trim().toUpperCase(),
      p_name:String(fd.get('name')).trim(),
      p_category:String(fd.get('category')).trim(),
      p_price:Number(fd.get('price')),
      p_image_path:uploadedImagePath
    };
    const result = editingProductId
      ? await db.rpc('update_product_details', product)
      : await db.from('products').insert({ sku:product.p_sku, name:product.p_name, category:product.p_category, price:product.p_price, image_path:uploadedImagePath, is_active:true });
    const { error } = result;
    if (error) throw error;
    if (uploadedImagePath && isStoredProductImage(previousProduct?.image_path)) {
      try {
        await removeStoredProductImage(previousProduct.image_path);
      } catch (imageError) {
        console.error(imageError);
        imageCleanupWarning = true;
      }
    }
    toast(imageCleanupWarning ? 'Produk tersimpan, tetapi gambar sebelumnya gagal dihapus.' : editingProductId ? 'Produk berhasil diperbarui.' : 'Produk baru berhasil ditambahkan.', imageCleanupWarning ? 'warn' : 'success');
    state.editingProductId = null;
    e.target.reset(); closeModal('product-modal'); await loadAll();
  } catch(err){
    if (uploadedImagePath) {
      try {
        await removeStoredProductImage(uploadedImagePath);
      } catch (imageError) {
        console.error(imageError);
      }
    }
    message.textContent = err.message;
    message.className = 'form-message error';
  }
  finally { submit.disabled = false; }
});

window.addEventListener('keydown', e => { if(e.key==='Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m=>closeModal(m.id)); });

loadAll();
