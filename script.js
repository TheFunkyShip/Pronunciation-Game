// Pronunciation Game - main logic
if(hearBtn.disabled) return;
hearBtn.disabled = true; // prevent re-entry during playback
const seq = [];


const titleAPath = `${paths.audio}/title_a.mp3`;
const titleBPath = `${paths.audio}/title_b.mp3`;


// helper to push an item {type:'title'|'tile', el, path}
const pushTwice = (obj)=>{ seq.push({...obj}); seq.push({...obj}); };


// Column A
pushTwice({ type:'title', el: colAHeader, path: titleAPath });
// get order top->bottom for column A
const colAZones = dropzones.filter(z=>z.dataset.col==='A');
for(const z of colAZones){
const tile = z.firstElementChild;
if(tile){
const text = tile.textContent;
const path = mapWordToAudio.get(text);
if(path) pushTwice({ type:'tile', el: tile, path });
}
}
// Column B
pushTwice({ type:'title', el: colBHeader, path: titleBPath });
const colBZones = dropzones.filter(z=>z.dataset.col==='B');
for(const z of colBZones){
const tile = z.firstElementChild;
if(tile){
const text = tile.textContent;
const path = mapWordToAudio.get(text);
if(path) pushTwice({ type:'tile', el: tile, path });
}
}


// Sequential playback
for(const item of seq){
await playOne(item);
}


hearBtn.disabled = false;
});


function playOne({type, el, path}){
return new Promise(resolve=>{
const audio = new Audio(path);
el.classList.add('speaking');
audio.play();
audio.onended = ()=>{ el.classList.remove('speaking'); resolve(); };
audio.onerror = ()=>{ el.classList.remove('speaking'); resolve(); };
});
}


function updateSubmitState(){
// enable submit only when all 10 tiles are placed somewhere in the table
const placed = dropzones.reduce((acc,z)=> acc + (z.firstElementChild ? 1 : 0), 0);
submitBtn.disabled = (placed !== 10) || submitted;
}


}


// Kick off
load().catch(err=>{
console.error(err);
alert('Could not load the dataset. Please check your CSV/audio paths and try again.');
});
})();