/* ---------------------------
  Dynamic Leaderboard — script.js
  Features: AVL + Heap, rank movement, Top-K, search, persistence, chart
--------------------------- */

/* ---------------------------
  Data storage
--------------------------- */
const players = new Map(); // name -> { score, history, lastRank }
const playerHistory = new Map(); // name -> [scores]

/* ---------------------------
  AVL Tree (balanced BST)
--------------------------- */
class AVLNode {
  constructor(score, name){
    this.score = score;
    this.name = name;
    this.left = null;
    this.right = null;
    this.height = 1;
  }
}

class AVLTree {
  constructor(){ this.root = null; }
  height(n){ return n ? n.height : 0; }
  updateHeight(n){ n.height = 1 + Math.max(this.height(n.left), this.height(n.right)); }
  rotateRight(y){ const x=y.left,T2=x.right;x.right=y;y.left=T2;this.updateHeight(y);this.updateHeight(x);return x; }
  rotateLeft(x){ const y=x.right,T2=y.left;y.left=x;x.right=T2;this.updateHeight(x);this.updateHeight(y);return y; }
  cmp(s1,n1,s2,n2){ if(s1!==s2) return s2-s1; return n1.localeCompare(n2); }
  _insert(node,score,name){
    if(!node) return new AVLNode(score,name);
    const c=this.cmp(score,name,node.score,node.name);
    if(c<0) node.left=this._insert(node.left,score,name);
    else if(c>0) node.right=this._insert(node.right,score,name);
    else return node;
    this.updateHeight(node);
    const bf=this.height(node.left)-this.height(node.right);
    if(bf>1 && this.cmp(score,name,node.left.score,node.left.name)<0) return this.rotateRight(node);
    if(bf<-1 && this.cmp(score,name,node.right.score,node.right.name)>0) return this.rotateLeft(node);
    if(bf>1 && this.cmp(score,name,node.left.score,node.left.name)>0){ node.left=this.rotateLeft(node.left); return this.rotateRight(node); }
    if(bf<-1 && this.cmp(score,name,node.right.score,node.right.name)<0){ node.right=this.rotateRight(node.right); return this.rotateLeft(node); }
    return node;
  }
  insert(score,name){ this.root=this._insert(this.root,score,name); }
  _minValueNode(node){ let cur=node; while(cur.left) cur=cur.left; return cur; }
  _delete(node,score,name){
    if(!node) return node;
    const c=this.cmp(score,name,node.score,node.name);
    if(c<0) node.left=this._delete(node.left,score,name);
    else if(c>0) node.right=this._delete(node.right,score,name);
    else{
      if(!node.left || !node.right) node=node.left?node.left:node.right;
      else{
        const temp=this._minValueNode(node.right);
        node.score=temp.score; node.name=temp.name;
        node.right=this._delete(node.right,temp.score,temp.name);
      }
    }
    if(!node) return node;
    this.updateHeight(node);
    const bf=this.height(node.left)-this.height(node.right);
    if(bf>1 && this.height(node.left.left)-this.height(node.left.right)>=0) return this.rotateRight(node);
    if(bf>1 && this.height(node.left.left)-this.height(node.left.right)<0){ node.left=this.rotateLeft(node.left); return this.rotateRight(node); }
    if(bf<-1 && this.height(node.right.left)-this.height(node.right.right)<=0) return this.rotateLeft(node);
    if(bf<-1 && this.height(node.right.left)-this.height(node.right.right)>0){ node.right=this.rotateRight(node.right); return this.rotateLeft(node); }
    return node;
  }
  delete(score,name){ this.root=this._delete(this.root,score,name); }
  _inorder(node,out){ if(!node) return; this._inorder(node.left,out); out.push({name:node.name,score:node.score}); this._inorder(node.right,out); }
  toArrayDesc(){
    const arr=[];
    const rev=(node)=>{ if(!node) return; rev(node.left); arr.push([node.name,node.score]); rev(node.right); };
    rev(this.root);
    return arr;
  }
  rankOf(name){ const arr=this.toArrayDesc(); for(let i=0;i<arr.length;i++) if(arr[i][0]===name) return i+1; return -1; }
}
const avl=new AVLTree();

/* ---------------------------
  MinHeap (Top-K)
--------------------------- */
class MinHeap {
  constructor(){ this.data=[]; }
  size(){ return this.data.length; }
  top(){ return this.data[0]; }
  push(pair){ this.data.push(pair); this._siftUp(this.data.length-1); }
  pop(){ if(this.data.length===0) return null; const root=this.data[0]; const last=this.data.pop(); if(this.data.length){ this.data[0]=last; this._siftDown(0); } return root; }
  _siftUp(i){ while(i>0){ const p=Math.floor((i-1)/2); if(this.data[p][0]<=this.data[i][0]) break; [this.data[p],this.data[i]]=[this.data[i],this.data[p]]; i=p; } }
  _siftDown(i){ const n=this.data.length; while(true){ let l=2*i+1,r=2*i+2,smallest=i; if(l<n && this.data[l][0]<this.data[smallest][0]) smallest=l; if(r<n && this.data[r][0]<this.data[smallest][0]) smallest=r; if(smallest===i) break; [this.data[i],this.data[smallest]]=[this.data[smallest],this.data[i]]; i=smallest; } }
}

/* ---------------------------
  UI Elements
--------------------------- */
const tbody=document.querySelector("#leaderboardTable tbody");
const topKListEl=document.getElementById("topKList");
const totalPlayersEl=document.getElementById("totalPlayers");
const avgScoreEl=document.getElementById("avgScore");
const selectedPlayerEl=document.getElementById("selectedPlayer");
const rankAroundEl=document.getElementById("rankAround");
const avatarPreview=document.getElementById("avatarPreview");

/* ---------------------------
  Toast helper
--------------------------- */
function toast(msg){
  const c=document.getElementById('toasts');
  const t=document.createElement('div'); t.className='toast'; t.textContent=msg;
  c.appendChild(t); setTimeout(()=>t.remove(),2200);
}

/* ---------------------------
  Local storage
--------------------------- */
function saveToLocal(){ localStorage.setItem('dl_players_v2',JSON.stringify([...players])); toast('Saved'); }
function loadFromLocal(){
  const raw=localStorage.getItem('dl_players_v2'); if(!raw) return;
  const arr=JSON.parse(raw); players.clear(); playerHistory.clear(); avl.root=null;
  arr.forEach(([name,obj])=>{ players.set(name,obj); playerHistory.set(name,obj.history||[obj.score]); avl.insert(obj.score,name); });
  updateUI(); toast('Loaded');
}

/* ---------------------------
  Core operations
--------------------------- */
function addOrUpdatePlayer(name,score){
  if(!name){ alert('Enter name'); return; }
  score=Number(score)||0;
  const oldRanks=getAllRanks();
  const existed=players.has(name);
  if(existed){
    const old=players.get(name);
    avl.delete(old.score,name);
    const hist=(old.history||[]).concat(score);
    players.set(name,{score,history:hist});
    playerHistory.set(name,hist);
    avl.insert(score,name);
    toast(`Updated ${name}`);
  } else {
    players.set(name,{score,history:[score]});
    playerHistory.set(name,[score]);
    avl.insert(score,name);
    toast(`Added ${name}`);
  }
  updateUI(name,oldRanks);
}

function removePlayer(name){
  if(!players.has(name)){ alert('Not found'); return; }
  const obj=players.get(name);
  avl.delete(obj.score,name);
  players.delete(name); playerHistory.delete(name);
  updateUI(); toast(`Removed ${name}`);
}

function changeScoreBy(name,delta){ if(!players.has(name)){ alert('Not found'); return; } const obj=players.get(name); addOrUpdatePlayer(name,obj.score+delta); }

/* ---------------------------
  Stats & badges
--------------------------- */
function computeStats(){
  const n=players.size; let sum=0;
  for(const [k,v] of players) sum+=v.score;
  totalPlayersEl.textContent=`${n}`;
  avgScoreEl.textContent=n?Math.round(sum/n):0;
}

function badgeFor(rank,name,oldRank){
  const badges=[];
  if(rank===1) badges.push('🥇 Top 1');
  else if(rank===2) badges.push('🥈 Top 2');
  else if(rank===3) badges.push('🥉 Top 3');
  else if(rank<=10) badges.push('⭐ Top 10');
  if(oldRank && rank<oldRank && oldRank-rank>=3) badges.push('⤴️ Fast Climber');
  return badges.join(' • ');
}

/* ---------------------------
  Render UI
--------------------------- */
function renderTop3(arr){
  const first=document.getElementById('firstCard');
  const second=document.getElementById('secondCard');
  const third=document.getElementById('thirdCard');
  function setCard(el,entry){
    el.querySelector('.name')?.remove?.();
    el.querySelector('.score')?.remove?.();
    const name=document.createElement('div'); name.className='name'; name.textContent=entry?entry[0]:'—';
    const score=document.createElement('div'); score.className='score'; score.textContent=entry?entry[1]:'—';
    el.appendChild(name); el.appendChild(score);
  }
  setCard(first,arr[0]); setCard(second,arr[1]); setCard(third,arr[2]);
}

function renderTopK(k=5){
  const heap=new MinHeap();
  for(const [name,obj] of players){
    const s=obj.score;
    if(heap.size()<k) heap.push([s,name]);
    else if(s>heap.top()[0]){ heap.pop(); heap.push([s,name]); }
  }
  const out=[];
  while(heap.size()) out.push(heap.pop());
  out.reverse();
  topKListEl.innerHTML='';
  out.forEach((v,idx)=>{
    const el=document.createElement('div'); el.className='small';
    el.textContent=`#${idx+1} ${v[1]} — ${v[0]}`;
    topKListEl.appendChild(el);
  });
}

/* ---------------------------
  Rank movement
--------------------------- */
function renderRankMovement(name,currentRank,oldRank){
  const player=players.get(name); const diff=oldRank-currentRank; player.lastRank=currentRank;
  let cls='',icon='';
  if(diff>0){ cls='up'; icon=`▲ ${diff}`; }
  else if(diff<0){ cls='down'; icon=`▼ ${Math.abs(diff)}`; }
  else icon='—';
  return `<span class="rank-change ${cls}">${icon}</span>`;
}

/* ---------------------------
  Update leaderboard
--------------------------- */
function updateUI(highlightName=null,oldRanks={}){
  const arr=avl.toArrayDesc(); tbody.innerHTML='';
  arr.forEach(([name,score],idx)=>{
    const tr=document.createElement('tr'); tr.className='player-row';
    tr.innerHTML=`
      <td class="rank-col">${idx+1}</td>
      <td><div class="player-cell"><div class="avatar small">${name.slice(0,1).toUpperCase()}</div><div class="player-name">${name}<div class="muted small">${badgeFor(idx+1,name,oldRanks[name])}</div></div></div></td>
      <td>${score}</td>
      <td class="rank-change-cell">${renderRankMovement(name,idx+1,oldRanks[name]||idx+1)}</td>
      <td><button class="btn ghost" data-action="view" data-name="${name}">View</button> <button class="btn ghost" data-action="remove" data-name="${name}">Remove</button></td>
    `;
    if(name===highlightName) tr.style.outline='2px solid rgba(0,209,255,0.12)';
    tr.querySelector('[data-action="view"]').onclick=()=>showPlayerModal(name);
    tr.querySelector('[data-action="remove"]').onclick=()=>{ if(confirm(`Remove ${name}?`)) removePlayer(name); };
    tr.onclick=(e)=>{ if(e.target.tagName.toLowerCase()==='button') return; selectPlayer(name); };
    tbody.appendChild(tr);
  });
  computeStats();
  renderTopK(Number(document.getElementById('topK').value)||5);
  renderTop3(arr);
  saveToLocal();
}
/* Import / Export */
function exportJSON(){
  const data = JSON.stringify([...players]);
  const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,'+encodeURIComponent(data);
  a.download = 'leaderboard.json'; a.click();
}
function importJSON(){
  const input = document.createElement('input'); input.type='file'; input.accept='application/json';
  input.onchange = e => {
    const f = e.target.files[0]; const reader = new FileReader();
    reader.onload = ev => {
      try {
        const arr = JSON.parse(ev.target.result);
        players.clear(); playerHistory.clear(); avl.root=null;
        arr.forEach(([name,obj]) => { players.set(name,obj); playerHistory.set(name,obj.history||[obj.score]); avl.insert(obj.score,name); });
        updateUI(); toast('Imported');
      } catch(err) { alert('Invalid file'); }
    };
    reader.readAsText(f);
  };
  input.click();
}

/* ---------------------------
  Select Player Panel
--------------------------- */
function selectPlayer(name){
  const obj=players.get(name); if(!obj) return;
  const arr=avl.toArrayDesc(); const idx=arr.findIndex(x=>x[0]===name);
  const currentRank=idx+1;
  const above=idx>0?`${arr[idx-1][0]} (${arr[idx-1][1]})`:'—';
  const below=idx<arr.length-1?`${arr[idx+1][0]} (${arr[idx+1][1]})`:'—';
  const oldRank=obj.lastRank||currentRank; const diff=oldRank-currentRank;
  let changeText='—';
  if(diff>0) changeText=`📈 Gained ${diff} rank(s)`;
  else if(diff<0) changeText=`📉 Lost ${Math.abs(diff)} rank(s)`;
  obj.lastRank=currentRank;

  selectedPlayerEl.textContent=`${name}`;
  document.getElementById('selectedRank').textContent=`Score: ${obj.score} | Rank: ${currentRank}`;
  document.getElementById('rankChange').textContent=changeText;
  rankAroundEl.textContent=`Above: ${above}  |  Below: ${below}`;

  const hist=obj.history; const ctx=document.getElementById('miniChart').getContext('2d');
  if(window.miniChart) window.miniChart.destroy();
  window.miniChart=new Chart(ctx,{type:'line',data:{labels:hist.map((_,i)=>`T${i+1}`),datasets:[{label:name,data:hist,fill:false,borderWidth:2,tension:0.25}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
}

const modal=document.getElementById('chartModal');
const chartTitle=document.getElementById('chartTitle');
const ctx=document.getElementById('scoreChart').getContext('2d');
let chartInstance=null;
function showPlayerModal(name){
  const hist=playerHistory.get(name)||[players.get(name).score];
  chartTitle.textContent=`${name} — Score History`;
  if(chartInstance) chartInstance.destroy();
  chartInstance=new Chart(ctx,{type:'line',data:{labels:hist.map((_,i)=>`T${i+1}`),datasets:[{label:name,data:hist,fill:false,borderWidth:2,tension:0.25}]},options:{responsive:true,scales:{y:{beginAtZero:true}}}});
  modal.classList.remove('hidden');
}
document.getElementById('closeChart').onclick=()=>modal.classList.add('hidden');
function getAllRanks(){ const arr=avl.toArrayDesc(); const ranks={}; arr.forEach(([name],idx)=>{ ranks[name]=idx+1; }); return ranks; }

/* ---------------------------
  UI bindings
--------------------------- */
document.getElementById('playerName').addEventListener('input',(e)=>{ avatarPreview.textContent=e.target.value?e.target.value[0].toUpperCase():'A'; });
document.getElementById('addBtn').onclick=()=>{ const name=document.getElementById('playerName').value.trim(); const score=Number(document.getElementById('playerScore').value)||0; addOrUpdatePlayer(name,score); document.getElementById('playerScore').value=''; };
document.getElementById('searchName').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  const rows = document.querySelectorAll("#leaderboardTable tbody tr");
  rows.forEach(row => {
    const playerName = row.querySelector(".player-name")?.textContent.toLowerCase();
    if (!q || playerName.includes(q)) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
});
document.getElementById('incBtn').onclick=()=>{ const name=document.getElementById('playerName').value.trim(); if(!name) return alert('Enter name'); changeScoreBy(name,5); };
document.getElementById('decBtn').onclick=()=>{ const name=document.getElementById('playerName').value.trim(); if(!name) return alert('Enter name'); changeScoreBy(name,-5); };
document.getElementById('resetBtn').onclick=()=>{ if(!confirm('Clear leaderboard?')) return; players.clear(); playerHistory.clear(); avl.root=null; updateUI(); toast('Cleared'); };
document.getElementById('showTopK').onclick=()=>{ const k=Number(document.getElementById('topK').value)||5; renderTopK(k); toast(`Top ${k} shown`); };
document.getElementById('saveBtn').onclick=saveToLocal;
document.getElementById('loadBtn').onclick=loadFromLocal;
document.getElementById('exportBtn').onclick = exportJSON;
document.getElementById('importBtn').onclick = importJSON;

/* ---------------------------
  Next Round simulation
--------------------------- */
document.getElementById('nextRoundBtn').onclick = () => {
  const names = [...players.keys()];
  if (names.length === 0) return;

  // Capture old ranks once before updating
  const oldRanks = getAllRanks();

  // Temporarily disable auto UI updates
  const changes = [];
  names.forEach(n => {
    const delta = Math.floor(Math.random() * 21) - 10; // -10 .. +10
    const obj = players.get(n);
    if (!obj) return;
    const newScore = obj.score + delta;
    avl.delete(obj.score, n);
    obj.score = newScore;
    obj.history.push(newScore);
    avl.insert(newScore, n);
    changes.push({ name: n, delta });
  });

  // Re-render UI once after all changes
  updateUI(null, oldRanks);

  toast('Next round simulated');
};

/* ---------------------------
  Seed demo data
--------------------------- */
function seedData(){
    const seed=[['Kiran',120],['Nithesh',75],['Abbas',95],['Raghavan',130],['dhena',60],['zahaak',88],['Umair',99]];
  seed.forEach(([n,s])=>{ players.set(n,{score:s,history:[s]}); playerHistory.set(n,[s]); avl.insert(s,n); });
  updateUI();
}
seedData();




