# Matrícula Digital 2027 — Protótipo v0.3

Protótipo navegável do Portal da Família da Secretaria Municipal de Educação de Embu das Artes.

## O que esta versão contém
- Tela inicial de serviços
- Fluxo de inscrição em 6 etapas
- Cadastro de responsável
- Cadastro de estudante
- Cálculo demonstrativo da etapa
- Endereço e geolocalização simulados
- Prioridades/necessidades
- Escolas compatíveis simuladas
- Revisão
- Geração simulada de protocolo
- Tela de consulta de protocolo
- Layout responsivo para celular e desktop

## Como executar
Abra o arquivo `index.html` no navegador.

Também pode ser servido localmente, por exemplo:
`python -m http.server 8000`

Depois acesse:
`http://localhost:8000`

## Atenção
Este é um protótipo de interface. Não armazena dados e não deve ser usado em produção.
As regras etárias e unidades escolares são demonstrativas e serão substituídas por parâmetros oficiais de 2027.

## Alterações da v0.2
- Data de nascimento em DD/MM/AAAA com máscara e validação
- Removida dependência do calendário nativo do navegador
- Consulta passa a exibir o protocolo informado pelo usuário

## Alterações da v0.3
- Cadastro mestre com 68 unidades georreferenciadas da base do PMPI/SME
- Cruzamento com a planilha de capacidade 2026
- Ofertas reais por etapa e período para correspondências validadas
- Filtro de unidades pela etapa calculada
- Capacidade 2026 identificada explicitamente como referência, não como vaga 2027
- Cadastro de aliases (incluindo Mellone, Delphina e Azteca)
- Relatório de correspondências pendentes para validação manual
- Distância ainda demonstrativa; geocodificação por rota será implementada no backend

### Importante para testar
Como a v0.3 lê `dados/unidades.json`, execute por servidor local:
`python -m http.server 8000`
E acesse `http://localhost:8000`. Abrir o HTML por duplo clique pode bloquear a leitura do JSON em alguns navegadores.

## v0.3.1 — correções do teste EJA
- Inclusão do período Noturno no fluxo de EJA.
- Correção da etapa interna EJA, que anteriormente ficava vazia e impedia a busca de unidades.
- Inclusão das 6 unidades com oferta EJA da planilha 2026:
  - EM Mauro Ferreira
  - EM Jequitibá
  - EM Jornalista
  - EM Valdelice
  - EM Paulo Freire
  - EM Elza Marreiro
- Unidades sem coordenadas na base georreferenciada passam a aparecer como "localização pendente", em vez de serem omitidas.
- Mensagem mais clara de que a geolocalização do endereço residencial ainda é demonstrativa nesta versão.

## v0.3.2 — base local e períodos por oferta real
- Corrigida a dependência de `fetch()` para carregar a base de escolas.
- Adicionado `dados/unidades.js` como base local incorporada; agora o protótipo funciona inclusive abrindo `index.html` diretamente.
- O seletor de período passa a usar apenas os períodos encontrados na base para a etapa/modalidade calculada.
- Fase IV e Fase V preservam o código interno até a tela de unidades.
- Mensagens de diagnóstico agora distinguem:
  - base não carregada;
  - etapa sem oferta;
  - oferta com coordenadas;
  - oferta com localização pendente.
- A tela de localização informa separadamente quantas unidades possuem a oferta e quantas possuem coordenadas.

## v0.3.3 — preferência da família x oferta escolar
- Educação Infantil passa a exibir como preferência pública apenas:
  - Manhã
  - Tarde
  - Integral
  - Sem preferência
- O período Intermediário continua preservado na base administrativa das unidades, mas não é oferecido como escolha pública.
- A preferência por Integral é registrada mesmo quando a unidade não possui oferta integral.
- A tela informa quando a escolha representa demanda por ampliação do tempo integral.
- A lista de escolas diferencia "oferta atual da unidade" da "preferência da família".
- A revisão da inscrição mostra separadamente unidade preferencial e período desejado.

## v0.4 — geocodificação real e filtro territorial
- Botão "Simular localização" substituído por "Localizar endereço".
- Geocodificação real do endereço digitado via serviço público OpenStreetMap/Nominatim, apenas para fins de protótipo.
- Residência passa a possuir latitude/longitude real quando localizada.
- Escolas compatíveis são filtradas por etapa e por raio geográfico preliminar de até 2 km.
- Lista deixa de mostrar todas as unidades do município.
- Escolas dentro do raio são ordenadas da mais próxima para a mais distante.
- A primeira unidade recebe destaque "Mais próxima".
- Quando nenhuma unidade é encontrada em até 2 km, o sistema indica análise de encaminhamento pela SME.
- Preferência por Integral continua registrada separadamente da oferta escolar.
- Alterar o endereço invalida a geocodificação anterior e exige nova localização.

### Importante
A regra definitiva deve usar **rota a pé**, conforme a lógica administrativa municipal. A v0.4 usa distância geográfica (linha reta) apenas para validar o fluxo e a experiência da interface.

### Execução
Para a geocodificação externa funcionar de forma mais consistente, execute por servidor local:
`python -m http.server 8000`
e abra `http://localhost:8000`.

## v0.4.1 — correção crítica da geocodificação
- Corrigido o `app.js` que ainda executava o bloco demonstrativo da v0.3.3.
- O botão "Localizar endereço" agora executa de fato geocodificação via Nominatim/OpenStreetMap.
- Adicionadas tentativas alternativas por:
  1. logradouro + número + bairro;
  2. logradouro + bairro;
  3. CEP.
- A residência recebe latitude/longitude reais quando localizada.
- A etapa de unidades passa a exibir somente escolas compatíveis dentro de até 2 km em linha reta.
- A escola compatível mais próxima recebe destaque.
- Se nenhuma unidade estiver dentro do raio, o sistema mostra a unidade compatível mais próxima e sinaliza análise da SME.

## v0.4.2 — ajustes do Setor de Demanda e Expansão
- Removida a escolha de período do formulário público.
- O período passa a ser definido conforme a disponibilidade real de vaga da unidade.
- Os períodos continuam exibidos somente como informação da oferta escolar.
- Incluído critério declarado de Bolsa Família.
- Quando Bolsa Família = Sim, é solicitado comprovante para validação.
- Incluído envio obrigatório de:
  - documento de identificação da criança (RG ou CPF);
  - certidão/comprovante de nascimento;
  - comprovante de residência.
- Uploads aceitam PDF, JPG e PNG, com validação preliminar de até 5 MB.
- A pontuação relativa ao Bolsa Família ainda não é calculada automaticamente; ficará parametrizada quando a SME definir/confirmar a regra oficial.


## DEMO v0.4.7
- Arquivos JS versionados para eliminar cache do GitHub/browser.
- Geocodificação restrita ao município.
- Correspondência forte do logradouro; resultado genérico é rejeitado.
- O resultado mostra 'Motor geográfico v0.4.7' para conferência.


## v0.4.7 — CEP inteligente e fallback territorial
- Preenchimento automático de logradouro e bairro pelo CEP.
- Desativa autocomplete do navegador em logradouro/bairro.
- Geocodificação em três níveis: número/logradouro, logradouro e coordenada aproximada do CEP.
- Resultados aproximados são sinalizados explicitamente.
- Se não houver coordenada confiável, nenhuma escola é sugerida e a inscrição segue para análise territorial da SME.
