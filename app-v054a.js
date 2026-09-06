const GEO_ENGINE_VERSION='0.5.4a';
const views = [...document.querySelectorAll('.view')];
const steps = [...document.querySelectorAll('.step')];
let currentStep = 1;
let currentService = 'Educação Infantil';
let currentStageCode = null;
let unidadesSME = [];
let residencePoint = null;
let geocodedAddress = '';
let geoStatus = 'not_attempted'; // not_attempted | verified | approximate | unverified

let geoSource = '';

// Referências territoriais locais validadas pela SME.
// Esta tabela tem prioridade sobre coordenadas aproximadas retornadas por serviços externos.
// Novos CEPs problemáticos poderão ser incorporados progressivamente após validação territorial.
const CEP_GEO_VALIDADO = {
  '06815620': {
    lat: -23.651460,
    lon: -46.817630,
    logradouro: 'Rua Antônio Conselheiro',
    bairro: 'Parque Pirajussara',
    municipio: 'Embu das Artes',
    precisao: 'referência territorial validada do CEP/logradouro'
  }
};

// Priorização territorial piloto validada com a equipe da SME.
// A lista representa a região de atendimento, não necessariamente o bairro cadastral da escola.
// Novos territórios poderão ser adicionados progressivamente conforme validação do Setor de Demanda.
const TERRITORIOS_ESCOLARES_PILOTO = {
  'PARQUE PIRAJUSSARA': [
    'EM VALDELICE AP MEDEIROS PRASS',
    'NEI ISIS CRISTINA',
    'EM JATOBÁ',
    'NEI SÃO MARCOS'
  ],
  'JARDIM DO COLEGIO': [
    'NEI MAGALI'
  ]
};

const GEO_STORAGE_KEY='sme-inscricao-geo-v053a';

function enderecoAssinatura(){
  return [
    onlyDigits(document.getElementById('cep')?.value||''),
    normalizeText(document.getElementById('logradouro')?.value||''),
    normalizeText(document.getElementById('numero')?.value||''),
    normalizeText(document.getElementById('bairro')?.value||'')
  ].join('|');
}

function persistirEstadoGeo(){
  if(!residencePoint) return;
  try{
    sessionStorage.setItem(GEO_STORAGE_KEY, JSON.stringify({
      assinatura:enderecoAssinatura(),
      point:residencePoint,
      geocodedAddress,
      geoStatus,
      geoSource
    }));
  }catch(e){ console.warn('Não foi possível persistir localização',e); }
}

function limparEstadoGeo(){
  try{ sessionStorage.removeItem(GEO_STORAGE_KEY); }catch(e){}
}

function restaurarEstadoGeo(){
  if(residencePoint) return true;
  try{
    const raw=sessionStorage.getItem(GEO_STORAGE_KEY);
    if(!raw) return false;
    const s=JSON.parse(raw);
    if(!s?.point || s.assinatura!==enderecoAssinatura()) return false;
    residencePoint={lat:Number(s.point.lat),lon:Number(s.point.lon)};
    geocodedAddress=s.geocodedAddress||'';
    geoStatus=s.geoStatus||'approximate';
    geoSource=s.geoSource||'';
    return Number.isFinite(residencePoint.lat)&&Number.isFinite(residencePoint.lon);
  }catch(e){
    console.warn('Não foi possível restaurar localização',e);
    return false;
  }
}

function normalizarTerritorioTexto(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
}

function bairroResidenciaAtual(){
  return document.getElementById('bairro')?.value || '';
}

function priorizarPorTerritorio(list){
  const bairro = normalizarTerritorioTexto(bairroResidenciaAtual());
  const chave = Object.keys(TERRITORIOS_ESCOLARES_PILOTO)
    .find(k=>normalizarTerritorioTexto(k)===bairro);

  const ordenarDist=(arr)=>[...arr].sort((a,b)=>{
    const da=Number.isFinite(a.dist)?a.dist:9999;
    const db=Number.isFinite(b.dist)?b.dist:9999;
    return da-db;
  });

  if(!chave){
    // Sem território validado, evitamos indicar três escolas potencialmente erradas.
    // Exibe apenas a candidata geograficamente mais próxima como referência provisória.
    const confiaveis=ordenarDist(list.filter(x=>String(x.u.bairro||'').trim()));
    const base=confiaveis.length?confiaveis:ordenarDist(list);
    return {
      lista:base.slice(0,1),
      territorial:false,
      parcial:true,
      mensagem:'Território ainda não validado pela SME. As demais unidades serão definidas na análise territorial.'
    };
  }

  const ordem = TERRITORIOS_ESCOLARES_PILOTO[chave].map(normalizarTerritorioTexto);
  const mapa = new Map(ordem.map((n,i)=>[n,i]));
  const doTerritorio = list
    .filter(x=>mapa.has(normalizarTerritorioTexto(x.u.nome_exibicao)))
    .sort((a,b)=>mapa.get(normalizarTerritorioTexto(a.u.nome_exibicao))-mapa.get(normalizarTerritorioTexto(b.u.nome_exibicao)));

  // Se o território só tem uma ou duas unidades validadas, não completamos com escolas de outras regiões.
  if(doTerritorio.length<3){
    return {
      lista:doTerritorio,
      territorial:true,
      parcial:true,
      territorio:chave,
      mensagem:'Triagem territorial parcialmente validada. Outras unidades serão definidas pela SME.'
    };
  }

  return {lista:doTerritorio.slice(0,3), territorial:true, parcial:false, territorio:chave};
}


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

  if(!residencePoint) restaurarEstadoGeo();

  // Recalcula as distâncias caso a localização tenha sido restaurada do sessionStorage.
  allOffers.forEach(x=>{
    if(x.hasCoords && residencePoint){
      x.dist=haversineKm(residencePoint,{lat:Number(x.u.latitude),lon:Number(x.u.longitude)});
    }
  });

  const bairroNorm=normalizarTerritorioTexto(bairroResidenciaAtual());
  const temTerritorioPiloto=Object.keys(TERRITORIOS_ESCOLARES_PILOTO)
    .some(k=>normalizarTerritorioTexto(k)===bairroNorm);

  if(!residencePoint && !temTerritorioPiloto){
    box.innerHTML=`<div class="empty-state"><strong>Localização territorial pendente.</strong><br>Não foi possível definir com segurança as unidades prioritárias. A inscrição poderá continuar para <strong>análise territorial pela SME</strong>.</div>`;
    return;
  }

  // Para território piloto, a ordem territorial validada prevalece sobre a distância em linha reta.
  // Fora do piloto, usa-se provisoriamente a distância geográfica.
  const universo=allOffers.filter(x=>x.hasCoords);
  const prioridade=priorizarPorTerritorio(universo);
  const principais=prioridade.lista;

  function badgeRank(idx){
    if(idx===0) return '<span class="nearest-badge">1ª indicação</span>';
    if(idx===1) return '<span class="nearest-badge rank-secondary">2ª indicação</span>';
    if(idx===2) return '<span class="nearest-badge rank-secondary">3ª indicação</span>';
    return '';
  }

  function schoolCard(item,idx){
    const {u,offer,dist}=item;
    const periods=Object.keys(offer.periodos||{});
    const cap=offer.capacidade_referencia_2026||0;
    return `<label class="school-option">
      <input type="radio" name="escola" value="${u.nome_exibicao}">
      <span>
        <strong>${u.nome_exibicao}${badgeRank(idx)}</strong>
        <small>${u.bairro?u.bairro+' • ':''}${Number.isFinite(dist)?dist.toFixed(2).replace('.',',')+' km ':''}<em>(referência territorial)</em></small>
        <span class="school-meta">
          <span class="chip">Períodos ofertados:</span>
          ${periods.map(p=>`<span class="chip">${p}</span>`).join('')}
          <span class="chip">${u.tipo==='conveniada'?'Conveniada':'Direta'}</span>
        </span>
        <small class="capacity-note">Capacidade de referência 2026 para ${stageLabel(currentStageCode)}: ${cap} estudante(s)</small>
      </span>
    </label>`;
  }

  const criterio = prioridade.territorial
    ? `Triagem territorial piloto: <strong>${prioridade.territorio}</strong>.`
    : 'Triagem provisória pelas três unidades geograficamente mais próximas.';

  const intro=`<div class="result-box"><strong>3 unidades prioritárias para esta inscrição</strong><br>
    ${criterio}<br>
    <small>A distância exibida é apenas referência. A ordem final será validada pela SME e, futuramente, pelo cálculo de rota a pé.</small>
  </div>`;

  box.innerHTML=intro+principais.map((item,idx)=>schoolCard(item,idx)).join('');
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
  const map={'educacao-infantil':'Educação Infantil','eja':'EJA'};
  currentService=map[btn.dataset.service];
  if(!currentService) return;
  document.getElementById('serviceLabel').textContent=currentService;
  document.getElementById('precheckServiceLabel').textContent=currentService;
  resetPrecheck();
  showView('precheck');
}));
['btnConsulta','btnConsultaTop','btnAcompanhar'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>showView('consulta')));
document.getElementById('btnPainelTop')?.addEventListener('click',()=>{renderDashboard();showView('dashboard')});
document.getElementById('btnDashboardVoltar')?.addEventListener('click',()=>showView('home'));
document.getElementById('btnPrecheckVoltar')?.addEventListener('click',()=>showView('home'));
document.getElementById('btnVoltarInicio').addEventListener('click',()=>showView('home'));
document.getElementById('btnConsultaVoltar').addEventListener('click',()=>showView('home'));
document.getElementById('btnNova').addEventListener('click',()=>{
  document.getElementById('inscricaoForm')?.reset();
  currentStageCode=null;
  residencePoint=null;
  geocodedAddress='';
  geoStatus='not_attempted';
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

let autoFillingAddress=false;
['cep','numero','logradouro','bairro'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',()=>{
    if(autoFillingAddress) return;
    residencePoint=null;
    geocodedAddress='';
    geoStatus='not_attempted';
    geoSource='';
    limparEstadoGeo();
    document.querySelectorAll('input[name="escola"]').forEach(r=>r.checked=false);
    const box=document.getElementById('geoBox');
    if(box && !box.classList.contains('hidden')){
      box.innerHTML='<strong>Endereço alterado.</strong><br>Clique novamente em <strong>Localizar endereço</strong> para atualizar a localização.';
    }
  });
});

function normalizeText(v){
  return (v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
function meaningfulTokens(v){
  const stop=new Set(['rua','r','avenida','av','estrada','estr','travessa','alameda','rodovia','praca','praça','do','da','de','dos','das']);
  return normalizeText(v).split(' ').filter(x=>x.length>2 && !stop.has(x));
}
function tokenSimilarity(a,b){
  const A=new Set(meaningfulTokens(a));
  const B=new Set(meaningfulTokens(b));
  if(!A.size || !B.size) return 0;
  let hit=0; A.forEach(x=>{if(B.has(x)) hit++});
  return hit/A.size;
}
function addressCity(addr){
  return addr.city || addr.town || addr.municipality || addr.city_district || '';
}
function addressRoad(addr){
  return addr.road || addr.pedestrian || addr.residential || addr.footway || addr.path || '';
}


async function fetchCepData(cep){
  if(!cep || cep.length!==8) return null;
  try{
    const vr=await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if(vr.ok){
      const vd=await vr.json();
      if(vd && !vd.erro) return {source:'ViaCEP', ...vd};
    }
  }catch(e){ console.warn('ViaCEP indisponível',e); }
  try{
    const br=await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if(br.ok){
      const bd=await br.json();
      if(bd && bd.cep) return {source:'BrasilAPI', ...bd, localidade:bd.city, uf:bd.state, logradouro:bd.street, bairro:bd.neighborhood};
    }
  }catch(e){ console.warn('BrasilAPI indisponível',e); }
  return null;
}

async function fetchCepCoordinates(cep){
  try{
    const br=await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
    if(!br.ok) return null;
    const bd=await br.json();
    const c=bd?.location?.coordinates;
    const lat=Number(c?.latitude), lon=Number(c?.longitude);
    if(Number.isFinite(lat) && Number.isFinite(lon)) return {lat,lon,source:'BrasilAPI/CEP',raw:bd};
  }catch(e){ console.warn('BrasilAPI coordenadas indisponíveis',e); }
  return null;
}

async function autofillCep(){
  const cep=onlyDigits(document.getElementById('cep').value);
  if(cep.length!==8) return null;
  const box=document.getElementById('geoBox');
  const data=await fetchCepData(cep);
  if(!data) return null;
  const city=normalizeText(data.localidade||data.city||'');
  if(city && city!=='embu das artes'){
    residencePoint=null; geocodedAddress=''; geoStatus='unverified'; geoSource='';
    if(box){box.innerHTML=`<strong>CEP fora de Embu das Artes</strong><br>O CEP informado corresponde a <strong>${data.localidade||data.city}/${data.uf||data.state||''}</strong>. Revise o endereço.`;box.classList.remove('hidden');}
    return data;
  }
  autoFillingAddress=true;
  try{
    if(data.logradouro||data.street) document.getElementById('logradouro').value=data.logradouro||data.street;
    if(data.bairro||data.neighborhood) document.getElementById('bairro').value=data.bairro||data.neighborhood;
  }finally{ autoFillingAddress=false; }
  return data;
}

document.getElementById('cep')?.addEventListener('blur', autofillCep);
document.getElementById('cep')?.addEventListener('change', autofillCep);

async function searchNominatim(params){
  const usp=new URLSearchParams({format:'jsonv2',limit:'8',countrycodes:'br',addressdetails:'1',viewbox:'-46.92,-23.58,-46.74,-23.76',bounded:'1',...params});
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
    box.innerHTML='<strong>Endereço incompleto</strong><br>Preencha CEP, logradouro, número e bairro antes de localizar.';
    box.classList.remove('hidden'); return;
  }

  btn.disabled=true; const original=btn.textContent; btn.textContent='Localizando...';
  try{
    let cepInfo=await fetchCepData(cep);
    let logradouro=cepInfo?.logradouro||cepInfo?.street||logradouroDigitado;
    let bairro=cepInfo?.bairro||cepInfo?.neighborhood||bairroDigitado;
    if(cepInfo){
      const city=normalizeText(cepInfo.localidade||cepInfo.city||'');
      if(city && city!=='embu das artes'){
        residencePoint=null; geocodedAddress=''; geoStatus='unverified'; geoSource='';
        box.innerHTML=`<strong>CEP fora de Embu das Artes</strong><br>O CEP informado corresponde a <strong>${cepInfo.localidade||cepInfo.city}/${cepInfo.uf||cepInfo.state||''}</strong>.`;
        box.classList.remove('hidden'); return;
      }
      autoFillingAddress=true;
      try{
        if(logradouro) document.getElementById('logradouro').value=logradouro;
        if(bairro) document.getElementById('bairro').value=bairro;
      }finally{autoFillingAddress=false;}
    }

    // Prioridade 1: referência territorial local validada pela SME.
    // Evita que um provedor externo desloque um CEP conhecido para outra região.
    const refLocal = CEP_GEO_VALIDADO[cep];
    if(refLocal){
      const roadScoreLocal = tokenSimilarity(logradouro, refLocal.logradouro);
      const bairroScoreLocal = tokenSimilarity(bairro, refLocal.bairro);
      if(roadScoreLocal >= 0.80 && bairroScoreLocal >= 0.55){
        residencePoint={lat:Number(refLocal.lat),lon:Number(refLocal.lon)};
        geocodedAddress=`${refLocal.logradouro}, ${refLocal.bairro}, ${refLocal.municipio}/SP — CEP ${cepRaw}`;
        geoStatus='approximate';
        geoSource='base territorial SME (piloto)';
        showGeoSuccess(box, refLocal.precisao, refLocal.logradouro);
        persistirEstadoGeo();
        return;
      }
    }

    const exactAttempts=[
      {street:`${numero} ${logradouro}`,city:'Embu das Artes',state:'São Paulo',postalcode:cepRaw,country:'Brasil'},
      {q:[logradouro,numero,bairro,'Embu das Artes','São Paulo','Brasil'].join(', ')}
    ];
    let candidates=[];
    for(const p of exactAttempts){ const f=await searchNominatim(p); if(f?.length)candidates.push(...f); }

    const evaluate=(list,minRoad=0.75)=>{
      const uniq=[],seen=new Set();
      for(const r of list){const k=`${Number(r.lat).toFixed(6)},${Number(r.lon).toFixed(6)}`;if(!seen.has(k)){seen.add(k);uniq.push(r)}}
      return uniq.map(r=>{
        const a=r.address||{}; const city=addressCity(a); const road=addressRoad(a);
        const cityText=normalizeText([city,a.county,a.state_district,r.display_name].filter(Boolean).join(' '));
        const cityOk=cityText.includes('embu das artes'); const roadScore=tokenSimilarity(logradouro,road);
        const bairroScore=tokenSimilarity(bairro,[a.suburb,a.neighbourhood,a.quarter,a.city_district,r.display_name].filter(Boolean).join(' '));
        const post=onlyDigits(a.postcode||''); const cepExact=!!cep&&!!post&&post===cep; const cepConflict=!!cep&&!!post&&post!==cep;
        const score=(cityOk?4:0)+(roadScore*8)+(bairroScore*2)+(cepExact?3:0)-(cepConflict?8:0);
        return {r,road,cityOk,roadScore,bairroScore,cepExact,cepConflict,score};
      }).filter(x=>x.cityOk&&x.roadScore>=minRoad&&!x.cepConflict).sort((a,b)=>b.score-a.score);
    };

    let best=evaluate(candidates,0.80)[0];
    let precision='exact';

    // Se o número não está mapeado no OSM, tenta localizar o logradouro/CEP.
    if(!best){
      const streetAttempts=[
        {street:logradouro,city:'Embu das Artes',state:'São Paulo',postalcode:cepRaw,country:'Brasil'},
        {q:[logradouro,bairro,'Embu das Artes','São Paulo',cepRaw,'Brasil'].join(', ')}
      ];
      let streetCandidates=[];
      for(const p of streetAttempts){const f=await searchNominatim(p);if(f?.length)streetCandidates.push(...f);}
      best=evaluate(streetCandidates,0.80)[0];
      if(best) precision='street';
    }

    if(best){
      const result=best.r;
      residencePoint={lat:Number(result.lat),lon:Number(result.lon)};
      geocodedAddress=result.display_name||`${logradouro}, ${bairro}, Embu das Artes/SP`;
      geoStatus=precision==='exact'?'verified':'approximate';
      geoSource='OpenStreetMap / Nominatim';
      const precisionText=precision==='exact'?'logradouro/número confirmado':'logradouro confirmado; ponto aproximado da via';
      showGeoSuccess(box, precisionText, best.road||logradouro);
      persistirEstadoGeo();
      return;
    }

    // Último recurso seguro: coordenada aproximada do CEP, quando o provedor a disponibiliza.
    const cepCoord=await fetchCepCoordinates(cep);
    if(cepCoord){
      residencePoint={lat:cepCoord.lat,lon:cepCoord.lon};
      geocodedAddress=`${logradouro}, ${bairro}, Embu das Artes/SP — CEP ${cepRaw}`;
      geoStatus='approximate';
      geoSource='serviço externo de CEP';
      showGeoSuccess(box,'localização aproximada do CEP/logradouro',logradouro);
      persistirEstadoGeo();
      return;
    }

    residencePoint=null; geocodedAddress=''; geoStatus='unverified'; geoSource='';
    const cepNote=cepInfo?`<br><small>CEP confirmado: ${logradouro} — ${bairro}, Embu das Artes/SP.</small>`:'';
    box.innerHTML=`<strong>Endereço confirmado, mas localização territorial pendente.</strong><br>O sistema <strong>não indicará nenhuma escola automaticamente</strong> porque não obteve uma coordenada confiável.${cepNote}<br><br>A inscrição pode continuar e ficará marcada para <strong>análise territorial pela SME</strong>.<br><small>Motor geográfico v${GEO_ENGINE_VERSION}</small>`;
    box.classList.remove('hidden');
  }catch(err){
    residencePoint=null; geocodedAddress=''; geoStatus='unverified'; geoSource='';
    box.innerHTML='<strong>Não foi possível consultar o serviço de localização.</strong><br>A inscrição pode continuar para análise territorial pela SME.';
    box.classList.remove('hidden'); console.warn(err);
  }finally{btn.disabled=false;btn.textContent=original;}
});

function showGeoSuccess(box, precisionText, roadLabel){
  const offers=unidadesSME.filter(u=>(u.ofertas||[]).some(o=>o.etapa===currentStageCode));
  const geocoded=offers.filter(u=>Number.isFinite(Number(u.latitude))&&Number.isFinite(Number(u.longitude)));
  const approx=geoStatus==='approximate';
  const bairroNorm=normalizarTerritorioTexto(bairroResidenciaAtual());
  const territorioPiloto=Object.keys(TERRITORIOS_ESCOLARES_PILOTO)
    .find(k=>normalizarTerritorioTexto(k)===bairroNorm);
  box.innerHTML=`<strong>${approx?'Endereço confirmado — referência territorial':'Endereço localizado e conferido'}</strong><br>${geocodedAddress}<br>
    <small>Motor geográfico v${GEO_ENGINE_VERSION} • ${precisionText}${roadLabel?` • ${roadLabel}`:''}${geoSource?` • fonte: ${geoSource}`:''}</small><br>
    <span class=\"geo-coords\">Lat ${residencePoint.lat.toFixed(6)} • Lon ${residencePoint.lon.toFixed(6)}</span><br><br>
    <strong>${territorioPiloto?'3 unidades prioritárias serão apresentadas':'3 unidades serão priorizadas'}</strong> na próxima etapa.
    <div class=\"warning-box\"><strong>${approx?'Atenção:':'Importante:'}</strong> ${territorioPiloto?'A ordem usa a triagem territorial piloto validada pela SME. ':'A distância é usada apenas como referência inicial. '}A indicação final dependerá das regras vigentes e da disponibilidade de vagas.</div>`;
  box.classList.remove('hidden');
}


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
    <div><small>Prioridade declarada</small><strong>${hasDeclaredPriority()?'Sim — sujeita à validação da SME':'Não'}</strong></div>
    <div><small>Período da inscrição</small><strong>${registrationWindowLabel()}</strong></div>
  `;
}

function todayLocalISO(){
  const d=new Date();
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function setHidden(form,name,value){
  let el=form.querySelector(`input[type="hidden"][name="${name}"]`);
  if(!el){
    el=document.createElement('input');
    el.type='hidden'; el.name=name; form.appendChild(el);
  }
  el.value=value ?? '';
}

function prepareFormNames(){
  const form=document.getElementById('inscricaoForm');
  if(!form) return;
  form.querySelectorAll('input[id],select[id],textarea[id]').forEach(el=>{
    if(!el.name) el.name=el.id;
  });
}
prepareFormNames();

function showBusy(btn,text='Processando...'){
  if(!btn) return ()=>{};
  const old=btn.textContent;
  btn.disabled=true; btn.textContent=text;
  return ()=>{btn.disabled=false;btn.textContent=old;};
}

const CALL_START='2026-09-08';
const CALL_END='2026-10-09';
function registrationWindowCode(dateISO=todayLocalISO()){
  return (dateISO>=CALL_START && dateISO<=CALL_END) ? 'REGULAR' : 'FORA_DO_PERIODO';
}
function registrationWindowLabel(dateISO=todayLocalISO()){
  if(registrationWindowCode(dateISO)==='REGULAR') return 'Dentro do período oficial (08/09 a 09/10)';
  return dateISO<CALL_START ? 'Fora do período oficial — antes do chamamento' : 'Fora do período oficial — após 09/10';
}
function hasDeclaredPriority(){return criteriosDeclarados().length>0;}
function priorityTypes(){
  const arr=[];
  if(document.getElementById('pcd')?.checked) arr.push('Deficiência/acessibilidade');
  if(document.getElementById('doencaRara')?.checked) arr.push('Doença rara/condição prioritária');
  return arr;
}

const CRITERIOS_PRIORIDADE=[
 ['criterioPcd','PCD'],['criterioDoencaRara','DOENCA_RARA'],['criterioMaeSolo','MAE_SOLO'],
 ['criterioMaeTrabalhadora','MAE_TRABALHADORA'],['criterioMaeAdolescente','MAE_ADOLESCENTE'],
 ['criterioIrmaoMesmaEscola','IRMAO_MESMA_ESCOLA'],['criterioBolsaFamilia','BOLSA_FAMILIA'],
 ['criterioVulnerabilidade','VULNERABILIDADE_PROTECAO']
];
function criteriosDeclarados(){return CRITERIOS_PRIORIDADE.filter(([id])=>document.getElementById(id)?.checked).map(([,c])=>c);}

function finish(){
  const form=document.getElementById('inscricaoForm');
  prepareFormNames();
  const selectedSchool=document.querySelector('input[name="escola"]:checked');

  setHidden(form,'acao','salvarInscricao');
  setHidden(form,'servico',currentService);
  setHidden(form,'etapaCodigo',currentStageCode||'');
  setHidden(form,'etapaDescricao',stageLabel(currentStageCode));
  setHidden(form,'unidadeIndicada',selectedSchool?.value || 'ANÁLISE TERRITORIAL');
  setHidden(form,'geoStatus',geoStatus||'');
  setHidden(form,'geoSource',geoSource||'');
  setHidden(form,'latitude',residencePoint?.lat ?? '');
  setHidden(form,'longitude',residencePoint?.lon ?? '');
  setHidden(form,'enderecoGeocodificado',geocodedAddress||'');
  setHidden(form,'prioridadeDeclarada',hasDeclaredPriority()?'SIM':'NÃO');
  setHidden(form,'tiposPrioridade',criteriosDeclarados().join('; '));
  setHidden(form,'criteriosDeclaradosJson',JSON.stringify(criteriosDeclarados()));
  setHidden(form,'classificacaoPeriodo',registrationWindowCode());
  setHidden(form,'dataCliente',todayLocalISO());

  const nextBtn=document.getElementById('nextBtn');
  const restore=showBusy(nextBtn,'Enviando inscrição...');

  WorkspaceBridge.submitForm(form)
    .then(resp=>{
      restore();
      if(!resp?.ok){
        alert(resp?.message || 'Não foi possível concluir a inscrição.');
        return;
      }
      document.getElementById('protocolNumber').textContent=resp.protocolo;
      document.getElementById('successSummary').innerHTML=
        `<strong>${value('nomeEstudante')}</strong><br>${currentService}<br><span style="color:#65706a">Responsável: ${value('nomeResponsavel')}</span>`;
      document.getElementById('consultaProtocolo').value=resp.protocolo;
      const q=document.getElementById('queueNotice');
      q.innerHTML=`<strong>${resp.classificacaoLabel}</strong><span>${resp.mensagemFila}</span>`;
      showView('success');
    })
    .catch(err=>{
      restore();
      console.error(err);
      alert('Erro ao enviar a inscrição: '+(err?.message||err));
    });
}

function statusTimeline(status){
  const steps=[
    ['Inscrição recebida','Registro protocolado'],
    ['Em análise','Dados e documentos em conferência'],
    ['Aguardando vaga','Aguardando encaminhamento conforme disponibilidade'],
    ['Encaminhado para unidade','Encaminhamento realizado'],
    ['Matriculado','Matrícula registrada pela unidade']
  ];
  let activeIdx=Math.max(0,steps.findIndex(s=>s[0]===status));
  if(status==='Documentação pendente') activeIdx=1;
  if(['Indeferido','Cancelado'].includes(status)) activeIdx=1;
  return `<div class="timeline">${steps.map((s,i)=>`<div class="timeline-item ${i<activeIdx?'done':i===activeIdx?'active':''}"><b>${s[0]}</b><span>${i===activeIdx&&status!==s[0]?status:s[1]}</span></div>`).join('')}</div>`;
}

document.getElementById('btnConsultarStatus').addEventListener('click',()=>{
  const protocolo=(document.getElementById('consultaProtocolo').value||'').trim().toUpperCase();
  const cpf=(document.getElementById('consultaCpf').value||'').trim();
  if(!protocolo){ alert('Informe o protocolo.'); return; }

  const btn=document.getElementById('btnConsultarStatus');
  const restore=showBusy(btn,'Consultando...');
  WorkspaceBridge.request({
    acao:'consultarInscricao',
    protocolo, cpf
  }).then(resp=>{
    restore();
    const box=document.getElementById('statusResult');
    if(!resp?.ok){
      box.innerHTML=`<div class="empty-state"><strong>Inscrição não localizada.</strong><br>${resp?.message||'Confira o protocolo e o CPF do responsável.'}</div>`;
      box.classList.remove('hidden'); return;
    }
    const r=resp.inscricao;
    box.innerHTML=`<div class="status-header"><strong>${r.protocolo}</strong><span class="badge">${r.status}</span></div>
      <p><strong>${r.nomeEstudante}</strong> • ${r.servico}</p>
      <p class="muted">${r.classificacaoPeriodo==='REGULAR'?'Dentro do período oficial':'Fora do período oficial'}${r.prioridadeDeclarada==='SIM'?' • prioridade declarada':''}</p>
      ${statusTimeline(r.status)}`;
    box.classList.remove('hidden');
  }).catch(err=>{
    restore();
    alert('Erro na consulta: '+(err?.message||err));
  });
});

function resetPrecheck(){
  ['checkNome','checkNascimento'].forEach(id=>{const el=document.getElementById(id); if(el)el.value='';});
  document.getElementById('precheckResult')?.classList.add('hidden');
}

function verifyActiveEnrollment(){
  const nome=document.getElementById('checkNome').value.trim();
  const nascimento=document.getElementById('checkNascimento').value.trim();
  const box=document.getElementById('precheckResult');
  if(!nome || !nascimento){
    box.innerHTML='<strong>Preencha nome completo e data de nascimento.</strong>';
    box.classList.remove('hidden'); return;
  }
  const btn=document.getElementById('btnVerificarMatricula');
  const restore=showBusy(btn,'Verificando...');
  WorkspaceBridge.request({acao:'consultarMatriculaAtiva',nome,nascimento}).then(resp=>{
    restore();
    if(resp?.ambigua){
      box.innerHTML=`<div class="approved-result"><strong>Há mais de um registro com os dados informados.</strong><br>Para evitar bloqueio indevido, a inscrição poderá continuar e será sinalizada para conferência da SME.</div><button type="button" class="primary precheck-continue" id="btnIniciarFormulario">Iniciar inscrição</button>`;
    } else if(resp?.matriculado){
      box.innerHTML=`<div class="blocked-result"><strong>Foi localizada matrícula ativa para os dados informados.</strong><br><br><strong>Não será aberta nova inscrição.</strong> Este sistema é destinado a quem está fora da escola. Para transferência ou atualização da matrícula, procure a unidade escolar ou o Setor de Demanda.</div>`;
      box.classList.remove('hidden'); return;
    } else {
      box.innerHTML=`<div class="approved-result"><strong>Nenhuma matrícula ativa localizada.</strong><br>O formulário de inscrição pode ser iniciado.</div><button type="button" class="primary precheck-continue" id="btnIniciarFormulario">Iniciar inscrição</button>`;
    }
    box.classList.remove('hidden');
    document.getElementById('btnIniciarFormulario')?.addEventListener('click',()=>{
      document.getElementById('nomeEstudante').value=nome;
      document.getElementById('dataNascimento').value=nascimento;
      calculateStage(); currentStep=1; updateProgress(); showView('wizard');
    });
  }).catch(err=>{restore(); alert('Erro ao consultar matrícula: '+(err?.message||err));});
}

document.getElementById('checkNascimento')?.addEventListener('input',e=>maskDate(e.target));
document.getElementById('btnVerificarMatricula')?.addEventListener('click',verifyActiveEnrollment);

loadSchoolData();
updatePeriodOptions();
updateProgress();
