/* ==========
   CONFIG
========== */
// Published CSV from Google Sheets
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vR-GykVMcX-O9F6ys0khgcLwc2k-k9XCcGjODiwl9ax837yImNk9bilKfKKElTCRFMESe7N9Mc736wR/pub?output=csv";

// Where local assets live (use filenames in the Sheet; full URLs still work)
const PDF_BASE_PATH   = "/assets/pdfs/";
const THUMB_BASE_PATH = "/assets/thumbs/";

/* ==========
   DATA + STATE
========== */
let DATA = [];
const $ = s => document.querySelector(s);

/* ==========
   Helpers
========== */
function joinPath(base, file){
  if (!base) return file;
  const b = base.endsWith("/") ? base : base + "/";
  return b + encodeURIComponent(file);
}
function resolveUrl(value, base){
  const v = (value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;      // already a URL
  return joinPath(base, v);                    // treat as filename
}
function formatLKR(n){
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-LK", { style:"currency", currency:"LKR", maximumFractionDigits:0 }).format(n);
}
function uniques(arr){
  return [...new Set(arr.filter(Boolean))].sort((a,b)=>(''+a).localeCompare(''+b));
}

/* ==========
   CSV parsing & normalisation
========== */
function csvToObjects(text){
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  while (i < text.length){
    const ch = text[i];

    if (ch === '"'){
      if (inQuotes && text[i+1] === '"'){ field += '"'; i += 2; continue; }
      inQuotes = !inQuotes; i++; continue;
    }
    if (!inQuotes && ch === ','){ pushField(); i++; continue; }
    if (!inQuotes && (ch === '\n' || ch === '\r')){
      pushField(); pushRow();
      if (ch === '\r' && text[i+1] === '\n') i++;
      i++; continue;
    }
    field += ch; i++;
  }
  if (field.length || row.length){ pushField(); pushRow(); }

  if (!rows.length) return [];
  const headers = rows.shift().map(h => (h || "").trim());
  return rows
    .filter(r => r.some(x => (x||"").trim() !== ""))
    .map(r => {
      const o = {};
      headers.forEach((h, idx) => { o[h] = (r[idx] || "").trim(); });
      return o;
    });
}

function normaliseRow(row){
  const get = key => {
    if (row[key] != null) return row[key];
    const k = String(key).toLowerCase();
    const found = Object.keys(row).find(x => String(x).toLowerCase() === k);
    return found ? row[found] : "";
  };
  const num = v => (v == null || v === "") ? null : Number(String(v).replace(/[,\s]/g,""));

  const pdfRaw   = (get("PDF") || "").trim();
  const thumbRaw = (get("Thumbnail") || "").trim();

  return {
    title:   (get("Title")   || "").trim(),
    summary: (get("Summary") || "").trim(),
    costLKR: (get("CostLKR") || "").trim(),  // Keep as text, no conversion
    category:(get("Category")|| "").trim(),
    pdfUrl:   resolveUrl(pdfRaw,   PDF_BASE_PATH),
    thumbUrl: resolveUrl(thumbRaw, THUMB_BASE_PATH),
  };
  
}

/* ==========
   Filtering & Rendering
========== */
function filterList(q, selectedCats){
  const query = (q||"").toLowerCase().trim();
  const hasCats = Array.isArray(selectedCats) && selectedCats.length > 0;

  return DATA.filter(d => {
    const hay = [d.title, d.summary].join(" ").toLowerCase();
    const matchesQ = !query || hay.includes(query);
    const matchesC = !hasCats || selectedCats.includes(d.category);
    return matchesQ && matchesC;
  });
}

function apply(){
  const q = document.getElementById('q').value;
  const cats = (typeof window.getSelectedCategories === 'function')
    ? window.getSelectedCategories()
    : [];
  const list = filterList(q, cats);
  document.getElementById('results').innerHTML = list.map(card).join('');
  document.getElementById('empty').style.display = list.length ? 'none' : 'block';
}



function renderFilters(){
  const cats = uniques(DATA.map(d => d.category));
  const sel = document.getElementById('cat'); // hidden native, kept for semantics
  const ms = document.getElementById('cat-ms');
  const menu = ms.querySelector('.ms-menu');
  const toggle = document.getElementById('cat-toggle');

  // Build hidden <select> for completeness/accessibility
  sel.innerHTML = ['All categories', ...cats].map(c => `<option>${c}</option>`).join('');
  sel.value = 'All categories';

  // Build custom menu
  const items = ['All categories', ...cats].map(c => {
    return `<div class="ms-item" role="option" data-value="${c}" aria-selected="${c==='All categories' ? 'true' : 'false'}">
      <span class="ms-check">${c==='All categories' ? '•' : ''}</span>
      <span class="ms-label">${c}</span>
    </div>`;
  }).join('');
  menu.innerHTML = items;

  // Toggle open/close
  const closeMenu = () => { ms.classList.remove('open'); toggle.setAttribute('aria-expanded','false'); };
  const openMenu  = () => { ms.classList.add('open'); toggle.setAttribute('aria-expanded','true'); };
  toggle.addEventListener('click', (e)=> {
    e.stopPropagation();
    const isOpen = ms.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  });
  document.addEventListener('click', (e)=> { if (!ms.contains(e.target)) closeMenu(); });

  // Selection model
  let selected = new Set(['All categories']);

  const updateUI = () => {
    // reflect in menu
    menu.querySelectorAll('.ms-item').forEach(it => {
      const val = it.getAttribute('data-value');
      it.setAttribute('aria-selected', selected.has(val) ? 'true' : 'false');
      const check = it.querySelector('.ms-check');
      check.textContent = selected.has(val) ? '✓' : '';
      if (val === 'All categories' && selected.has(val)) check.textContent = '✓';
    });
    // reflect summary
    const shown = selected.has('All categories') ? 'All categories'
                  : Array.from(selected).join(', ');
    toggle.innerHTML = `<span class="ms-summary">${shown}</span>`;

    // reflect hidden <select> (optional)
    Array.from(sel.options).forEach(o => o.selected = selected.has(o.value));

    // re-apply filters
    apply();
  };

  // Click-to-toggle behaviour
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.ms-item');
    if (!item) return;
    const val = item.getAttribute('data-value');

    if (val === 'All categories') {
      // Selecting "All" clears others
      selected.clear();
      selected.add('All categories');
    } else {
      // Toggle this category
      if (selected.has(val)) {
        selected.delete(val);
      } else {
        selected.add(val);
      }
      // If any specific cats selected, ensure "All" is off
      selected.delete('All categories');
      // If none left, fall back to All
      if (selected.size === 0) selected.add('All categories');
    }
    updateUI();
  });

  // Expose a getter for apply()
  window.getSelectedCategories = () => {
    return selected.has('All categories') ? [] : Array.from(selected);
  };

  // Initial paint
  updateUI();
}



function thumbBlock(d){
  if (d.thumbUrl){
    return `<div class="thumb-wrap"><img class="thumb" src="${d.thumbUrl}" alt=""></div>`;
  }
  // fallback: first letter of category (or •)
  const letter = (d.category || "•").trim().charAt(0).toUpperCase() || "•";
  return `<div class="thumb-wrap"><div class="thumb-fallback" aria-hidden="true">${letter}</div></div>`;
}

function card(d){
    const costText = (d.costLKR || "").toString().trim();
    let costClass = '';
  
    if (/^cost\s*=/i.test(costText)) {
      costClass = 'badge--red';
    } else if (/^no\s+costing\s+available$/i.test(costText)) {
      costClass = ''; // normal badge
    } else {
      costClass = 'badge--green';
    }
  
    return `<article class="card" aria-label="${d.title}">
      <div class="card-inner">
        ${thumbBlock(d)}
        <div class="card-body">
          <h3>${d.title}</h3>
          <div class="summary">${d.summary}</div>
          <div class="meta"><span class="chip">${d.category}</span></div>
          <div class="actions">
            <span class="badge ${costClass}" title="Estimated cost">${costText || "—"}</span>
            ${d.pdfUrl ? `<a class="download" href="${d.pdfUrl}" target="_blank" rel="noopener">Download PDF</a>` : ""}
          </div>
        </div>
      </div>
    </article>`;
}

/* ==========
   Data loading with cache-busting
========== */
async function fetchCSV(url){
  const cacheBuster = (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(url + cacheBuster, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch CSV (${res.status})`);
  return await res.text();
}
async function loadFromSheet(){
  if (!SHEET_CSV_URL) return false;
  try{
    const csv = await fetchCSV(SHEET_CSV_URL);
    const rows = csvToObjects(csv).map(normaliseRow).filter(r => r.title);
    if (!rows.length) throw new Error("No rows found after parsing.");
    DATA = rows;
    return true;
  }catch(err){
    console.warn("[Sheet] Falling back to demo data:", err.message);
    return false;
  }
}

function loadDemo(){
  DATA = [
    {
      title: 'Targeted Nutrition Support for Estate Schoolchildren',
      summary: 'Scale an evidence-based school meal programme to reduce malnutrition in underserved estate areas.',
      costLKR: 1250000000,
      category: 'Social Protection',
      pdfUrl:   resolveUrl("nutrition-estates.pdf", PDF_BASE_PATH),
      thumbUrl: resolveUrl("nutrition-estates.jpg", THUMB_BASE_PATH)
    },
    {
      title: 'Digital Customs Single Window (Phase I)',
      summary: 'Establish a single-window for trade facilitation to cut clearance time by up to 40%.',
      costLKR: 850000000,
      category: 'Trade & Industry',
      pdfUrl:   resolveUrl("customs-phase1.pdf", PDF_BASE_PATH),
      thumbUrl: resolveUrl("customs-phase1.jpg", THUMB_BASE_PATH)
    },
    {
      title: 'Results-Based Road Maintenance Contracts',
      summary: 'Adopt performance-based maintenance to improve road quality and reduce lifecycle costs.',
      costLKR: 4500000000,
      category: 'Infrastructure',
      pdfUrl:   resolveUrl("roads-rb-contracts.pdf", PDF_BASE_PATH),
      thumbUrl: resolveUrl("roads-rb-contracts.jpg", THUMB_BASE_PATH)
    }
  ];
}

/* ==========
   Init
========== */
async function init(){
  $('#y').textContent = new Date().getFullYear();

  const ok = await loadFromSheet();
  if (!ok) loadDemo();

  renderFilters();
  apply();

  $('#q').addEventListener('input', apply);
  $('#cat').addEventListener('change', apply);
}
document.addEventListener('DOMContentLoaded', init);
