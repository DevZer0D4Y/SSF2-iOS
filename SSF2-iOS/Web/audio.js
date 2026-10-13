// Ruffle's public resume() starts the game loop, but does not unlock Web Audio.
// Capture its output contexts before Ruffle loads and resume them inside real user gestures.
(() => {
  'use strict';
  const contexts=new Set(),resuming=new WeakSet();
  function unlock(){
    if([...contexts].some(c=>c.state!=='running'&&c.state!=='closed'&&!resuming.has(c)))window.webkit?.messageHandlers?.audioSession?.postMessage('activate');
    try{if(navigator.audioSession&&navigator.audioSession.type!=='playback')navigator.audioSession.type='playback';}catch{}
    const tasks=[];
    for(const context of contexts){
      if(context.state==='closed'){contexts.delete(context);continue;}
      if(context.state==='running'||resuming.has(context))continue;
      resuming.add(context);
      try{tasks.push(Promise.resolve(context.resume()).catch(()=>{}).finally(()=>resuming.delete(context)));}
      catch{resuming.delete(context);}
    }
    return Promise.all(tasks);
  }
  for(const name of ['AudioContext','webkitAudioContext']){
    const Original=window[name];if(!Original)continue;
    window[name]=new Proxy(Original,{construct(target,args,newTarget){
      const context=Reflect.construct(target,args,newTarget);contexts.add(context);
      context.addEventListener('statechange',()=>{if(context.state==='closed')contexts.delete(context);});
      if(navigator.userActivation?.isActive)void unlock();
      return context;
    }});
  }
  document.addEventListener('pointerdown',unlock,true);
  document.addEventListener('keydown',unlock,true);
  window.SSF2Audio={unlock};
})();
