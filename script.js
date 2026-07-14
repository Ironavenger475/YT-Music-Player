/* ================= State ================= */
const STORAGE_KEY = 'vinyl-queue-v1';
let queue = [];
let currentIndex = -1;
let isShuffled = false;
let shuffleOrder = [];
let repeatMode = 0;      // 0 off, 1 all, 2 one
let player = null;
let playerReady = false;
let isPlaying = false;
let progressTimer = null;
let draggedIndex = null;
let pendingPlayIndex = null;

const el = (id) => document.getElementById(id);
const statusMsg = el('statusMsg');
const queueList = el('queueList');
const queueWrap = el('queueWrap');
const emptyState = el('emptyState');
const queueCount = el('queueCount');
const playBtn = el('playBtn');

playBtn.disabled = true;

/* ================= Persistence ================= */
function saveQueue(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({queue, currentIndex, repeatMode, isShuffled}));
  }catch(e){ console.log("Error: Storage not available")}
}
function loadQueue(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return;
    const data = JSON.parse(raw);
    queue = data.queue || [];
    currentIndex = typeof data.currentIndex === 'number' ? data.currentIndex : -1;
    repeatMode = data.repeatMode || 0;
    isShuffled = !!data.isShuffled;
  }catch(e){ queue = []; }
}

/* ================= URL parsing ================= */
function sanitizeUrl(raw){
  // const newurl = raw.replace(".com",".ttools.io");
  const trimmed = raw.trim();
  const ampIndex = trimmed.indexOf('&');
  return ampIndex === -1 ? trimmed : trimmed.slice(0, ampIndex);
}

function extractVideoId(rawUrl){
  const url = sanitizeUrl(rawUrl);
  try{
    const u = new URL(url.trim());
    if(u.hostname.includes('youtu.be')){
      return u.pathname.slice(1).split('/')[0] || null;
    }
    if(u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')){
      if(u.pathname === '/watch') return u.searchParams.get('v');
      if(u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2];
      if(u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
      if(u.pathname.startsWith('/live/')) return u.pathname.split('/')[2];
    }
  }catch(e){ console.log("Not a Valid URL")}
  const bare = url.trim();
  if(/^[a-zA-Z0-9_-]{11}$/.test(bare)) return bare;
  return null;
}

async function fetchMeta(videoId){
  const fallback = { title: `Video ${videoId}`, author: 'Unknown' };
  try{
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + videoId)}&format=json`);
    if(!res.ok) return fallback;
    const data = await res.json();
    return { title: data.title || fallback.title, author: data.author_name || fallback.author };
  }catch(e){
    return fallback;
  }
}

/* ================= Status helper ================= */
let statusTimer = null;
function showStatus(text, type){
  statusMsg.textContent = text;
  statusMsg.className = type || '';
  clearTimeout(statusTimer);
  if(text) statusTimer = setTimeout(()=>{ statusMsg.textContent=''; statusMsg.className=''; }, 3500);
}

/* ================= Adding tracks ================= */
const addForm = el('addForm');
const urlInput = el('urlInput');
const addBtn = el('addBtn');

addForm.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const raw = urlInput.value;
  if(!raw.trim()) return;
  const id = extractVideoId(raw);
  if(!id){
    showStatus('Could not find a video in that link. Try a standard youtube.com/watch or youtu.be URL.', 'err');
    return;
  }
  addBtn.disabled = true;
  showStatus('Fetching track info…');
  const meta = await fetchMeta(id);
  const track = {
    id,
    title: meta.title,
    author: meta.author,
    thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`
  };
  queue.push(track);
  urlInput.value = '';
  addBtn.disabled = false;
  showStatus(`Added "${track.title}" to the queue.`, 'ok');
  renderQueue();
  saveQueue();
  if(currentIndex === -1){
    playAt(0);
  }
});

/* ================= Rendering ================= */
function renderQueue(){
  if(queue.length === 0){
    emptyState.style.display = 'block';
    queueWrap.style.display = 'none';
    queueCount.textContent = 'Queue · 0';
    return;
  }
  emptyState.style.display = 'none';
  queueWrap.style.display = 'block';
  queueWrap.style.backgroundColor = 'rgba(29,185,84,0.25)'
  queueWrap.style.padding = '10px'
  queueWrap.style.borderRadius = '12px'
  queueCount.textContent = `Queue · ${queue.length}`;

  queueList.innerHTML = '';
  queue.forEach((track, i) => {
    const li = document.createElement('li');
    li.className = 'track' + (i === currentIndex ? ' active' : '');
    li.draggable = true;
    li.dataset.index = i;

    li.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="idx">${i === currentIndex && isPlaying ? '♪' : i + 1}</span>
      <img class="thumb" src="${track.thumb}" alt="" loading="lazy">
      <div class="meta">
        <div class="t-title">${escapeHtml(track.title)}</div>
        <div class="t-sub">${escapeHtml(track.author)}</div>
      </div>
      <div class="t-actions">
        <button class="icon-btn danger" data-remove="${i}" title="Remove">✕</button>
      </div>
    `;

    li.addEventListener('click', (e)=>{
      if(e.target.closest('[data-remove]')) return;
      playAt(i);
    });

    li.addEventListener('dragstart', ()=>{ draggedIndex = i; li.classList.add('dragging'); });
    li.addEventListener('dragend', ()=>{ li.classList.remove('dragging'); renderQueue(); });
    li.addEventListener('dragover', (e)=>{ e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', ()=> li.classList.remove('drag-over'));
    li.addEventListener('drop', (e)=>{
      e.preventDefault();
      li.classList.remove('drag-over');
      if(draggedIndex === null || draggedIndex === i) return;
      reorderQueue(draggedIndex, i);
    });

    queueList.appendChild(li);
  });

  queueList.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      removeAt(parseInt(btn.dataset.remove, 10));
    });
  });
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function reorderQueue(from, to){
  const wasCurrent = from === currentIndex;
  const [item] = queue.splice(from, 1);
  queue.splice(to, 0, item);

  if(wasCurrent){
    currentIndex = to;
  } else if(from < currentIndex && to >= currentIndex){
    currentIndex--;
  } else if(from > currentIndex && to <= currentIndex){
    currentIndex++;
  }
  renderQueue();
  saveQueue();
}

function removeAt(i){
  const wasCurrent = i === currentIndex;
  queue.splice(i, 1);
  if(queue.length === 0){
    currentIndex = -1;
    stopPlayback();
  } else if(wasCurrent){
    currentIndex = Math.min(i, queue.length - 1);
    playAt(currentIndex);
  } else if(i < currentIndex){
    currentIndex--;
  }
  renderQueue();
  saveQueue();
}

el('clearBtn').addEventListener('click', ()=>{
  if(!confirm('Clear the entire queue?')) return;
  queue = [];
  currentIndex = -1;
  stopPlayback();
  renderQueue();
  saveQueue();
});

/* ================= YouTube Player ================= */
function loadYT(){
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  tag.onerror = ()=> showStatus('Could not reach YouTube. Check your connection and reload.', 'err');
  document.head.appendChild(tag);
}

window.onYouTubeIframeAPIReady = function(){
  player = new YT.Player('ytPlayer', {
    height: '1', width: '1',
    playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
    events: {
      onReady: ()=>{
        playerReady = true;
        playBtn.disabled = false;
        player.setVolume(parseInt(el('volBar').value, 10));

        if(pendingPlayIndex !== null){
          const idx = pendingPlayIndex;
          pendingPlayIndex = null;
          playAt(idx);
        } else if(queue.length && currentIndex >= 0){
          cueOnly(currentIndex); // restore last session without auto-playing
        }
      },
      onStateChange: onPlayerStateChange,
      onError: (e)=>{
        const messages = {2:'Invalid video.', 5:'Playback error.', 100:'Video not found or removed.', 101:'Owner disabled embedding for this video.', 150:'Owner disabled embedding for this video.'};
        showStatus(messages[e.data] || 'Something went wrong playing that track.', 'err');
        goNext(true);
      }
    }
  });
};

function onPlayerStateChange(e){
  if(e.data === YT.PlayerState.PLAYING){
    isPlaying = true;
    document.body.classList.add('app-playing');
    playBtn.textContent = '⏸';
    startProgressTimer();
    updateDurationSoon();
  } else if(e.data === YT.PlayerState.PAUSED){
    isPlaying = false;
    document.body.classList.remove('app-playing');
    playBtn.textContent = '▶';
    stopProgressTimer();
  } else if(e.data === YT.PlayerState.ENDED){
    handleTrackEnd();
  }
  renderQueue();
}

function handleTrackEnd(){
  if(repeatMode === 2){ 
    playAt(currentIndex);
    return;
  }
  goNext(true);
}

function cueOnly(index){
  if(!playerReady || !queue[index]) return;
  player.cueVideoById(queue[index].id);
}

function playAt(index){
  if(!queue[index]) return;

  if(!playerReady){
    pendingPlayIndex = index;
    currentIndex = index;
    updateNowPlaying();
    renderQueue();
    saveQueue();
    showStatus('Loading player…');
    return;
  }

  currentIndex = index;
  updateNowPlaying();
  player.loadVideoById(queue[index].id);
  player.setPlaybackRate(parseFloat(el('speedSelect').value));
  renderQueue();
  saveQueue();
}

function stopPlayback(){
  if(player && playerReady){ player.stopVideo(); }
  isPlaying = false;
  document.body.classList.remove('app-playing');
  playBtn.textContent = '▶';
  updateNowPlaying();
}

function updateNowPlaying(){
  const track = queue[currentIndex];
  if(!track){
    el('npTitle').textContent = 'Nothing playing';
    el('npSub').textContent = 'Add a track to begin';
    el('npThumb').style.display = 'none';
    return;
  }
  el('npTitle').textContent = track.title;
  el('npSub').textContent = track.author;
  el('npThumb').src = track.thumb;
  el('npThumb').style.display = 'block';
}

/* ---------- transport ---------- */
playBtn.addEventListener('click', ()=>{
  if(!playerReady){
    showStatus('Player is still loading — try again in a second.', 'err');
    return;
  }
  if(currentIndex === -1 && queue.length){ playAt(0); return; }
  if(currentIndex === -1) return;
  if(isPlaying){ player.pauseVideo(); } else { player.playVideo(); }
});

el('prevBtn').addEventListener('click', goPrev);
el('nextBtn').addEventListener('click', ()=> goNext(false));

function getOrder(){
  if(!isShuffled) return queue.map((_, i)=>i);
  return shuffleOrder;
}
function rebuildShuffle(){
  const idxs = queue.map((_, i)=>i).filter(i=> i!== currentIndex);
  for(let i = idxs.length - 1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  shuffleOrder = currentIndex >= 0 ? [currentIndex, ...idxs] : idxs;
}

function goNext(){
  if(queue.length === 0) return;
  const order = getOrder();
  const posInOrder = order.indexOf(currentIndex);
  let nextPos = posInOrder + 1;
  if(nextPos >= order.length){
    if(repeatMode === 1){ // repeat all
      nextPos = 0;
      if(isShuffled) rebuildShuffle();
    } else {
      stopPlayback();
      return;
    }
  }
  playAt(order[nextPos]);
}

function goPrev(){
  if(queue.length === 0) return;
  if(player && playerReady && player.getCurrentTime && player.getCurrentTime() > 3){
    player.seekTo(0, true);
    return;
  }
  const order = getOrder();
  const posInOrder = order.indexOf(currentIndex);
  let prevPos = posInOrder - 1;
  if(prevPos < 0) prevPos = repeatMode === 1 ? order.length - 1 : 0;
  playAt(order[prevPos]);
}

el('shuffleBtn').addEventListener('click', ()=>{
  isShuffled = !isShuffled;
  el('shuffleBtn').classList.toggle('toggle-on', isShuffled);
  if(isShuffled) rebuildShuffle();
  showStatus(isShuffled ? 'Shuffle on' : 'Shuffle off', 'ok');
  saveQueue();
});

const repeatIcons = ['↪️', '🔁', '🔂'];
el('repeatBtn').addEventListener('click', ()=>{
  repeatMode = (repeatMode + 1) % 3;
  el('repeatBtn').textContent = repeatIcons[repeatMode];
  el('repeatBtn').classList.toggle('toggle-on', repeatMode !== 0);
  const labels = ['Repeat off', 'Repeat all', 'Repeat one'];
  showStatus(labels[repeatMode], 'ok');
  saveQueue();
});

/* ---------- seek / progress ---------- */
const seekBar = el('seekBar');
let userSeeking = false;

function startProgressTimer(){
  stopProgressTimer();
  progressTimer = setInterval(()=>{
    if(!playerReady || userSeeking) return;
    const cur = player.getCurrentTime ? player.getCurrentTime() : 0;
    const dur = player.getDuration ? player.getDuration() : 0;
    if(dur > 0){
      seekBar.max = dur;
      seekBar.value = cur;
      el('curTime').textContent = fmtTime(cur);
      el('durTime').textContent = fmtTime(dur);
    }
  }, 500);
}
function stopProgressTimer(){ clearInterval(progressTimer); }
function updateDurationSoon(){
  setTimeout(()=>{
    if(!playerReady) return;
    const dur = player.getDuration ? player.getDuration() : 0;
    if(dur > 0){ seekBar.max = dur; el('durTime').textContent = fmtTime(dur); }
  }, 600);
}
function fmtTime(sec){
  if(!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec/60);
  const s = Math.floor(sec%60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

seekBar.addEventListener('input', ()=>{ userSeeking = true; el('curTime').textContent = fmtTime(seekBar.value); });
seekBar.addEventListener('change', ()=>{
  if(playerReady) player.seekTo(parseFloat(seekBar.value), true);
  userSeeking = false;
});

document.querySelectorAll('[data-jump]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(!playerReady) return;
    const delta = parseInt(btn.dataset.jump, 10);
    const cur = player.getCurrentTime();
    const dur = player.getDuration();
    player.seekTo(Math.max(0, Math.min(dur, cur + delta)), true);
  });
});

/* ---------- speed / volume ---------- */
el('speedSelect').addEventListener('change', (e)=>{
  if(playerReady) player.setPlaybackRate(parseFloat(e.target.value));
});

const volBar = el('volBar');
const muteBtn = el('muteBtn');
let lastVolume = 80;
volBar.addEventListener('input', ()=>{
  const v = parseInt(volBar.value, 10);
  if(playerReady) player.setVolume(v);
  muteBtn.textContent = v === 0 ? '🔇' : (v < 50 ? '🔉' : '🔊');
});
muteBtn.addEventListener('click', ()=>{
  if(!playerReady) return;
  if(player.isMuted()){
    player.unMute();
    volBar.value = lastVolume;
    player.setVolume(lastVolume);
    muteBtn.textContent = '🔊';
  } else {
    lastVolume = parseInt(volBar.value, 10) || lastVolume;
    player.mute();
    volBar.value = 0;
    muteBtn.textContent = '🔇';
  }
});

/* ---------- keyboard shortcuts ---------- */
document.addEventListener('keydown', (e)=>{
  if(e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if(!playerReady) return;

  switch(e.code){
    case 'Space':
      e.preventDefault();
      playBtn.click();
      break;
    case 'ArrowRight': {
      e.preventDefault();
      const d = e.shiftKey ? 30 : 10;
      const cur = player.getCurrentTime(); const dur = player.getDuration();
      player.seekTo(Math.min(dur, cur + d), true);
      break;
    }
    case 'ArrowLeft': {
      e.preventDefault();
      const d = e.shiftKey ? 30 : 10;
      const cur = player.getCurrentTime();
      player.seekTo(Math.max(0, cur - d), true);
      break;
    }
    case 'ArrowUp': {
      e.preventDefault();
      volBar.value = Math.min(100, parseInt(volBar.value,10) + 5);
      volBar.dispatchEvent(new Event('input'));
      break;
    }
    case 'ArrowDown': {
      e.preventDefault();
      volBar.value = Math.max(0, parseInt(volBar.value,10) - 5);
      volBar.dispatchEvent(new Event('input'));
      break;
    }
    case 'KeyN': goNext(); break;
    case 'KeyP': goPrev(); break;
    case 'KeyS': el('shuffleBtn').click(); break;
    case 'KeyR': el('repeatBtn').click(); break;
  }
});

/* ================= Init ================= */
function init(){
  loadQueue();
  renderQueue();
  updateNowPlaying();
  el('shuffleBtn').classList.toggle('toggle-on', isShuffled);
  el('repeatBtn').textContent = repeatIcons[repeatMode];
  el('repeatBtn').classList.toggle('toggle-on', repeatMode !== 0);
  loadYT();
}
init();
