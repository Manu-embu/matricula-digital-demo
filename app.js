const views = [...document.querySelectorAll('.view')];
const steps = [...document.querySelectorAll('.step')];
let currentStep = 1;
let currentService = 'Educação Infantil';
let currentStageCode = null;
let unidadesSME = [];
let residencePoint = null;
let geocodedAddress = '';


async function loadSchoolData(){
  const el=document.getElementById('schoolDataStatus');

  // 1) Prefer the embedded/local JS base. This works even when index.html
  // is opened directly with file:// and avoids browser fetch restrictions.
  if(window.UNIDADES_SME_DATA && Array.isArray(window.UNIDADES_SME_DATA.unidades)){
    unidadesSME=window.UNIDADES_SME_DATA.unidades;
    if(el) el.textContent=`${unidadesSME.length} unidades no cadastro mestre • base carregada`;
    updatePeriodOptions();
    return;
  }

  // 2) Fallback for hosted/server environments.
  try{
    const res=await fetch('dados/unidades.json');
    if(!res.ok) throw new Error('Falha ao carregar base');
    const data=await res.json();
    unidadesSME=data.unidades || [];
    if(el) el.textContent=`${unidadesSME.length} unidades no cadastro mestre • base carregada`;
    updatePeriodOptions();
  }catch(err){
    if(el) el.textContent='Base de unidades não carregada';
    console.warn(err);
  }
}

function haversineKm(a,b){
  const R=6371, rad=x=>x*Math.PI/180;
  const dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon);
  const q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(q));
}
function stageLabel(code){return ({BERCARIO:'Berçário',FASE_I:'Fase I',FASE_II:'Fase II',FASE_III:'Fase III',FASE_IV:'Fase IV',FASE_V:'Fase V','1_ANO':'1º ano','2_ANO':'2º ano','3_ANO':'3º ano','4_ANO':'4º ano','5_ANO':'5º ano',EJA:'EJA'})[code]||code||'Etapa não definida'}
function renderCompatibleSchools(){
  const box=document.getElementById('schools');
  if(!box) return;
  updatePeriodOptions();

  if(!currentStageCode){
    box.innerHTML='<div class="empty-state">Não foi possível determinar a etapa/modalidade. Volte e confira a data de nascimento.</div>';
    return;
  }

  if(!unidadesSME.length){
    box.innerHTML='<div class="empty-state"><strong>Base de unidades não carregada.</strong><br>Recarregue a página.</div>';
    return;
  }

  const allOffers=unidadesSME.map(u=>{
    const offer=(u.ofertas||[]).find(o=>o.etapa===currentStageCode);
    if(!offer) return null;
    const hasCoords=Number.isFinite(Number(u.latitude)) && Number.isFinite(Number(u.longitude));
    const dist=(hasCoords && residencePoint)
      ? haversineKm(residencePoint,{lat:Number(u.latitude),lon:Number(u.longitude)})
      : null;
    return {u,offer,hasCoords,dist};
  }).filter(Boolean);

  if(!allOffers.length){
    box.innerHTML=`<div class="empty-state"><strong>Nenhuma oferta encontrada para ${stageLabel(currentStageCode)}.</strong></div>`;
    return;
  }

  if(!residencePoint){
    box.innerHTML=`<div class="result-box"><strong>${allOffers.length} unidade(s) possuem oferta de ${stageLabel(currentStageCode)}</strong><br>
    Para identificar as unidades dentro de 2 km, volte à etapa de endereço e clique em <strong>Localizar endereço</strong>.</div>`;
    return;
  }

  const list=allOffers
    .filter(x=>x.hasCoords && x.dist<=2)
    .sort((a,b)=>a.dist-b.dist);

  if(!list.length){
    const nearest=allOffers
      .filter(x=>x.hasCoords && x.dist!==null)
      .sort((a,b)=>a.dist-b.dist)[0];

    const nearText=nearest
      ? `A unidade compatível mais próxima encontrada foi <strong>${nearest.u.nome_exibicao}</strong>, a aproximadamente ${nearest.dist.toFixed(2).replace('.',',')} km em linha reta.`
      : 'Não há unidades compatíveis com coordenadas disponíveis para comparação.';

    box.innerHTML=`<div class="empty-state"><strong>Nenhuma unidade compatível foi encontrada em até 2 km.</strong><br>${nearText}<br><br>
    A inscrição poderá continuar e ficará sinalizada para <strong>análise de encaminhamento pela SME</strong>.</div>`;
    return;
  }
  const intro=`<div class="result-box"><strong>${list.length} unidade(s) compatível(is) encontrada(s) em até 2 km</strong><br>
  Ordenadas da mais próxima para a mais distante.
  <br><small>Protótipo: distância geográfica em linha reta. Produção: rota a pé.</small></div>`;

  box.innerHTML=intro+list.map(({u,offer,dist},idx)=>{
    const periods=Object.keys(offer.periodos||{});
    const cap=offer.capacidade_referencia_2026||0;
    return `<label class="school-option">
      <input type="radio" name="escola" value="${u.nome_exibicao}">
      <span>
        <strong>${u.nome_exibicao}${idx===0?'<span class="nearest-badge">Mais próxima</span>':''}</strong>
        <small>${u.bairro?u.bairro+' • ':''}${dist.toFixed(2).replace('.',',')} km</small>
        <span class="school-meta">
          <span class="chip">Períodos ofertados:</span>
          ${periods.map(p=>`<span class="chip">${p}</span>`).join('')}
          <span class="chip">${u.tipo==='conveniada'?'Conveniada':'Direta'}</span>
        </span>
        <small class="capacity-note">Capacidade de referência 2026 para ${stageLabel(currentStageCode)}: ${cap} estudante(s)</small>
      </span>
    </label>`;
  }).join('');
}

function updatePeriodOptions(){
  // v0.4.2: o período não é escolhido pela família.
}

function showView(id){
  views.forEach(v => v.classList.toggle('active', v.id === id));
  window.scrollTo({top:0, behavior:'smooth'});
}
function updateProgress(){
  steps.forEach(s => s.classList.toggle('active', Number(s.dataset.step) === currentStep));
  const pct = Math.round((currentStep/steps.length)*100);
  document.getElementById('stepLabel').textContent = `Etapa ${currentStep} de ${steps.length}`;
  document.getElementById('progressText').textContent = `${pct}%`;
  document.getElementById('progressBar').style.width = `${pct}%`;
  document.getElementById('btnPrev').style.visibility = currentStep === 1 ? 'hidden' : 'visible';
  document.getElementById('btnNext').textContent = currentStep === steps.length ? 'Finalizar inscrição' : 'Continuar';
  if(currentStep === 5) renderCompatibleSchools();
  if(currentStep === 6) buildReview();
}
function onlyDigits(v){return v.replace(/\D/g,'')}
function maskCPF(el){
  let v=onlyDigits(el.value).slice(0,11);
  v=v.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
  el.value=v;
}
function maskPhone(el){
  let v=onlyDigits(el.value).slice(0,11);
  if(v.length>10) v=v.replace(/(\d{2})(\d{5})(\d{4})/,'($1) $2-$3');
  else v=v.replace(/(\d{2})(\d{4})(\d{0,4})/,'($1) $2-$3');
  el.value=v;
}
function maskCEP(el){
  let v=onlyDigits(el.value).slice(0,8);
  el.value=v.replace(/(\d{5})(\d{0,3})/,'$1-$2');
}
function maskDate(el){
  let v=onlyDigits(el.value).slice(0,8);
  if(v.length>=5) v=v.replace(/(\d{2})(\d{2})(\d{1,4})/,'$1/$2/$3');
  else if(v.length>=3) v=v.replace(/(\d{2})(\d{1,2})/,'$1/$2');
  el.value=v;
}
function parseBRDate(value){
  const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if(!m) return null;
  const day=Number(m[1]), month=Number(m[2]), year=Number(m[3]);
  const d=new Date(year, month-1, day, 12, 0, 0);
  if(d.getFullYear()!==year || d.getMonth()!==month-1 || d.getDate()!==day) return null;
  return d;
}
document.getElementById('cpfResponsavel').addEventListener('input', e=>maskCPF(e.target));
document.getElementById('cpfEstudante').addEventListener('input', e=>maskCPF(e.target));
document.getElementById('telefone').addEventListener('input', e=>maskPhone(e.target));
document.getElementById('cep').addEventListener('input', e=>maskCEP(e.target));
document.getElementById('dataNascimento').addEventListener('input', e=>maskDate(e.target));
document.getElementById('consultaCpf').addEventListener('input', e=>maskCPF(e.target));
document.querySelectorAll('input[name="bolsaFamilia"]').forEach(r=>{
  r.addEventListener('change',()=>{
    const wrap=document.getElementById('bolsaDocWrap');
    const doc=document.getElementById('docBolsaFamilia');
    const selected=document.querySelector('input[name="bolsaFamilia"]:checked')?.value;
    if(selected==='Sim'){
      wrap?.classList.remove('hidden');
      doc?.removeAttribute('required');
    }else{
      wrap?.classList.add('hidden');
      if(doc){
        doc.removeAttribute('required');
        doc.value='';
      }
    }
  });
});

document.querySelectorAll('.service-card[data-service]').forEach(btn => btn.addEventListener('click', ()=>{
  const map={
    'educacao-infantil':'Educação Infantil',
    'fundamental':'Ensino Fundamental',
    'eja':'EJA',
    'transferencia':'Transferência'
  };
  currentService=map[btn.dataset.service];
  document.getElementById('serviceLabel').textContent=currentService;
  updatePeriodOptions();
  currentStep=1; updateProgress(); showView('wizard');
}));
['btnConsulta','btnConsultaTop','btnAcompanhar'].forEach(id=>document.getElementById(id).addEventListener('click',()=>showView('consulta')));
document.getElementById('btnVoltarInicio').addEventListener('click',()=>showView('home'));
document.getElementById('btnConsultaVoltar').addEventListener('click',()=>showView('home'));
document.getElementById('btnNova').addEventListener('click',()=>{
  document.getElementById('matriculaForm').reset();
  currentStageCode=null;
  residencePoint=null;
  geocodedAddress='';
  currentStep=1;
  updatePeriodOptions();
  updateProgress();
  showView('home');
});

document.getElementById('dataNascimento').addEventListener('blur', calculateStage);
document.getElementById('dataNascimento').addEventListener('change', calculateStage);
function calculateStage(){
  const val=document.getElementById('dataNascimento').value;
  if(!val) return;
  const d=parseBRDate(val);
  const box=document.getElementById('etapaBox');
  if(!d){
    box.innerHTML='<strong>Data inválida</strong><br>Informe a data no formato DD/MM/AAAA.';
    box.classList.remove('hidden');
    return;
  }
  const cutoff=new Date(2027,2,31,12,0,0);
  if(d>cutoff){
    box.innerHTML='<strong>Verifique a data</strong><br>A data de nascimento não pode ser posterior à data de corte utilizada no protótipo.';
    box.classList.remove('hidden');
    return;
  }
  let age=cutoff.getFullYear()-d.getFullYear();
  const md=cutoff.getMonth()-d.getMonth();
  if(md<0 || (md===0 && cutoff.getDate()<d.getDate())) age--;
  let etapa='Etapa a confirmar pela SME';
  currentStageCode=null;
  if(currentService==='Educação Infantil'){
    if(age<=0){ etapa='Berçário / atendimento conforme idade mínima'; currentStageCode='BERCARIO'; }
    else if(age===1){ etapa='Fase I'; currentStageCode='FASE_I'; }
    else if(age===2){ etapa='Fase II'; currentStageCode='FASE_II'; }
    else if(age===3){ etapa='Fase III'; currentStageCode='FASE_III'; }
    else if(age===4){ etapa='Fase IV'; currentStageCode='FASE_IV'; }
    else if(age===5){ etapa='Fase V'; currentStageCode='FASE_V'; }
    else etapa='Fora da faixa usual da Educação Infantil';
  }else if(currentService==='Ensino Fundamental'){
    etapa=age>=6 ? 'Ensino Fundamental — ano a confirmar pela escolarização anterior' : 'Idade inferior ao ingresso no 1º ano'; if(age===6) currentStageCode='1_ANO';
  }else if(currentService==='EJA'){
    if(age>=15){
      etapa='Faixa etária compatível com EJA — termo/etapa será confirmado pela escolarização anterior';
      currentStageCode='EJA';
    }else{
      etapa='Idade inferior ao mínimo do Ensino Fundamental EJA';
      currentStageCode=null;
    }
  }
  box.innerHTML=`<strong>Resultado preliminar</strong><br>${etapa}<br><small>Cálculo demonstrativo do protótipo. As regras oficiais de 2027 serão parametrizadas.</small>`;
  box.classList.remove('hidden');
  updatePeriodOptions();
}

['cep','numero','logradouro','bairro'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',()=>{
    residencePoint=null;
    geocodedAddress='';
    const box=document.getElementById('geoBox');
    if(box && !box.classList.contains('hidden')){
      box.innerHTML='<strong>Endereço alterado.</strong><br>Clique novamente em <strong>Localizar endereço</strong> para atualizar a localização.';
    }
  });
});

function normalizeText(v){
  return (v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
function tokenSimilarity(a,b){
  const A=new Set(normalizeText(a).split(' ').filter(x=>x.length>2));
  const B=new Set(normalizeText(b).split(' ').filter(x=>x.length>2));
  if(!A.size || !B.size) return 0;
  let hit=0; A.forEach(x=>{if(B.has(x)) hit++});
  return hit/Math.max(A.size,B.size);
}
function addressCity(addr){
  return addr.city || addr.town || addr.municipality || addr.city_district || '';
}
function addressRoad(addr){
  return addr.road || addr.pedestrian || addr.residential || addr.neighbourhood || '';
}

async function searchNominatim(params){
  const usp=new URLSearchParams({format:'jsonv2',limit:'5',countrycodes:'br',addressdetails:'1',...params});
  const res=await fetch('https://nominatim.openstreetmap.org/search?'+usp.toString(),{headers:{'Accept':'application/json'}});
  if(!res.ok) return [];
  return await res.json();
}

document.getElementById('btnSimularEndereco').addEventListener('click', async ()=>{
  const btn=document.getElementById('btnSimularEndereco');
  const cepRaw=document.getElementById('cep').value.trim();
  const cep=onlyDigits(cepRaw);
  const numero=document.getElementById('numero').value.trim();
  const logradouroDigitado=document.getElementById('logradouro').value.trim();
  const bairroDigitado=document.getElementById('bairro').value.trim();
  const box=document.getElementById('geoBox');

  if(!logradouroDigitado || !numero || !bairroDigitado){
    box.innerHTML='<strong>Endereço incompleto</strong><br>Preencha logradouro, número e bairro antes de localizar.';
    box.classList.remove('hidden');
    return;
  }

  btn.disabled=true;
  const original=btn.textContent;
  btn.textContent='Localizando...';

  try{
    // 1. Canonicaliza o CEP brasileiro antes de geocodificar.
    let logradouro=logradouroDigitado, bairro=bairroDigitado, cepInfo=null;
    if(cep.length===8){
      try{
        const vr=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        if(vr.ok){
          const vd=await vr.json();
          if(vd && !vd.erro){
            cepInfo=vd;
            if(vd.localidade && normalizeText(vd.localidade)!=='embu das artes'){
              residencePoint=null; geocodedAddress='';
              box.innerHTML=`<strong>CEP fora de Embu das Artes</strong><br>O CEP informado corresponde a <strong>${vd.localidade}/${vd.uf||''}</strong>. Revise o endereço antes de continuar.`;
              box.classList.remove('hidden');
              return;
            }
            if(vd.logradouro) logradouro=vd.logradouro;
            if(vd.bairro) bairro=vd.bairro;
          }
        }
      }catch(e){ console.warn('ViaCEP indisponível',e); }
    }

    // 2. Busca primeiro o endereço completo. Nunca usamos CEP isolado como coordenada exata.
    const attempts=[
      {street:`${numero} ${logradouro}`,city:'Embu das Artes',state:'São Paulo',postalcode:cepRaw,country:'Brasil'},
      {street:`${numero} ${logradouro}`,city:'Embu das Artes',state:'São Paulo',country:'Brasil'},
      {q:[logradouro,numero,bairro,'Embu das Artes','São Paulo','Brasil'].join(', ')}
    ];

    let candidates=[];
    for(const params of attempts){
      const found=await searchNominatim(params);
      if(found?.length) candidates.push(...found);
    }

    // Remove duplicados e pontua apenas resultados territorialmente coerentes.
    const uniq=[]; const seen=new Set();
    for(const r of candidates){
      const k=`${Number(r.lat).toFixed(6)},${Number(r.lon).toFixed(6)}`;
      if(!seen.has(k)){seen.add(k);uniq.push(r)}
    }

    const wantedRoad=logradouro;
    const wantedBairro=bairro;
    const scored=uniq.map(r=>{
      const a=r.address||{};
      const city=addressCity(a);
      const road=addressRoad(a);
      const cityOk=normalizeText(city).includes('embu das artes') || normalizeText(r.display_name).includes('embu das artes');
      const roadScore=tokenSimilarity(wantedRoad,road || r.display_name);
      const bairroScore=tokenSimilarity(wantedBairro,[a.suburb,a.neighbourhood,a.quarter,a.city_district,r.display_name].filter(Boolean).join(' '));
      const post=onlyDigits(a.postcode||'');
      const cepOk=!cep || !post || post===cep;
      // Rua é o critério principal. Bairro e CEP apenas reforçam.
      const score=(cityOk?3:0)+(roadScore*5)+(bairroScore*1.5)+(cepOk?0.5:0);
      return {r,cityOk,roadScore,bairroScore,cepOk,score};
    }).filter(x=>x.cityOk && x.roadScore>=0.45 && x.cepOk)
      .sort((a,b)=>b.score-a.score);

    const best=scored[0];
    if(!best){
      residencePoint=null;
      geocodedAddress='';
      const cepNote=cepInfo ? `<br><small>CEP confirmado: ${cepInfo.logradouro||logradouroDigitado} — ${cepInfo.bairro||bairroDigitado}, Embu das Artes/SP.</small>` : '';
      box.innerHTML=`<strong>Não foi possível localizar este endereço com segurança.</strong><br>O sistema evitou utilizar uma coordenada aproximada que poderia indicar uma escola incorreta.${cepNote}<br><br>Revise o número/logradouro ou prossiga para análise territorial pela SME.`;
      box.classList.remove('hidden');
      return;
    }

    const result=best.r;
    residencePoint={lat:Number(result.lat),lon:Number(result.lon)};
    geocodedAddress=result.display_name || '';

    const offers=unidadesSME.filter(u=>(u.ofertas||[]).some(o=>o.etapa===currentStageCode));
    const geocoded=offers.filter(u=>Number.isFinite(Number(u.latitude)) && Number.isFinite(Number(u.longitude)));
    const inside=geocoded.filter(u=>{
      const d=haversineKm(residencePoint,{lat:Number(u.latitude),lon:Number(u.longitude)});
      return d<=2;
    });

    box.innerHTML=`<strong>Endereço localizado e conferido</strong><br>${geocodedAddress}<br>
      <span class="geo-coords">Lat ${residencePoint.lat.toFixed(6)} • Lon ${residencePoint.lon.toFixed(6)}</span><br><br>
      <strong>${inside.length} unidade(s)</strong> com oferta de ${stageLabel(currentStageCode)} encontrada(s) em até 2 km.
      <div class="warning-box"><strong>Importante:</strong> nesta versão, o raio de 2 km ainda usa distância em linha reta. Na produção, a regra será calculada por <strong>rota a pé</strong>.</div>`;
    box.classList.remove('hidden');
  }catch(err){
    residencePoint=null;
    geocodedAddress='';
    box.innerHTML='<strong>Não foi possível consultar o serviço de localização.</strong><br>Verifique a conexão com a internet ou tente novamente. O cadastro pode continuar para análise posterior da SME.';
    box.classList.remove('hidden');
    console.warn(err);
  }finally{
    btn.disabled=false;
    btn.textContent=original;
  }
});


function validateFileInput(el){
  if(!el || !el.files || !el.files.length) return true;
  const file=el.files[0];
  const allowed=['application/pdf','image/jpeg','image/png'];
  const max=5*1024*1024;
  if(file.size>max){
    el.setCustomValidity('O arquivo deve ter no máximo 5 MB.');
    el.reportValidity();
    el.setCustomValidity('');
    return false;
  }
  if(file.type && !allowed.includes(file.type)){
    el.setCustomValidity('Envie um arquivo PDF, JPG ou PNG.');
    el.reportValidity();
    el.setCustomValidity('');
    return false;
  }
  return true;
}

function validateStep(){
  const active=document.querySelector(`.step[data-step="${currentStep}"]`);
  const required=[...active.querySelectorAll('[required]')];
  for(const el of required){
    if((el.type==='checkbox' && !el.checked) || (!el.value)){
      el.focus(); el.reportValidity(); return false;
    }
  }
  if(currentStep===2){
    const dateInput=document.getElementById('dataNascimento');
    if(!parseBRDate(dateInput.value)){
      dateInput.setCustomValidity('Informe uma data válida no formato DD/MM/AAAA.');
      dateInput.reportValidity();
      dateInput.setCustomValidity('');
      dateInput.focus();
      return false;
    }
  }
  const fileInputs=[...active.querySelectorAll('input[type="file"]')];
  for(const f of fileInputs){
    if(!validateFileInput(f)) return false;
  }
  return true;
}
document.getElementById('btnNext').addEventListener('click',()=>{
  if(!validateStep()) return;
  if(currentStep<steps.length){currentStep++;updateProgress();window.scrollTo({top:0,behavior:'smooth'});}
  else finish();
});
document.getElementById('btnPrev').addEventListener('click',()=>{if(currentStep>1){currentStep--;updateProgress();window.scrollTo({top:0,behavior:'smooth'})}});

function value(id){return document.getElementById(id).value || 'Não informado'}
function buildReview(){
  const escola=document.querySelector('input[name="escola"]:checked')?.value || 'Sem preferência';
  document.getElementById('review').innerHTML=`
    <div><small>Serviço</small><strong>${currentService}</strong></div>
    <div><small>Responsável</small><strong>${value('nomeResponsavel')}</strong></div>
    <div><small>Estudante</small><strong>${value('nomeEstudante')}</strong></div>
    <div><small>Nascimento</small><strong>${value('dataNascimento')}</strong></div>
    <div><small>Endereço</small><strong>${value('logradouro')}, ${value('numero')} — ${value('bairro')}</strong></div>
    <div><small>Unidade preferencial</small><strong>${escola}</strong></div>
    <div><small>Bolsa Família</small><strong>${document.querySelector('input[name="bolsaFamilia"]:checked')?.value || 'Não informado'}</strong></div>
  `;
}
function finish(){
  const number=Math.floor(Math.random()*900000)+100000;
  const protocol=`MAT-2027-${number}`;
  document.getElementById('protocolNumber').textContent=protocol;
  document.getElementById('successSummary').innerHTML=`<strong>${value('nomeEstudante')}</strong><br>${currentService}<br><span style="color:#65706a">Responsável: ${value('nomeResponsavel')}</span>`;
  document.getElementById('consultaProtocolo').value=protocol;
  showView('success');
}
document.getElementById('btnConsultarStatus').addEventListener('click',()=>{
  const protocol=document.getElementById('consultaProtocolo').value.trim() || 'MAT-2027-000124';
  document.getElementById('statusProtocol').textContent=protocol.toUpperCase();
  document.getElementById('statusResult').classList.remove('hidden');
});
loadSchoolData();
updatePeriodOptions();
updateProgress();
