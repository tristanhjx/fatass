const STORAGE_KEY='fatass_reviews_v3';
const CUISINE_LIST_KEY='fatass_cuisines_list_v3';
const AUTHOR_LIST_KEY='fatass_authors_v3';
const WHEEL_CUISINES_KEY='fatass_wheel_cuisines_v3';
const HISTORY_KEY='fatass_history_v3';

let reviews = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let cuisineList = JSON.parse(localStorage.getItem(CUISINE_LIST_KEY)) || ["Hawker / Local", "Japanese", "Italian", "Thai", "Western", "Chinese", "Korean", "Indian"];
let authorList = JSON.parse(localStorage.getItem(AUTHOR_LIST_KEY)) || [];
let spinHistory = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
let spinning=false, currentAngle=0, pendingRemove=null, editMode=false;

const PALETTE=['#c87941','#4a9d9c','#b05070','#c8a041','#8a6cc8','#41a06c','#6c8ac8','#c85a5a','#5a9ec8','#9d7a4a'];
let wheelCuisines = JSON.parse(localStorage.getItem(WHEEL_CUISINES_KEY)) || [
  {label:'Hawker',color:'#c87941'},{label:'Japanese',color:'#4a9d9c'},{label:'Korean',color:'#b05070'},
  {label:'Chinese',color:'#c8a041'},{label:'Indian',color:'#8a6cc8'},{label:'Thai',color:'#41a06c'},
  {label:'Western',color:'#6c8ac8'},{label:'Italian',color:'#c85a5a'}
];

// Slider Logic
const slider = document.getElementById('ratingSlider');
const display = document.getElementById('ratingValueDisplay');
function getTierColor(v) {
  if(v >= 9.0) return '#c87941'; if(v >= 8.0) return '#4a9d9c'; if(v >= 7.0) return '#4a7a9d';
  if(v >= 6.0) return '#6a6a6a'; if(v >= 4.5) return '#3a3a3a'; return '#c84a4a';
}
if(slider) {
    slider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value).toFixed(1);
        display.textContent = v; display.style.color = getTierColor(v);
        slider.style.accentColor = getTierColor(v);
    });
}

// Wheel Drawing
function drawWheel(ctx, angle){
  const cx=170, cy=170, r=155, n=wheelCuisines.length;
  if(!n) return;
  const arc=2*Math.PI/n;
  ctx.clearRect(0,0,340,340);
  wheelCuisines.forEach((c,i)=>{
    const start=angle+i*arc, end=start+arc;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.arc(cx,cy,r,start,end); ctx.closePath();
    ctx.fillStyle=c.color; ctx.fill(); ctx.strokeStyle='#1e1e1e'; ctx.lineWidth=2; ctx.stroke();
    ctx.save(); ctx.translate(cx,cy); ctx.rotate(start+arc/2);
    ctx.textAlign='right'; ctx.fillStyle='#fff'; ctx.font='bold 11px Monaco,monospace';
    ctx.fillText(c.label,r-10,4); ctx.restore();
  });
  ctx.beginPath(); ctx.arc(cx,cy,18,0,2*Math.PI); ctx.fillStyle='#1e1e1e'; ctx.fill();
  ctx.strokeStyle='#c87941'; ctx.lineWidth=2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx,cy-r-5); ctx.lineTo(cx-10,cy-r+14); ctx.lineTo(cx+10,cy-r+14);
  ctx.closePath(); ctx.fillStyle='#e8e4dc'; ctx.fill();
}

function spinWheel(){
  if(spinning || !wheelCuisines.length) return;
  spinning=true; document.getElementById('spinBtn').disabled=true;
  const canvas=document.getElementById('wheelCanvas'), ctx=canvas.getContext('2d');
  const extraSpins=10+Math.random()*5, totalRot=Math.PI*2*extraSpins, duration=6500, start=performance.now(), startAngle=currentAngle;
  function frame(now){
    const t=Math.min((now-start)/duration,1);
    currentAngle=startAngle+totalRot*(1-Math.pow(1-t,4));
    drawWheel(ctx,currentAngle);
    if(t<1) requestAnimationFrame(frame);
    else {
      spinning=false; document.getElementById('spinBtn').disabled=false;
      const arc=2*Math.PI/wheelCuisines.length;
      const adjusted=(((-Math.PI/2)-currentAngle)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      const idx=Math.floor(adjusted/arc)%wheelCuisines.length;
      showSpinResult(wheelCuisines[idx],idx);
    }
  }
  document.getElementById('wheelResult').innerHTML='<div class="cuisine-sub">spinning...</div>';
  requestAnimationFrame(frame);
}

function showSpinResult(c, idx){
  const now=new Date();
  const timeStr=now.toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'});
  spinHistory.unshift({label:c.label, color:c.color, time:timeStr});
  localStorage.setItem(HISTORY_KEY, JSON.stringify(spinHistory.slice(0,20)));
  renderHistory();
  document.getElementById('wheelResult').innerHTML=`<div class="cuisine-name" style="color:${c.color}">${c.label}</div><div class="cuisine-sub">fate has spoken</div>`;
  document.getElementById('resultActions').innerHTML=`<button class="btn btn-danger" style="font-size:10px;padding:5px 10px;" onclick="promptRemove(${idx})">Remove from wheel</button>`;
}

function showPage(id){
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-'+id).classList.add('active');
  if(id==='reviews') renderReviews();
  if(id==='tier') renderTierBoard();
  if(id==='spin') { renderWheel(); renderHistory(); renderCuisineView(); renderCuisineEditList(); }
}

async function submitReview() {
  const name=document.getElementById('inp-name').value, loc=document.getElementById('inp-loc').value;
  const cuisine=document.getElementById('inp-cuisine').value, author=document.getElementById('inp-author').value;
  const rating=parseFloat(slider.value), text=document.getElementById('inp-review').value, imgFile=document.getElementById('inp-img').files[0];
  if(!name || !cuisine || !author) return showToast('Fill the basics!');
  let imgBase64 = "";
  if(imgFile) imgBase64 = await new Promise(res => { const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(imgFile); });
  reviews.push({ id:Date.now(), name, loc, cuisine, author, rating, text, img:imgBase64 });
  if(!cuisineList.includes(cuisine)) cuisineList.push(cuisine);
  if(!authorList.includes(author)) authorList.push(author);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
  localStorage.setItem(CUISINE_LIST_KEY, JSON.stringify(cuisineList));
  localStorage.setItem(AUTHOR_LIST_KEY, JSON.stringify(authorList));
  updateDatalists(); showToast('Posted!'); showPage('reviews');
}

function renderReviews(){
  document.getElementById('restGrid').innerHTML = reviews.sort((a,b)=>b.id-a.id).map(r => `
    <div class="rest-card">
      <div class="tag">${r.cuisine}</div>
      <h3>${r.name}</h3>
      <div class="location">📍 ${r.loc}</div>
      <div class="rating-val" style="color:${getTierColor(r.rating)}">${r.rating.toFixed(1)} <span class="review-count">by ${r.author}</span></div>
      <div class="snippet">${r.text}</div>
      ${r.img ? `<img src="${r.img}" class="review-img">` : ''}
    </div>`).join('');
}

function renderTierBoard(){
  const t={S:[],A:[],B:[],C:[],D:[],F:[]};
  reviews.forEach(r => {
    if(r.rating>=9) t.S.push(r); else if(r.rating>=8) t.A.push(r); else if(r.rating>=7) t.B.push(r);
    else if(r.rating>=6) t.C.push(r); else if(r.rating>=4.5) t.D.push(r); else t.F.push(r);
  });
  Object.keys(t).forEach(k => {
      const el = document.getElementById('tier-'+k);
      if(el) el.innerHTML = t[k].map(r => `<div class="tier-chip">${r.name}</div>`).join('') || '<span class="history-empty">empty</span>';
  });
}

function updateDatalists(){
  document.getElementById('list-cuisines').innerHTML = cuisineList.sort().map(c => `<option value="${c}">`).join('');
  document.getElementById('list-authors').innerHTML = authorList.sort().map(a => `<option value="${a}">`).join('');
}

function renderWheel(){ 
    const canvas = document.getElementById('wheelCanvas');
    if(canvas) drawWheel(canvas.getContext('2d'), currentAngle); 
}
function toggleEdit(){ editMode=!editMode; document.getElementById('cuisineViewList').style.display=editMode?'none':'block'; document.getElementById('cuisineEditPanel').style.display=editMode?'block':'none'; }
function renderCuisineView(){ document.getElementById('cuisineViewList').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:5px;">`+ wheelCuisines.map(c=>`<span style="border:1px solid ${c.color};color:${c.color};font-size:10px;padding:2px 5px;">${c.label}</span>`).join('')+`</div>`; }
function renderCuisineEditList(){ document.getElementById('cuisineEditList').innerHTML = wheelCuisines.map((c,i)=>`<div class="cuisine-edit-item"><div class="cuisine-color-dot" style="background:${c.color}"></div><span>${c.label}</span><button onclick="removeCuisine(${i})">✕</button></div>`).join(''); }
function addCuisine(){ const i=document.getElementById('newCuisineInput'), l=i.value.trim(); if(!l) return; wheelCuisines.push({label:l, color:PALETTE[wheelCuisines.length%PALETTE.length]}); localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines)); i.value=''; renderWheel(); renderCuisineView(); renderCuisineEditList(); }
function removeCuisine(i){ wheelCuisines.splice(i,1); localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines)); renderWheel(); renderCuisineView(); renderCuisineEditList(); }
function renderHistory(){ document.getElementById('historyList').innerHTML = spinHistory.map(h => `<div class="history-item"><span style="color:${h.color}">${h.label}</span><span class="history-time">${h.time}</span></div>`).join('') || '<span class="history-empty">no spins</span>'; }
function clearHistory(){ spinHistory=[]; localStorage.removeItem(HISTORY_KEY); renderHistory(); }
function promptRemove(i){ pendingRemove=i; document.getElementById('removeModalText').textContent=`Remove ${wheelCuisines[i].label}?`; document.getElementById('removeModal').classList.add('show'); }
function confirmRemove(){ wheelCuisines.splice(pendingRemove,1); localStorage.setItem(WHEEL_CUISINES_KEY, JSON.stringify(wheelCuisines)); closeModal(); renderWheel(); document.getElementById('wheelResult').innerHTML='<div class="cuisine-sub">removed</div>'; }
function closeModal(){ document.getElementById('removeModal').classList.remove('show'); }
function showToast(m){ const t=document.getElementById('toast'); t.textContent=m; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2000); }

// Initialize everything on load
updateDatalists();
renderReviews();