// --- 1. Photo Optimization Helper ---
async function resizeImage(file, maxWidth = 1024) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); 
            };
        };
    });
}

// --- 2. Constants & State ---
const WHEEL_CUISINES_KEY = 'fatass_wheel_cuisines_v3';
const HISTORY_KEY = 'fatass_history_v3';

let reviews = []; 
let spinHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
let spinning = false;
let currentAngle = 0;
let editMode = false;

const PALETTE = ['#c87941', '#4a9d9c', '#4a7a9d', '#6a6a6a', '#c84a4a', '#8e44ad', '#2c3e50', '#27ae60'];

// --- 3. Navigation ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    const target = document.getElementById('page-' + pageId);
    if (target) target.classList.add('active');
    
    const btn = Array.from(document.querySelectorAll('.nav-btn')).find(b => b.textContent.toLowerCase().includes(pageId));
    if (btn) btn.classList.add('active');

    if (pageId === 'reviews') renderReviews();
    if (pageId === 'spin') initWheel();
    if (pageId === 'tier') renderTierList();
}

// --- 4. Firestore Logic ---
db.collection('reviews').orderBy('date', 'desc').onSnapshot(snap => {
    reviews = [];
    snap.forEach(doc => reviews.push({ id: doc.id, ...doc.data() }));
    updateDatalists();
    if (document.getElementById('page-reviews').classList.contains('active')) renderReviews();
    if (document.getElementById('page-tier').classList.contains('active')) renderTierList();
});

function updateDatalists() {
    const cuisines = [...new Set(reviews.map(r => r.cuisine))];
    const authors = [...new Set(reviews.map(r => r.author))];
    const cList = document.getElementById('list-cuisines');
    const aList = document.getElementById('list-authors');
    if (cList) cList.innerHTML = cuisines.map(c => `<option value="${c}">`).join('');
    if (aList) aList.innerHTML = authors.map(a => `<option value="${a}">`).join('');
}

// --- 5. Add Review Logic ---
const slider = document.getElementById('ratingSlider');
const display = document.getElementById('ratingValueDisplay');
if (slider) {
    slider.oninput = () => display.textContent = parseFloat(slider.value).toFixed(1);
}

async function submitReview() {
    const name = document.getElementById('inp-name').value.trim();
    const region = document.getElementById('inp-region').value;
    const loc = document.getElementById('inp-loc').value.trim();
    const mapsLink = document.getElementById('inp-maps-link').value.trim();
    const cuisine = document.getElementById('inp-cuisine').value.trim();
    const author = document.getElementById('inp-author').value.trim();
    const text = document.getElementById('inp-review').value.trim();
    const rating = parseFloat(slider.value);
    const imgFile = document.getElementById('inp-img').files[0];

    if (!name || !cuisine || !author) return showToast('Fill in Name, Cuisine, and Author');

    let finalImg = "";
    if (imgFile) {
        showToast('Compressing image...');
        finalImg = await resizeImage(imgFile);
    }

    const newReview = {
        name, region, loc, mapsLink, cuisine, author, text, rating,
        img: finalImg ? [finalImg] : [],
        date: new Date().toISOString()
    };

    try {
        await db.collection('reviews').add(newReview);
        showToast('Review posted!');
        ['inp-name', 'inp-loc', 'inp-maps-link', 'inp-cuisine', 'inp-author', 'inp-review', 'inp-img'].forEach(id => {
            document.getElementById(id).value = '';
        });
        slider.value = 7.0;
        display.textContent = "7.0";
        showPage('reviews');
    } catch (e) {
        showToast('Error posting review');
    }
}

// --- Updated Color Logic ---
function getRatingColor(val) {
    const v = parseFloat(val);
    if (v >= 9.0) return '#3498db'; // Blue (God tier)
    if (v >= 7.5) return '#2ecc71'; // Green (Excellent)
    if (v >= 5.0) return '#f1c40f'; // Yellow (Average)
    return '#ff4d4d';                // Red (Bad)
}

// --- Update Slider Listeners ---
// For the Add Review page
if (slider) {
    slider.oninput = () => {
        const val = parseFloat(slider.value).toFixed(1);
        display.textContent = val;
        display.style.color = getRatingColor(val);
    };
}

// Inside your openEditModal function, update the listener:
// Find the section in script.js for edit-rating-slider and update it to:
es.oninput = () => {
    const val = parseFloat(es.value).toFixed(1);
    ed.textContent = val;
    ed.style.color = getRatingColor(val);
};

function renderReviews() {
    const grid = document.getElementById('restGrid');
    if (!grid) return;
    grid.innerHTML = reviews.map(r => {
        const rCol = getRatingColor(r.rating);
        const images = Array.isArray(r.img) ? r.img : (r.img ? [r.img] : []);
        
        return `
            <div class="rest-card">
                <div class="card-actions">
                    <button class="action-icon edit-btn" onclick="openEditModal('${r.id}')">✏️</button>
                </div>
                <div class="tag">${r.cuisine}</div>
                <h3>${r.name}</h3>
                <div class="location">
                    📍 ${r.region} — ${r.loc}
                    ${r.mapsLink ? `<a href="${r.mapsLink}" target="_blank" style="margin-left:5px; text-decoration:underline;">map</a>` : ''}
                </div>
                <div class="rating-val" style="color: ${rCol}">${r.rating.toFixed(1)} / 10</div>
                <div class="snippet">"${r.text}"</div>
                <div class="author-tag">— ${r.author}</div>
                
                ${images.length > 0 ? `
                    <div class="image-gallery">
                        ${images.map(imgSrc => `<img src="${imgSrc}" class="review-img-thumb" onclick="openImageViewer('${imgSrc}')">`).join('')}
                    </div>
                ` : ''}
                
                <button class="action-icon delete-btn" onclick="deleteReview('${r.id}')">🗑️</button>
            </div>
        `;
    }).join('');
}

async function deleteReview(id) {
    if (confirm('Delete this review permanently?')) {
        await db.collection('reviews').doc(id).delete();
        showToast('Review deleted');
    }
}

// --- 7. Edit Logic ---
let currentEditId = null;

async function openEditModal(id) {
    currentEditId = id;
    const r = reviews.find(x => x.id === id);
    if (!r) return;

    document.getElementById('edit-name').value = r.name || '';
    document.getElementById('edit-region').value = r.region || 'Central';
    document.getElementById('edit-loc').value = r.loc || '';
    document.getElementById('edit-maps-link').value = r.mapsLink || '';
    document.getElementById('edit-cuisine').value = r.cuisine || '';
    document.getElementById('edit-review').value = r.text || '';
    
    const eSlider = document.getElementById('edit-rating-slider');
    const eDisplay = document.getElementById('edit-rating-display');
    eSlider.value = r.rating || 7.0;
    eDisplay.textContent = parseFloat(eSlider.value).toFixed(1);

    window.tempEditImages = Array.isArray(r.img) ? [...r.img] : (r.img ? [r.img] : []);
    renderEditImages();

    document.getElementById('editModal').classList.add('show');
}

function renderEditImages() {
    const container = document.getElementById('edit-image-preview-container');
    container.innerHTML = window.tempEditImages.map((src, i) => `
        <div class="edit-img-wrapper">
            <img src="${src}">
            <button class="remove-img-btn" onclick="removeTempImage(${i})">×</button>
        </div>
    `).join('');
}

function removeTempImage(index) {
    window.tempEditImages.splice(index, 1);
    renderEditImages();
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
    currentEditId = null;
}

async function saveEdit() {
    if (!currentEditId) return;
    const newFiles = document.getElementById('edit-img-input').files;
    let uploadedImages = [];

    try {
        if (newFiles.length > 0) {
            for (let file of newFiles) {
                const compressed = await resizeImage(file);
                uploadedImages.push(compressed);
            }
        }

        const update = {
            name: document.getElementById('edit-name').value.trim(),
            region: document.getElementById('edit-region').value,
            loc: document.getElementById('edit-loc').value.trim(),
            mapsLink: document.getElementById('edit-maps-link').value.trim(),
            cuisine: document.getElementById('edit-cuisine').value.trim(),
            text: document.getElementById('edit-review').value.trim(),
            rating: parseFloat(document.getElementById('edit-rating-slider').value),
            img: [...window.tempEditImages, ...uploadedImages]
        };

        await db.collection('reviews').doc(currentEditId).update(update);
        showToast('Updated successfully');
        closeEditModal();
    } catch (e) {
        showToast('Update failed');
    }
}

// --- 8. Spin Wheel Logic ---
function getCuisines() {
    const local = JSON.parse(localStorage.getItem(WHEEL_CUISINES_KEY));
    return local || ["Japanese", "Mala", "Western", "Thai", "Korean", "Pasta", "Burgers", "Prata"];
}

function initWheel() {
    const cuisines = getCuisines();
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const center = size / 2;
    const arc = (Math.PI * 2) / cuisines.length;

    ctx.clearRect(0, 0, size, size);
    cuisines.forEach((c, i) => {
        const angle = currentAngle + i * arc;
        ctx.fillStyle = PALETTE[i % PALETTE.length];
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, center - 10, angle, angle + arc);
        ctx.lineTo(center, center);
        ctx.fill();
        ctx.strokeStyle = '#252525';
        ctx.stroke();

        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(angle + arc / 2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Monaco";
        ctx.fillText(c.toUpperCase(), center - 30, 5);
        ctx.restore();
    });
    
    updateCuisineLists();
    renderHistory();
}

function spinWheel() {
    if (spinning) return;
    const cuisines = getCuisines();
    spinning = true;
    const duration = 3000;
    const start = performance.now();
    const extraSpins = 5 + Math.random() * 5;
    const totalRotation = extraSpins * Math.PI * 2;
    const initialAngle = currentAngle;

    function animate(time) {
        const elapsed = time - start;
        const progress = Math.min(elapsed / duration, 1);
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        currentAngle = initialAngle + totalRotation * easeOut;
        initWheel();

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            spinning = false;
            const arc = (Math.PI * 2) / cuisines.length;
            const normalized = ((currentAngle % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
            const idx = cuisines.length - 1 - Math.floor(normalized / arc) % cuisines.length;
            const result = cuisines[idx];
            
            document.getElementById('wheelResult').innerHTML = `
                <div class="cuisine-name">${result}</div>
                <div class="cuisine-sub">fate has decided.</div>
            `;
            
            spinHistory.unshift({ name: result, date: new Date().toLocaleTimeString() });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory));
            renderHistory();
        }
    }
    requestAnimationFrame(animate);
}

// --- 9. Tier List Logic ---
function renderTierList() {
    const board = { S:[], A:[], B:[], C:[], D:[], F:[] };
    reviews.forEach(r => {
        if (r.rating >= 9.0) board.S.push(r);
        else if (r.rating >= 8.0) board.A.push(r);
        else if (r.rating >= 7.0) board.B.push(r);
        else if (r.rating >= 6.0) board.C.push(r);
        else if (r.rating >= 4.5) board.D.push(r);
        else board.F.push(r);
    });

    Object.keys(board).forEach(tier => {
        const el = document.getElementById('tier-' + tier);
        if (el) {
            el.innerHTML = board[tier].map(r => `<div class="tier-chip">${r.name}</div>`).join('');
        }
    });
}

// --- 10. Utils ---
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function openImageViewer(src) {
    const modal = document.getElementById('imageViewerModal');
    const fullImg = document.getElementById('fullSizeImage');
    if (modal && fullImg) {
        fullImg.src = src;
        modal.classList.add('show');
    }
}

function closeImageViewer() {
    document.getElementById('imageViewerModal').classList.remove('show');
}

function updateCuisineLists() {
    const cuisines = getCuisines();
    const view = document.getElementById('cuisineViewList');
    const edit = document.getElementById('cuisineEditList');
    if (view) view.innerHTML = cuisines.map(c => `<div class="tier-chip" style="margin:2px; display:inline-block;">${c}</div>`).join('');
    if (edit) edit.innerHTML = cuisines.map((c, i) => `
        <div class="cuisine-edit-item">
            <span>${c}</span>
            <button onclick="removeCuisine(${i})" style="background:none; border:none; color:#c84a4a; cursor:pointer;">×</button>
        </div>
    `).join('');
}

function toggleEdit() {
    editMode = !editMode;
    document.getElementById('cuisineViewList').style.display = editMode ? 'none' : 'block';
    document.getElementById('cuisineEditPanel').style.display = editMode ? 'block' : 'none';
}

function addCuisine() {
    const inp = document.getElementById('newCuisineInput');
    const val = inp.value.trim();
    if (!val) return;
    const cuisines = getCuisines();
    cuisines.push(val);
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(cuisines));
    inp.value = '';
    initWheel();
}

function removeCuisine(idx) {
    const cuisines = getCuisines();
    if (cuisines.length <= 2) return showToast("Need at least 2 options");
    cuisines.splice(idx, 1);
    localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(cuisines));
    initWheel();
}

function renderHistory() {
    const el = document.getElementById('historyList');
    if (!el) return;
    if (spinHistory.length === 0) {
        el.innerHTML = '<span class="history-empty">no spins yet</span>';
        return;
    }
    el.innerHTML = spinHistory.map(h => `
        <div class="history-item">
            <strong>${h.name}</strong>
            <span style="font-size:9px; color:var(--muted)">${h.date}</span>
        </div>
    `).join('');
}

function clearHistory() {
    spinHistory = [];
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
}
