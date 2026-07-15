const STORAGE_KEY = "vinyl-queue-v1";
let queue = [];
let currentIndex = -1;
let isPlaying = false;
let repeatMode = 0;
let isShuffled = false;
let shuffleOrder = [];

const audio = document.getElementById("audioPlayer");

const el = id => document.getElementById(id);

const playBtn = el("playBtn");
const seekBar = el("seekBar");
const volBar = el("volBar");

/* ================= Storage ================= */

function saveQueue(){
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
            queue,
            currentIndex,
            repeatMode,
            isShuffled
        })
    );
}

function loadQueue(){

    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if(!data)return;

    queue=data.queue||[];
    currentIndex=data.currentIndex??-1;
    repeatMode=data.repeatMode||0;
    isShuffled=data.isShuffled||false;

}

/* ================= Add Track ================= */

el("addForm").addEventListener(
"submit",
async e=>{

e.preventDefault();

const input=el("urlInput");
const url=input.value.trim();

if(!url)return;

try{
el("addBtn").disabled=true;

const res=
await fetch(
"http://localhost:3000/api/play",
{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:
JSON.stringify({url})
}
);

const data= await res.json();

if(!res.ok) throw new Error(data.error);

queue.push({
title:data.title,
stream:data.stream,
thumb:"",
url
});

input.value="";
renderQueue();
saveQueue();

if(currentIndex===-1)
playAt(0);
}
catch(err){
alert(err.message);
}
finally{
el("addBtn").disabled=false;
}
});

/* ================= Queue ================= */

function renderQueue(){

const list=el("queueList");
list.innerHTML="";
queue.forEach((track,i)=>{
const li=document.createElement("li");


li.className= "track "+ (i===currentIndex?"active":"");

li.innerHTML=`
<div class="meta">
<div class="t-title">
${track.title}
</div>
</div>
<button data-remove="${i}">
✕
</button>
`;

li.onclick=()=>playAt(i);
li.querySelector("[data-remove]").onclick=(e)=>{
e.stopPropagation();
removeAt(i);
};
list.appendChild(li);
});


el("queueCount").textContent = `Queue · ${queue.length}`;

el("emptyState").style.display = queue.length?"none":"block";

el("queueWrap").style.display = queue.length?"block":"none";
}

function removeAt(i){
queue.splice(i,1);

if(currentIndex===i){
audio.pause();
currentIndex=-1;
}

renderQueue();
saveQueue();
}

el("clearBtn").onclick=()=>{

queue=[];
currentIndex=-1;
audio.pause();
renderQueue();
saveQueue();
};

/* ================= Playback ================= */

function playAt(index){

const track=queue[index];
if(!track)return;
currentIndex=index;
audio.src=track.stream;
audio.play();
updateNowPlaying();
renderQueue();
saveQueue();
}

function updateNowPlaying(){

const track=queue[currentIndex];

if(!track){
el("npTitle").textContent = "Nothing playing";
return;
}

el("npTitle").textContent = track.title;

el("npSub").textContent = "YouTube Audio";
}

audio.onplay=()=>{
isPlaying=true;
playBtn.textContent="⏸";
};

audio.onpause=()=>{
isPlaying=false;
playBtn.textContent="▶";
};

audio.onended=()=>{
if(repeatMode===2){
playAt(currentIndex);
return;
}

next();
};

/* ================= Controls ================= */

playBtn.onclick=()=>{

if(currentIndex===-1){
playAt(0);
return;
}

if(audio.paused)
audio.play();

else
audio.pause();
};

el("nextBtn").onclick = next;
el("prevBtn").onclick = prev;

function prev(){
if(queue.length===0) return;
 
if(audio.currentTime>3){
audio.currentTime=0;
return;
}
 
let i;
 
if(isShuffled){
i=Math.floor(Math.random()*queue.length);
}
else{
i=currentIndex-1;
if(i<0){
if(repeatMode===1)
i=queue.length-1;
else
return;
}
}
playAt(i);
}

function next(){
if(queue.length===0) return;

let i;

if(isShuffled){
i=Math.floor(Math.random()*queue.length);
}

else{
i=currentIndex+1;
if(i>=queue.length){
if(repeatMode===1)
i=0;
else
return;
}
}

playAt(i);
}

/* ================= Progress ================= */

audio.ontimeupdate=()=>{

seekBar.max = audio.duration||0;

seekBar.value = audio.currentTime;

el("curTime").textContent = time(audio.currentTime);

el("durTime").textContent = time(audio.duration);
};

seekBar.oninput=()=>{
audio.currentTime = seekBar.value;
};

function time(s){

if(!s||!isFinite(s))
return "0:00";

return Math.floor(s/60)+":" + Math.floor(s%60).toString().padStart(2,"0");
}

/* ================= Volume ================= */

volBar.oninput=()=>{
audio.volume = volBar.value/100;
};

el("speedSelect").onchange=e=>{

audio.playbackRate = Number(e.target.value);
};

el("muteBtn").onclick=()=>{

audio.muted = !audio.muted;
};

/* ================= Buttons ================= */

el("shuffleBtn").onclick=()=>{
isShuffled=!isShuffled; };

el("repeatBtn").onclick=()=>{
repeatMode++;
if(repeatMode>2)
repeatMode=0;
};

/* ================= Init ================= */

function init(){
loadQueue();
renderQueue();
updateNowPlaying();
audio.volume=.8;
}

init();