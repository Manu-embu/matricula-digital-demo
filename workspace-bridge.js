
(function(){
  const pending=new Map();
  let seq=0;

  function backendUrl(){
    const url=String(window.WORKSPACE_BACKEND_URL||'').trim();
    if(!url || url.includes('COLE_AQUI')) throw new Error('Configure WORKSPACE_BACKEND_URL em backend-config.js');
    return url;
  }

  function ensureFrame(){
    let frame=document.getElementById('workspaceBridgeFrame');
    if(frame) return frame;
    frame=document.createElement('iframe');
    frame.id='workspaceBridgeFrame';
    frame.name='workspaceBridgeFrame';
    frame.style.display='none';
    document.body.appendChild(frame);
    return frame;
  }

  function createBridgeForm(requestId){
    ensureFrame();
    const form=document.createElement('form');
    form.method='POST';
    form.action=backendUrl();
    form.target='workspaceBridgeFrame';
    form.style.display='none';

    function hidden(name,value){
      const input=document.createElement('input');
      input.type='hidden'; input.name=name; input.value=value??'';
      form.appendChild(input);
    }
    hidden('requestId',requestId);
    hidden('returnOrigin',window.location.origin);

    document.body.appendChild(form);
    return {form,hidden};
  }

  function wait(requestId,timeoutMs=90000){
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        pending.delete(requestId);
        reject(new Error('Tempo excedido ao comunicar com o Google Workspace.'));
      },timeoutMs);
      pending.set(requestId,{resolve,reject,timer});
    });
  }

  window.addEventListener('message',ev=>{
    const data=ev.data;
    if(!data || data.source!=='sme-inscricao-backend' || !data.requestId) return;
    const p=pending.get(data.requestId);
    if(!p) return;
    clearTimeout(p.timer);
    pending.delete(data.requestId);

    const payload=data.payload ?? data;
    if(data.ok===false || payload?.ok===false) {
      p.reject(new Error(data.message || payload?.message || 'Erro no backend.'));
    } else {
      p.resolve(payload);
    }
  });

  function fileToPayload(file){
    return new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>{
        const result=String(reader.result||'');
        const comma=result.indexOf(',');
        resolve({
          name:file.name,
          type:file.type || 'application/octet-stream',
          size:file.size,
          base64: comma>=0 ? result.slice(comma+1) : result
        });
      };
      reader.onerror=()=>reject(new Error('Não foi possível ler o arquivo '+file.name));
      reader.readAsDataURL(file);
    });
  }

  async function formToPayload(sourceForm){
    const payload={};
    const files={};

    const elements=[...sourceForm.elements];
    for(const el of elements){
      if(!el.name || el.disabled) continue;

      if(el.type==='file'){
        const selected=[...(el.files||[])];
        if(selected.length){
          files[el.name]=await Promise.all(selected.map(fileToPayload));
        }
        continue;
      }

      if((el.type==='checkbox' || el.type==='radio') && !el.checked) continue;

      if(payload[el.name]===undefined) payload[el.name]=el.value;
      else if(Array.isArray(payload[el.name])) payload[el.name].push(el.value);
      else payload[el.name]=[payload[el.name],el.value];
    }

    payload.__files=files;
    return payload;
  }

  function postPayload(payload,timeoutMs=60000){
    const requestId='REQ-'+Date.now()+'-'+(++seq);
    const {form,hidden}=createBridgeForm(requestId);
    hidden('payloadJson',JSON.stringify(payload));
    const promise=wait(requestId,timeoutMs);
    form.submit();
    setTimeout(()=>form.remove(),1500);
    return promise;
  }

  window.WorkspaceBridge={
    request(params){
      return postPayload(params||{},90000);
    },

    async submitForm(sourceForm){
      const payload=await formToPayload(sourceForm);
      return postPayload(payload,180000);
    }
  };
})();
