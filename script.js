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
let tierData = {S:[], A:[], B:[], C:[], D:[], F:[]};
let spinHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];

let spinning = false;
let currentAngle = 0;
let pendingRemove = null;
let editMode = false;
let currentEditId = null;

const PALETTE = ['#c87941', '#4a9d9c', '#4a7a9d', '#6a6a6a', '#8e8e8e', '#a0602e'];

// --- 3. Firebase Sync ---
function syncWithFirebase() {
    db.collection('reviews').orderBy('date', 'desc').onSnapshot(snapshot => {
        reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        tierData = {S:[], A:[], B:[], C:[], D:[], F:[]};
        reviews.forEach(r => autoMapToTier(r));
        renderReviews();
        renderTierBoard();
        updateCuisineDatalist();
        updateAuthorDropdowns(); // Dynamic population of your name list
    });
}

// --- 4. Core Logic: Author Dropdown Population ---
function updateAuthorDropdowns() {
    // Extract unique authors from the database
    const uniqueAuthors = [...new Set(reviews.map(r => r.author).filter(Boolean))].sort();
    
    const addSelect = document.getElementById('inp-author');
    const editSelect = document.getElementById('edit-author');

    const fillSelect = (selectEl, defaultText) => {
        if (!selectEl) return;
        const currentVal = selectEl.value;
        selectEl.innerHTML = `<option value="" disabled selected>${defaultText}</option>`;
        uniqueAuthors.forEach(author => {
            const opt = document.createElement('option');
            opt.value = author;
            opt.textContent = author;
            selectEl.appendChild(opt);
        });
        if (currentVal) selectEl.value = currentVal;
    };

    fillSelect(addSelect, "Select Name");
    fillSelect(editSelect, "Select Name");
}

function updateCuisineDatalist() {
    const list = document.getElementById('list-cuisines');
    const cuisines = [...new Set(reviews.map(r => r.cuisine).filter(Boolean))].sort();
    list.innerHTML = cuisines.map(c => `<option value="${c}">`).join('');
}

// --- 5. Navigation ---
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    if(pageId === 'spin') initWheel();
    window.scrollTo(0,0);
}

// --- 6. Review CRUD ---
async function submitReview() {
    const name = document.getElementById('inp-name').value.trim();
    const author = document.getElementById('inp-author').value; // Get from select
    const cuisine = document.getElementById('inp-cuisine').value.trim();
    const rating = parseFloat(document.getElementById('ratingSlider').value);
    const text = document.getElementById('inp-review').value.trim();
    const imgFile = document.getElementById('inp-img').files[0];
    
    // Location handling
    const region = document.getElementById('inp-region').value;
    const town = document.getElementById('inp-town').value.trim();
    const link = document.getElementById('inp-link').value.trim();
    
    if(!name || !author || !cuisine || !region || !town) {
        return showToast('Please fill all required fields');
    }

    const locString = `${town} (${region})${link ? ' — ' + link : ''}`;

    let imgData = [];
    if(imgFile) {
        const compressed = await resizeImage(imgFile);
        imgData.push(compressed);
    }

    try {
        await db.collection('reviews').add({
            name, author, cuisine, rating, text, 
            img: imgData,
            loc: locString,
            date: new Date().toISOString()
        });
        showToast('Review posted!');
        resetForm();
        showPage('reviews');
    } catch(e) {
        showToast('Error posting review');
    }
}

function resetForm() {
    document.getElementById('inp-name').value = '';
    document.getElementById('inp-author').value = '';
    document.getElementById('inp-cuisine').value = '';
    document.getElementById('inp-review').value = '';
    document.getElementById('inp-img').value = '';
    document.getElementById('inp-region').value = '';
    document.getElementById('inp-town').value = '';
    document.getElementById('inp-link').value = '';
    document.getElementById('ratingSlider').value = 7.0;
    document.getElementById('ratingValueDisplay').textContent = '7.0';
}

async function deleteReview(id) {
    if(confirm('Delete this review forever?')) {
        await db.collection('reviews').doc(id).delete();
        showToast('Review deleted');
    }
}

// --- 7. Modal Logic (Edit/Image) ---
function openEditModal(id) {
    currentEditId = id;
    const r = reviews.find(item => item.id === id);
    if (!r) return;

    document.getElementById('edit-name').value = r.name;
    document.getElementById('edit-cuisine').value = r.cuisine;
    document.getElementById('edit-author').value = r.author || ""; // Set select value
    document.getElementById('edit-review').value = r.text;
    document.getElementById('edit-rating-slider').value = r.rating;
    document.getElementById('edit-rating-display').textContent = r.rating.toFixed(1);

    // Parse location string back to fields
    let region = ""; let town = ""; let link = "";
    if (r.loc) {
        const parts = r.loc.split(' — ');
        link = parts[1] || "";
        const locMatch = parts[0].match(/(.*) \((.*)\)/);
        if (locMatch) {
            town = locMatch[1];
            region = locMatch[2];
        }
    }
    document.getElementById('edit-region').value = region;
    document.getElementById('edit-town').value = town;
    document.getElementById('edit-link').value = link;

    window.tempEditImages = r.img || [];
    renderEditImagePreviews();
    document.getElementById('editModal').classList.add('show');
}

function closeEditModal() {
    document.getElementById('editModal').classList.remove('show');
}

function renderEditImagePreviews() {
    const container = document.getElementById('edit-image-preview-container');
    container.innerHTML = '';
    window.tempEditImages.forEach((src, idx) => {
        const wrap = document.createElement('div');
        wrap.className = 'edit-img-wrap';
        wrap.innerHTML = `<img src="${src}" style="width:60px;height:60px;object-fit:cover;">
                          <button onclick="removeTempImg(${idx})">×</button>`;
        container.appendChild(wrap);
    });
}

function removeTempImg(idx) {
    window.tempEditImages.splice(idx, 1);
    renderEditImagePreviews();
}

async function saveEdit() {
    const region = document.getElementById('edit-region').value;
    const town = document.getElementById('edit-town').value.trim();
    const link = document.getElementById('edit-link').value.trim();
    const loc = `${town} (${region})${link ? ' — ' + link : ''}`;

    const fileInput = document.getElementById('edit-img-input');
    const newFiles = fileInput ? fileInput.files : [];
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
            author: document.getElementById('edit-author').value, // Save author
            loc: loc,
            cuisine: document.getElementById('edit-cuisine').value.trim(),
            text: document.getElementById('edit-review').value.trim(),
            rating: parseFloat(document.getElementById('edit-rating-slider').value),
            img: [...(window.tempEditImages || []), ...uploadedImages]
        };

        await db.collection('reviews').doc(currentEditId).update(update);
        showToast('Updated successfully');
        closeEditModal();
    } catch (e) {
        showToast('Update failed');
    }
}

// --- 8. UI Rendering ---
function renderReviews() {
    const grid = document.getElementById('restGrid');
    grid.innerHTML = reviews.map(r => `
        <div class="review-card">
            <div class="card-actions">
                <button class="action-btn" onclick="openEditModal('${r.id}')">edit</button>
                <button class="action-btn delete-btn" onclick="deleteReview('${r.id}')">del</button>
            </div>
            <div class="card-header">
                <div class="card-title">
                    <h3>${r.name}</h3>
                    <div class="cuisine">${r.cuisine}</div>
                </div>
            </div>
            <div class="rating-val">${r.rating.toFixed(1)} <span class="rating-max">/ 10</span></div>
            <div class="review-meta">${r.author} • ${r.loc || 'Unknown'}</div>
            <div class="review-text">${r.text}</div>
            <div class="review-imgs">
                ${(r.img || []).map(src => `<img src="${src}" class="review-img-thumb" onclick="openImageViewer('${src}')">`).join('')}
            </div>
        </div>
    `).join('');
}

function autoMapToTier(r) {
    const score = r.rating;
    if(score >= 9.0) tierData.S.push(r);
    else if(score >= 8.0) tierData.A.push(r);
    else if(score >= 7.0) tierData.B.push(r);
    else if(score >= 6.0) tierData.C.push(r);
    else if(score >= 4.5) tierData.D.push(r);
    else tierData.F.push(r);
}

function renderTierBoard() {
    Object.keys(tierData).forEach(tier => {
        const container = document.getElementById(`tier-${tier}`);
        container.innerHTML = tierData[tier].sort((a,b) => b.rating - a.rating).map(r => `
            <div class="tier-card" title="${r.name}">
                <div class="t-name">${r.name}</div>
                <div class="t-score">${r.rating.toFixed(1)}</div>
            </div>
        `).join('');
    });
}

// --- 9. Wheel Logic ---
let wheelCuisines = JSON.parse(localStorage.getItem(WHEEL_CUISINES_KEY)) || [
    "Japanese", "Korean", "Western", "Chinese", "Thai", "Malay", "Indian"
];

function initWheel() {
    renderCuisineLists();
    drawWheel();
}

function renderCuisineLists() {
    const viewList = document.getElementById('cuisineViewList');
    viewList.innerHTML = wheelCuisines.map(c => `<span class="cuisine-tag">${c}</span>`).join(' ');
    
    const editList = document.getElementById('cuisineEditList');
    editList.innerHTML = wheelCuisines.map((c, i) => `
        <div class="cuisine-edit-item">
            <span>${c}</span>
            <button onclick="removeCuisine(${i})">×</button>
        </div>
    `).join('');
}

function drawWheel() {
    const canvas = document.getElementById('wheelCanvas');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = canvas.width / 2 - 10;
    
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const slice = (Math.PI * 2) / wheelCuisines.length;

    wheelCuisines.forEach((c, i) => {
        const angle = currentAngle + (i * slice);
        ctx.beginPath();
        ctx.fillStyle = PALETTE[i % PALETTE.length];
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, angle, angle + slice);
        ctx.fill();
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(angle + slice/2);
        ctx.textAlign = "right";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px Monaco";
        ctx.fillText(c.toUpperCase(), radius - 20, 5);
        ctx.restore();
    });
}

function spinWheel() {
    if(spinning || wheelCuisines.length === 0) return;
    spinning = true;
    const duration = 3000;
    const start = performance.now();
    const extraSpins = (Math.random() * 5 + 5) * Math.PI * 2;
    const initialAngle = currentAngle;

    function animate(now) {
        let elapsed = now - start;
        let progress = Math.min(elapsed / duration, 1);
        let ease = 1 - Math.pow(1 - progress, 3);
        
        currentAngle = initialAngle + (extraSpins * ease);
        drawWheel();

        if(progress < 1) {
            requestAnimationFrame(animate);
        } else {
            spinning = false;
            finalizeSpin();
        }
    }
    requestAnimationFrame(animate);
}

function finalizeSpin() {
    const slice = (Math.PI * 2) / wheelCuisines.length;
    const normalized = (currentAngle % (Math.PI * 2));
    const index = Math.floor((Math.PI * 2 - normalized) / slice) % wheelCuisines.length;
    const result = wheelCuisines[index];

    const resDiv = document.getElementById('wheelResult');
    resDiv.innerHTML = `<div class="result-name">${result}</div><div class="cuisine-sub">fate has decided</div>`;
    
    spinHistory.unshift({name: result, date: new Date().toLocaleTimeString()});
    if(spinHistory.length > 10) spinHistory.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory));
    renderHistory();
    
    const actions = document.getElementById('resultActions');
    actions.innerHTML = `<button class="btn btn-ghost" onclick="showRemoveModal('${result}')">Not feeling ${result}?</button>`;
}

// --- 10. Utils ---
function showToast(msg) {
    const t = document.getElementById('toast');
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
    const modal = document.getElementById('imageViewerModal');
    if (modal) modal.classList.remove('show');
}

// Init
syncWithFirebase();
document.getElementById('ratingSlider').addEventListener('input', (e) => {
    document.getElementById('ratingValueDisplay').textContent = parseFloat(e.target.value).toFixed(1);
});
document.getElementById('edit-rating-slider').addEventListener('input', (e) => {
    document.getElementById('edit-rating-display').textContent = parseFloat(e.target.value).toFixed(1);
});
