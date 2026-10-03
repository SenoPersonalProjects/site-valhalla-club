# Diretrizes de portabilidade entre PostgreSQL e MySQL


## Contexto


**Status:** aprovado como diretriz arquitetural para a Fase 2.


Estas diretrizes consideram o uso de bancos diferentes ao longo do ciclo da aplicação:


```text

Desenvolvimento   → PostgreSQL / Supabase

Homologação       → PostgreSQL / Supabase

Produção          → MySQL / Railway

```


A adoção desse modelo exige cuidados para que desenvolvimento e homologação não passem a depender de comportamentos exclusivos do PostgreSQL que precisem ser redesenhados quando a aplicação chegar à produção.


A diretriz adotada é manter o modelo de negócio equivalente nos dois bancos, permitindo diferenças de implementação física quando elas forem necessárias. Isso inclui migrations, tipos SQL, índices, configuração de conexão e, em alguns casos, consultas específicas.


Como orientação geral, recomenda-se priorizar soluções portáveis e tratar qualquer dependência específica de PostgreSQL ou MySQL de forma explícita, isolada e testável.


Este documento define as diretrizes arquiteturais de portabilidade da camada de dados para a Fase 2. Ele não fixa antecipadamente todo o schema, índices, queries ou detalhes físicos de implementação, que deverão ser definidos conforme as funcionalidades forem implementadas.

As decisões de implementação devem respeitar estas diretrizes, e qualquer exceção relevante deve ser documentada e revisada tecnicamente.


## 1. Estratégia geral


O objetivo é preservar um modelo lógico e um comportamento de negócio equivalentes entre PostgreSQL e MySQL. Não se exige que a implementação física seja idêntica nos dois providers.


Podem existir diferenças em:


- SQL;

- migrations;

- tipos físicos;

- índices;

- configuração de conexão;

- otimizações;

- implementação de consultas específicas.


Sempre que houver uma alternativa portável adequada, recomenda-se que ela seja preferida. Quando uma funcionalidade depender de um comportamento específico do PostgreSQL ou do MySQL, essa diferença deverá ser tratada explicitamente.


O princípio adotado é: **portável por padrão; específico quando houver necessidade comprovada, com isolamento, documentação e validação nos dois providers**.


Essa abordagem busca reduzir conflitos, retrabalho e risco técnico durante a passagem para a produção em MySQL, sem pressupor que as estruturas físicas dos dois bancos serão iguais.


## 2. Identificadores

As principais entidades persistentes devem utilizar identificadores portáveis, gerados pela aplicação ou pelo ORM sem depender de mecanismos específicos do PostgreSQL ou do MySQL.

UUID é a estratégia inicialmente recomendada para as entidades do domínio. No domínio, o identificador deve ser tratado como `String`.

A versão concreta do UUID deverá ser definida durante a implementação do schema, considerando o suporte da versão efetivamente adotada do Prisma, a representação utilizada no PostgreSQL e no MySQL e os requisitos de desempenho.

UUID v7 pode ser adotado caso o suporte da stack utilizada seja validado. Caso contrário, outra variante de UUID portável poderá ser utilizada sem alterar o princípio arquitetural desta diretriz.

Exemplo conceitual, sujeito à validação da versão do Prisma:

```prisma
id String @id @default(uuid())
```

A geração deve ocorrer preferencialmente na aplicação ou no ORM, sem depender de uma função exclusiva do PostgreSQL para produzir o identificador.

Como estratégia principal para entidades do domínio, recomenda-se evitar dependências específicas de provider, como:

- `@db.Uuid` quando seu uso impedir equivalência simples no MySQL;
- `gen_random_uuid()`;
- sequences;
- `SERIAL`;
- `AUTO_INCREMENT` como identidade lógica do domínio.

O uso de UUID facilita a preservação dos identificadores entre providers, a manutenção de Foreign Keys e referências externas e reduz a necessidade de construir mapas de conversão de chaves durante uma migração.

A representação textual é uma escolha voltada à portabilidade e não necessariamente a representação física mais compacta possível.

O uso de UUID não representa autorização, segredo ou controle de acesso. Caso UUID v7 seja adotado, seu componente temporal também significa que o identificador não deve ser considerado completamente opaco quanto à ordem aproximada de criação.

## 3. Datas, horários e recorrência


Instantes concretos devem ser normalizados para UTC. Essa semântica deve ser uma regra da aplicação, e não uma suposição baseada apenas no tipo físico utilizado pelo banco.


O tipo da coluna não deve ser tratado como mecanismo automático de preservação da timezone original. Quando uma regra depender de horário civil, deve ser possível armazenar separadamente a timezone IANA correspondente.


Referências propostas:


- atividades online ou baseadas no horário de Brasília: `America/Sao_Paulo`;

- atividades presenciais em Sergipe: `America/Maceio`.


Quando houver regra de calendário ou recorrência, recomenda-se evitar o uso exclusivo de offsets como `UTC-03:00`. Para recorrências, o modelo lógico precisa preservar:


- horário civil ou local;

- timezone IANA;

- regra de recorrência.


Exemplo conceitual:


```text

horário local + timezone + regra de recorrência

```


Cada ocorrência concreta gerada a partir dessa regra deve ser tratada como um instante e convertida para UTC.


Exemplo conceitual:


```text

startsAt = instante UTC

timezone = America/Maceio

```


Datas civis sem componente de horário devem ser tratadas separadamente de timestamps. Não se recomenda converter artificialmente uma data civil em “meia-noite UTC” apenas para armazená-la em um timestamp.


Strings de apresentação, como `sábado às 19h`, podem existir no frontend ou em DTOs, mas não devem ser a única fonte persistente da agenda.


A timezone armazenada deve utilizar um identificador IANA válido, e a aplicação deve trabalhar com uma base de timezones atualizada.


## 4. Números e valores monetários

> **Escopo:** as orientações sobre valores monetários ficam registradas para funcionalidades futuras, como marketplace, pagamentos ou outros recursos financeiros. Elas não representam implementação financeira prevista para a Fase 2.


Recomenda-se utilizar `Int` para contadores, vagas, limites e quantidades quando o intervalo signed de 32 bits for suficiente.


`BigInt` deve ser reservado para necessidades concretas. Sua adoção também precisa considerar o tipo `BigInt` do JavaScript, a serialização e os contratos JSON expostos pela aplicação.


Valores monetários e demais valores decimais exatos devem utilizar `Decimal`. `Float` e `Double` não devem ser usados para dinheiro.


Uma referência inicial para valores em BRL é:


```prisma

Decimal @db.Decimal(12, 2)

```


Essa precisão serve apenas como ponto de partida, e não como obrigação para todos os campos decimais. Percentuais, taxas e outros valores podem exigir outra escala. A precisão deverá ser revista quando os requisitos de pagamento forem conhecidos.


Operações financeiras devem preservar a semântica decimal. Recomenda-se evitar a conversão prematura de `Decimal` para `number` durante cálculos em JavaScript.


Se uma integração externa trabalhar com centavos, a conversão pode ser feita na fronteira da integração. Isso não exige que todo o domínio adote centavos como sua única representação.


Regras como “o valor não pode ser negativo” devem ser tratadas preferencialmente como regra de domínio ou constraint portável, sem depender de tipos `UNSIGNED` específicos do MySQL.


## 5. Strings, Unicode e normalização


Textos de apresentação devem preservar capitalização, acentos e Unicode.


Exemplos:


```text

João

Híbrida

Crônicas de Aracaju

```


Campos relevantes para identidade, unicidade ou busca não devem depender implicitamente da collation padrão do PostgreSQL ou do MySQL. Os dois bancos podem apresentar comportamentos diferentes quanto a case sensitivity, accent sensitivity, ordenação e unicidade.


Quando uma regra de negócio exigir comparação normalizada, propõe-se controlar na aplicação uma representação canônica apropriada.


Para e-mail, a proposta é:


- tratar a identidade como case-insensitive por regra do produto;

- normalizar o valor na aplicação;

- aplicar unicidade sobre a representação canônica adequada.


Essa orientação não deve ser apresentada como verdade universal do protocolo de e-mail. Trata-se de uma decisão de produto proposta para o Valhalla Club.


Username, slug e campos de pesquisa deverão ter suas políticas definidas junto às respectivas funcionalidades.


É necessário distinguir:


- Unicode normalization;

- lowercase ou case folding;

- remoção de acentos;

- ordenação linguística.


Unicode pode possuir sequências diferentes que representam visualmente o mesmo texto. Quando isso for relevante, a aplicação pode precisar de normalização explícita.


Não se propõe uma regra universal para remover acentos ou normalizar todo texto. O valor destinado à apresentação deve permanecer intacto.


No MySQL, recomenda-se `utf8mb4`. A collation real do ambiente deverá ser conhecida antes da implantação.


Recursos específicos do PostgreSQL, como `citext`, `unaccent` e collations especiais, não devem se tornar a base silenciosa da identidade do domínio quando houver uma alternativa portável adequada.


## 6. Enums e dados configuráveis


Enums são adequados para conjuntos pequenos, fechados, estáveis e controlados pelo código. `TableMode` é um exemplo conceitual.


Valores lógicos:


```text

ONLINE

IN_PERSON

HYBRID

```


Labels de apresentação:


```text

Online

Presencial

Híbrida

```


Recomenda-se persistir identificadores técnicos estáveis, e não os labels traduzidos utilizados na interface.


A ordem física de enums no PostgreSQL ou no MySQL não deve representar regras de negócio. Se houver ordenação de estados, ela deve ser definida pelo domínio.


Dados configuráveis ou que possam crescer devem ser considerados como entidades. Isso se aplica, por exemplo, a:


- sistemas de RPG;

- tags;

- categorias;

- catálogos.


O `TableStatus` atual do frontend mistura dimensões diferentes. `open` representa disponibilidade de inscrição, enquanto `scheduled`, `ongoing`, `closed` e `cancelled` representam conceitos ligados ao ciclo de vida.


Um modelo persistente futuro deve considerar essas dimensões separadamente.


Exemplo conceitual possível:


```text

lifecycleStatus = ONGOING

registrationOpen = true

```


Este documento não fixa o conjunto final de valores do ciclo de vida e não determina se a disponibilidade será representada por boolean, enum ou outro estado. Essa decisão deverá acompanhar a implementação da funcionalidade.


Um enum restringe valores permitidos, mas não implementa sozinho uma máquina de transição de estados. As transições válidas continuam sendo responsabilidade da aplicação e do domínio.


Também não se recomenda transformar toda union TypeScript em enum de banco. `TableArtwork`, por exemplo, é atualmente uma escolha de apresentação da interface e não deve ser persistido como enum apenas porque existe como union type no frontend.


Tipos gerados pelo Prisma não devem ser importados diretamente pelo frontend como contrato público apenas por conveniência.


## 7. Relações, arrays e JSON


Arrays presentes em DTOs ou componentes não implicam arrays físicos no banco.


Exemplos atuais:


```ts

players?: readonly string[];

tags: readonly string[];

```


Um array retornado pela API ou utilizado no frontend pode ser construído a partir de relações persistidas normalmente.


É necessário distinguir uma scalar list de uma relation list no Prisma. Uma relation list não representa necessariamente um array nativo no banco.


Arrays escalares nativos do PostgreSQL não devem servir como base do domínio persistente quando o MySQL não oferecer uma estratégia equivalente.


A participação de usuários deve ser modelada conceitualmente como relação:


```text

User

  ↓

TableParticipation

  ↓

Table

```


Tags também devem ser tratadas como entidades e relações:


```text

Table

  ↓

TableTag

  ↓

Tag

```


A relação poderá ser implícita ou explícita no Prisma. Essa escolha não deve ser fechada antes de se saber se a relação precisará armazenar metadata própria.


Sistemas de RPG devem ser considerados dados de catálogo ou entidades, e não obrigatoriamente enum ou string solta.


O modelo atual:


```ts

seats: {

  filled: number;

  total?: number;

}

```


não implica que os dois valores serão colunas persistentes. `total` pode representar a capacidade armazenada, enquanto `filled` pode ser derivado das participações consideradas válidas. Isso evita manter duas fontes de verdade.


O objeto de imagem utilizado atualmente pelo frontend também não implica armazenamento em JSON. No futuro, ele pode ser representado por colunas, entidade de mídia, outra modelagem ou JSON, caso exista justificativa.


`Json` pode ser adequado para:


- metadata verdadeiramente variável;

- snapshots;

- payloads de integração;

- estruturas semiestruturadas.


Todo uso relevante de `Json` deve possuir uma justificativa ligada à natureza do dado.


Quando os elementos internos precisarem de identidade própria, Foreign Keys, unicidade, relacionamentos, constraints, ordenação ou filtragem frequente, uma modelagem relacional tende a ser mais adequada.


JSON não deve ser usado apenas para evitar joins ou simplificar inicialmente o schema. IDs que deveriam possuir integridade relacional não devem ser armazenados dentro de JSON sem necessidade.


Regras centrais da aplicação não devem depender de operadores JSON exclusivos do PostgreSQL ou do MySQL sem uma estratégia equivalente para o outro provider.


## 8. Prisma e SQL específico


Prisma Client é o caminho padrão adotado para operações comuns.


Hierarquia recomendada:


```text

Prisma Client

      ↓

mecanismo tipado suportado pelo Prisma

      ↓

SQL direto parametrizado

      ↓

implementação específica do provider

```


SQL direto pode ser utilizado quando:


- o ORM não representa adequadamente a necessidade;

- existe uma consulta complexa;

- existe um requisito de desempenho comprovado;

- a abstração comum deixou de ser adequada.


O Prisma reduz o acoplamento ao provider, mas não torna PostgreSQL e MySQL idênticos.


Diferenças específicas devem permanecer isoladas na camada de persistência ou infraestrutura. Condicionais de PostgreSQL e MySQL não devem ser espalhadas por controllers, regras de domínio, serviços de negócio, contratos públicos ou frontend.


Raw SQL deve ser parametrizado. Input não confiável não deve ser concatenado em comandos SQL, e APIs `Unsafe` devem ser tratadas como último recurso.


Um mecanismo SQL tipado, caso exista na versão do Prisma utilizada, pode melhorar a type safety, mas ainda poderá conter SQL específico de cada dialect.


Cada uso de `@db.\*` deve ser avaliado individualmente.


Exemplo com semântica equivalente:


```text

Decimal(12,2)

```


Exemplos que exigem análise adicional:


- `@db.Uuid`;

- `@db.Citext`;

- `Unsupported(...)`;

- `dbgenerated(...)`;

- extensões;

- funções específicas;

- SQL específico;

- operadores JSON específicos;

- índices específicos.


Não se recomenda criar antecipadamente uma duplicação completa de repositories para PostgreSQL e MySQL. Apenas as partes que apresentarem divergência real devem ser isoladas.


Antes da instalação do Prisma, será necessário verificar qual versão possui suporte estável e adequado tanto para PostgreSQL quanto para MySQL. A versão `latest` não deve ser adotada automaticamente sem essa validação.


Se não houver uma única versão com suporte adequado aos dois providers no momento da implementação, a escolha do ORM, da versão ou da própria estratégia de portabilidade deverá voltar para avaliação da liderança técnica.


A escolha da versão é uma decisão de implementação e poderá mudar conforme a evolução do Prisma.


## 9. Integridade e índices


As diretrizes consideram Foreign Keys reais nos dois bancos. A validação da aplicação e a proteção do banco possuem responsabilidades complementares.


A aplicação:


- valida regras;

- produz mensagens adequadas;

- controla o comportamento.


O banco:


- protege invariantes estruturais;

- mantém proteção contra concorrência, bugs, scripts e acessos fora do fluxo normal.


A nulabilidade deve refletir o domínio. `NULL` não deve ser adotado apenas para facilitar o desenvolvimento.


Constraints de unicidade devem representar invariantes reais. Um exemplo futuro, caso a regra de participação continue válida, seria:


```prisma

@@unique([tableId, userId])

```


Identificadores canônicos, como um e-mail normalizado, podem possuir constraint de unicidade própria.


Primary Keys e Unique Constraints já criam estruturas de índice. Não se recomenda adicionar outro índice idêntico sem necessidade.


PostgreSQL e MySQL não possuem comportamento idêntico quanto à indexação de Foreign Keys. Índices relevantes para os caminhos de consulta devem ser planejados explicitamente, sem depender de comportamento automático do engine.


A ordem de um índice composto é significativa. Por exemplo:


```prisma

@@unique([tableId, userId])

```


pode atender consultas cujo prefixo relevante começa por `tableId`. Isso não significa que consultas somente por `userId` terão o mesmo caminho eficiente.


Se a aplicação precisar consultar frequentemente as participações de um usuário, pode ser necessário:


```prisma

@@unique([tableId, userId])

@@index([userId])

```


Esse é apenas um exemplo conceitual. Os índices finais devem ser definidos a partir das consultas reais. Não se recomenda criar índices preventivamente em todas as colunas.


Ações referenciais precisam ser analisadas relação por relação. `Cascade` não deve ser tratado como padrão global.


Conforme a semântica da relação e o suporte equivalente, podem ser considerados:


- `Cascade`;

- `Restrict`;

- `NoAction`;

- `SetNull`.


`SetNull` somente é coerente com uma Foreign Key nullable. Ações com comportamentos diferentes entre PostgreSQL e MySQL exigem avaliação explícita.


`CHECK` pode ser considerado quando oferecer proteção concreta. Entretanto, não se propõe utilizá-lo como fundamento da arquitetura quando sua representação exigir customização adicional de migration ou não estiver adequadamente coberta pela versão do Prisma adotada.


Regras complexas de negócio continuam na aplicação. Constraints do banco podem complementar essa proteção quando fizer sentido.


O número de vagas ocupadas, por exemplo, pode ser derivado das participações. Uma regra baseada na contagem de várias linhas não se reduz a um `CHECK` de coluna.


Índices específicos do PostgreSQL, incluindo GIN, GiST, BRIN e partial indexes, não devem se tornar requisito silencioso de uma funcionalidade sem uma estratégia equivalente no MySQL.


## 10. Migrations


PostgreSQL e MySQL devem ser tratados como providers com históricos próprios de migration. SQL de migration gerado para PostgreSQL não deve ser executado diretamente em MySQL.


A equivalência esperada é do estado lógico, e não do SQL físico.


```text

MODELO LÓGICO

     │

     ├── migrations PostgreSQL

     │

     └── migrations MySQL

```


Enquanto apenas PostgreSQL estiver sendo usado em desenvolvimento e homologação, seu histórico poderá evoluir normalmente.


Quando o MySQL for introduzido pela primeira vez, poderá ser criada uma migration inicial correspondente ao estado lógico naquele momento. Não será necessário converter e reproduzir toda a história anterior do PostgreSQL.


Exemplo:


```text

PostgreSQL:

001

002

003

...

027


MySQL:

001_initial

```


Se o banco MySQL estiver vazio, a migration inicial deverá efetivamente construir o schema.


Esse caso não deve ser confundido com o mecanismo formal de marcar uma migration como aplicada em um banco que já possui a estrutura. Se o banco já existir estruturalmente quando o Prisma Migrate for introduzido, poderá ser necessário um processo formal de baselining.


Depois que o MySQL fizer parte da produção normal, cada mudança estrutural deverá possuir evolução equivalente nos dois providers.


```text

nova mudança lógica

      ↓

migration PostgreSQL

migration MySQL

```


IDs, números ou timestamps das migrations não precisam coincidir. O estado lógico final precisa ser equivalente.


Migrations já aplicadas devem ser tratadas como imutáveis. Correções devem produzir novas migrations; uma migration histórica aplicada não deve ser alterada para “corrigir” o passado.


Customizações manuais feitas em migrations PostgreSQL não serão reproduzidas automaticamente no MySQL. Toda customização relevante deverá possuir:


- justificativa;

- estratégia equivalente;

- documentação;

- teste.


Durante o desenvolvimento, deve ser utilizado o mecanismo de criação e revisão de migrations apropriado à versão do Prisma adotada. `migrate dev`, caso ainda seja o comando aplicável nessa versão, pertence ao ambiente de desenvolvimento.


Homologação e produção devem aplicar migrations previamente versionadas por meio de um mecanismo não destrutivo de deploy. Quando a infraestrutura existir, recomenda-se que a aplicação das migrations de release faça parte do CI/CD.


Criar ou editar migrations diretamente no ambiente implantado não deve fazer parte do fluxo normal. `db push` também não deve ser utilizado para evolução de produção.


Schema migration é diferente da migração de dados entre PostgreSQL e MySQL. Também é diferente de um eventual backfill necessário durante uma alteração normal de schema.


Embora os providers possam exigir históricos, configurações e adapters diferentes, recomenda-se evitar a manutenção manual de dois modelos de domínio independentes quando houver uma estratégia mais segura e com menor duplicação.


A organização física de schemas, `prisma.config`, clients, diretórios e migrations deverá ser prototipada quando o Prisma for introduzido. Esta proposta não congela uma estrutura de diretórios que ainda não foi validada.


## 11. Configuração por ambiente


Adota-se `DATABASE_URL` como interface principal de conexão da aplicação.


```env

DATABASE_URL=...

```


O valor seria uma URL PostgreSQL em desenvolvimento e homologação e uma URL MySQL em produção. O nome representa o papel da configuração, e não o fornecedor.


Recomenda-se evitar que nomes como `SUPABASE_DATABASE_URL` ou `MYSQL_DATABASE_URL` sejam espalhados pelo domínio quando `DATABASE_URL` puder representar a dependência principal.


O uso do mesmo nome de variável não significa que a troca do valor de `DATABASE_URL` seja suficiente para trocar o provider. O Prisma declara o provider de forma explícita, e a configuração, o schema ou o client correspondente também deverá ser selecionado no build ou no bootstrap de infraestrutura.


Controllers e regras de negócio não devem alterar comportamento com base em `NODE_ENV`, no protocolo da URL ou no nome do provider.


Diferenças inevitáveis devem permanecer no bootstrap e na configuração da infraestrutura. Uma interface externa única de configuração não implica bootstrap técnico idêntico.


A versão do Prisma adotada poderá exigir drivers PostgreSQL e MySQL, adapters diferentes ou configurações distintas. Essas diferenças devem permanecer isoladas na infraestrutura.


Caso migrations precisem de uma conexão diferente da utilizada em runtime, poderá ser adotada:


```env

MIGRATION_DATABASE_URL=...

```


O nome representa a função da conexão, e não necessariamente o fato de ela ser direta.


Se o fluxo de desenvolvimento do Prisma exigir uma shadow database dedicada, poderá ser adotada:


```env

SHADOW_DATABASE_URL=...

```


A shadow database nunca deve apontar para a mesma base principal. Ela é uma preocupação de desenvolvimento e das ferramentas de migration, e não uma variável necessária em produção por padrão.


Para uma API NestJS persistente conectada ao Supabase, recomenda-se considerar preferencialmente conexão direta ou session pooling, conforme a infraestrutura de rede disponível.


Transaction pooling deve ser reservado para workloads que justifiquem esse modelo, como aplicações serverless ou efêmeras. Caso seja necessário, as restrições da versão atual da stack devem ser verificadas, inclusive quanto ao uso de prepared statements.


No Railway, o serviço MySQL pode fornecer variáveis específicas da plataforma, como `MYSQL_URL`. A aplicação pode mapear esse valor para `DATABASE_URL` por meio do mecanismo de reference variables da plataforma.


Quando a API e o MySQL estiverem no mesmo ambiente Railway, recomenda-se utilizar a rede privada quando a infraestrutura permitir. O banco não deve ser exposto publicamente apenas para permitir a conexão da aplicação.


Credenciais reais não devem ser versionadas no Git. Quando essa camada for implementada, `.env.example` deve conter somente placeholders seguros.


Também será necessário:


- validar as variáveis obrigatórias durante o startup;

- falhar com uma mensagem clara quando faltar uma configuração crítica;

- evitar fallback silencioso para outro banco.


Parâmetros como TLS, pool size, timeout, charset e demais connection options pertencem à infraestrutura e deverão ser avaliados na implementação real.


## 12. Testes de portabilidade

### Escopo da Fase 2

A execução automatizada completa da suíte de persistência em PostgreSQL e MySQL é uma evolução desejável da estratégia de portabilidade, mas não é requisito para iniciar a implementação da Fase 2.

Nesta fase, os requisitos mínimos são:

- manter schema, regras de domínio e acesso a dados portáveis por padrão;
- identificar e documentar qualquer recurso específico de provider;
- evitar dependências desnecessárias de PostgreSQL;
- validar a aplicação em PostgreSQL durante desenvolvimento e homologação;
- realizar uma prova completa de migração PostgreSQL → MySQL antes da decisão de produção.

Quando existirem schema, migrations, repositories e testes de integração maduros, o CI dual-provider poderá ser introduzido como camada adicional de segurança.


Quando a persistência existir, portabilidade deverá ser tratada como propriedade verificável.


Testes independentes de banco deverão ser executados uma vez. Isso inclui, por exemplo:


- unit tests puros;

- funções de domínio;

- frontend;

- lint;

- build que não dependa do provider.


Testes que exercitem persistência deverão ser executados em PostgreSQL e MySQL. Isso inclui:


- repositories;

- queries;

- constraints;

- migrations;

- Foreign Keys;

- ações referenciais;

- persistência de tipos;

- JSON, quando utilizado;

- raw SQL;

- comportamento dependente do provider.


A mesma suíte de comportamento deve ser executada nos dois providers. É aceitável utilizar bootstraps diferentes, mas não alterar a expectativa de negócio apenas para fazer cada provider passar.


Estratégia conceitual:


```text

PostgreSQL vazio

        ↓

migrations PostgreSQL

        ↓

mesma suíte


MySQL vazio

        ↓

migrations MySQL

        ↓

mesma suíte

```


Recomenda-se utilizar bancos temporários, isolados, descartáveis e executados em containers ou service containers.


O Supabase real de homologação e o MySQL de produção no Railway não devem ser os ambientes principais da suíte automatizada de Pull Requests.


Cada execução deve começar com um banco vazio e reconstruir o schema a partir do histórico do respectivo provider. Isso valida migrations antigas, reprodutibilidade e a ausência de dependência do banco pessoal de um desenvolvedor.


As versões dos engines no CI devem ser fixadas. Não se recomenda utilizar `latest`.


Essas versões devem permanecer tão próximas quanto possível das versões efetivamente usadas pelo Supabase e pelo Railway. A versão real deverá ser confirmada quando os ambientes existirem.


Configurações que alteram semântica também precisam ser avaliadas. No MySQL, por exemplo, `sql_mode`, charset, collation e timezone podem modificar o comportamento. Quando forem relevantes, o container de CI deverá se aproximar da configuração de produção.


Os testes devem cobrir especialmente:


- UUID;

- datas;

- UTC;

- timezone;

- Decimal;

- normalização textual;

- unicidade;

- Unicode;

- enums;

- Foreign Keys;

- relações;

- ações referenciais;

- nullability;

- JSON;

- SQL específico;

- migrations.


Quando o CI dual-provider existir, uma mudança que afete schema, migrations, repositories, queries, constraints ou persistência só deverá ser considerada tecnicamente apta depois da validação nos dois providers.


Containers validam principalmente a compatibilidade com os engines. Eles não reproduzem integralmente Supabase, Supavisor, Railway, rede, TLS, DNS ou limites das plataformas.


Depois do deployment, smoke tests menores poderão validar se:


- a API sobe;

- existe conectividade;

- o banco responde;

- a configuração principal está correta.


Esta tarefa não inclui a criação de workflow. O CI dual-provider só deverá ser implementado quando existirem Prisma, schemas e configurações reais, migrations, camada de persistência e testes de integração efetivos.


## 13. Migração futura dos dados


Migração de dados é diferente de migration de schema.


Antes da primeira carga produtiva, os dados existentes deverão ser classificados em:


1\. dados descartáveis de teste;

2\. dados de referência reproduzíveis por seed;

3\. dados reais que precisam ser preservados.


Dados de teste podem ser descartados. Dados de referência devem ser preferencialmente reproduzidos por seed quando isso fizer sentido. Dados reais exigem migração controlada.


`pg_dump` ou outro dump PostgreSQL pode ser usado como backup, export ou ponto de recuperação. Ele não deve ser tratado como um arquivo diretamente importável no MySQL.


A migração entre providers deverá utilizar um processo de ETL controlado. Entre os mecanismos que poderão ser considerados futuramente estão:


- CSV;

- JSON;

- NDJSON;

- script TypeScript;

- outra representação neutra.


A ferramenta não deve ser escolhida antes de se conhecer o schema real, o volume e os requisitos operacionais.


Os UUIDs devem ser preservados durante a migração. Recomenda-se evitar a geração de novos IDs e a construção de mapas de chave sem necessidade.


Também deverão ser preservados:


- Foreign Keys;

- relações;

- instantes UTC;

- valores Decimal exatos;

- enums;

- campos canônicos;

- demais invariantes do domínio.


Valores financeiros não devem ser convertidos para `number` durante o ETL se essa conversão puder causar perda de precisão.


A carga deve respeitar as dependências relacionais.


Exemplo conceitual:


```text

entidades pai

      ↓

entidades dependentes

      ↓

relações intermediárias

```


Desabilitar Foreign Keys não deve ser a estratégia padrão de importação. Se isso for excepcionalmente necessário por volume ou estratégia operacional, a ação precisará ser controlada e seguida de validação completa.


O processo deve ser determinístico, versionado e repetível. Nesse contexto, repetível significa:


```text

destino limpo

+ mesma origem

+ mesma versão do processo

= mesmo resultado esperado

```


Isso não significa necessariamente executar várias vezes os mesmos inserts sobre um banco já populado.


Scripts e regras de transformação poderão ser versionados no Git quando forem implementados. Dados reais exportados não devem ser versionados.


Antes do corte definitivo, deve ser realizado pelo menos um ensaio completo:


```text

MySQL vazio

      ↓

migrations MySQL

      ↓

extração

      ↓

transformação

      ↓

carga

      ↓

validação

```


A validação não deve se limitar à contagem de registros. Quando aplicável, deverá verificar:


- quantidade de registros;

- conjuntos de UUIDs;

- registros ausentes;

- registros extras;

- duplicidades;

- Foreign Keys;

- integridade referencial;

- datas;

- UTC;

- Decimal;

- enums;

- valores normalizados;

- outras invariantes críticas.


Checksums ou hashes poderão ser considerados futuramente se o volume justificar, mas não são requisito desta fase.


Antes da migração final, será necessário manter um backup consistente da origem, definir uma janela controlada e impedir ou controlar alterações que não sejam capturadas pela extração final.


Não se propõe introduzir CDC, replicação contínua ou dual-write sem requisito real.


Como PostgreSQL e Supabase inicialmente não seriam usados em produção, uma janela de corte controlada tende a ser uma alternativa proporcionalmente mais simples. Se futuramente o sistema não puder aceitar essa janela, a estratégia deverá ser reavaliada.


Supabase Auth, Storage, Realtime, Vault e outros serviços gerenciados não estão automaticamente cobertos pela migração das tabelas da aplicação. Caso sejam adotados, cada recurso precisará de uma estratégia própria de portabilidade.


## 14. Recursos específicos de provider


Portabilidade não significa exigir SQL idêntico. Diferenças físicas entre PostgreSQL e MySQL são esperadas.


Uma exceção relevante ocorre quando uma funcionalidade passa a depender de um recurso específico de provider.


A especialização pode ser considerada quando:


- existe um requisito técnico ou de negócio concreto;

- uma alternativa portável adequada foi avaliada;

- a alternativa portável é insuficiente;

- existe estratégia equivalente para o outro provider;

- a diferença pode ser isolada;

- as migrations podem ser tratadas adequadamente;

- testes podem comprovar a equivalência.


Uma exceção deve registrar:


- requisito atendido;

- alternativa portável avaliada;

- motivo da insuficiência;

- implementação PostgreSQL;

- implementação MySQL;

- localização do isolamento;

- impacto nas migrations;

- testes responsáveis por comprovar equivalência;

- condição futura de remoção, quando aplicável.


Equivalência significa comportamento funcional equivalente. Não significa SQL, índice, plano de execução ou tempo de resposta exatamente iguais. Os dois providers, entretanto, precisam atender aos requisitos técnicos e de produto.


Uma funcionalidade que dependa de implementação específica de provider só deverá ser considerada tecnicamente concluída quando existir uma estratégia equivalente para o outro provider, validação adequada e testes de comportamento equivalentes.


Mudanças que introduzam dependência específica de PostgreSQL ou MySQL devem ser identificadas explicitamente na Pull Request e submetidas à revisão técnica.


Sinais que devem iniciar uma avaliação de portabilidade incluem:


- raw SQL específico;

- `@db.\*` exclusivo;

- `Unsupported(...)`;

- `dbgenerated(...)`;

- extensão;

- trigger;

- view;

- stored procedure;

- função nativa;

- índice específico;

- operador JSON específico.


Esses recursos não são automaticamente proibidos, mas exigem análise explícita.


A exceção deve permanecer pequena e isolada. Não se recomenda duplicar toda a camada de persistência quando apenas uma consulta precisa de especialização.


Se uma funcionalidade essencial só puder ser implementada em PostgreSQL e não existir uma estratégia viável no MySQL, isso não deve ser tratado como uma exceção comum. Nesse caso, será necessário reavaliar o desenho da funcionalidade ou a própria estratégia arquitetural de bancos, principalmente porque o MySQL é o provider previsto para produção.


A mesma regra vale no sentido inverso. Se uma funcionalidade essencial depender de um recurso MySQL que torne desenvolvimento e homologação em PostgreSQL pouco representativos, a estratégia também deverá ser reavaliada.


Uma exceção de portabilidade não elimina requisitos de segurança, parametrização, integridade, migrations e testes.


Quando uma exceção existir somente por limitação temporária do Prisma, ORM, driver ou outra ferramenta, poderá ser registrada a condição que permitiria removê-la no futuro.


## Estado atual

Estas diretrizes tratam da camada de persistência planejada para a Fase 2 e estão aprovadas para orientar sua implementação.

No estado atual do projeto:

- o Supabase de homologação já foi provisionado com PostgreSQL;
- a API de homologação já foi provisionada no Render;
- a `DATABASE_URL` do ambiente de homologação já está configurada no Render;
- Prisma ainda não está integrado à `develop`;
- ainda não existe `schema.prisma` consolidado na `develop`;
- ainda não existem migrations persistentes da Fase 2 na `develop`;
- a conexão real da aplicação com o PostgreSQL via Prisma ainda precisa ser validada;
- a API mantém sua base NestJS e as rotas `/` e `/health`;
- a landing institucional continua sem depender da API em runtime.

Autenticação, usuários persistentes, campanhas, sessões, one-shots, feedbacks, reports, advertências e sanções ainda serão implementados ao longo da Fase 2.

PostgreSQL/Supabase permanece como ambiente de desenvolvimento e homologação, enquanto MySQL/Railway continua sendo o destino planejado para produção, sujeito à prova de migração e à avaliação final de capacidade e custo.

A aprovação destas diretrizes não significa que a camada de persistência já esteja implementada. Mudanças relevantes nesta estratégia devem ser registradas documentalmente e submetidas à revisão técnica.

