# Nostr Hackathon Badges

Esta especificacion define como La Crypta publica el catalogo de badges
disponibles para una hackaton y como cada badge apunta a su definicion NIP-58.

## Objetivo

Cada hackaton tiene un catalogo versionado de badges. Ese catalogo debe ser un
evento reemplazable en Nostr para que se pueda actualizar sin crear multiples
fuentes de verdad.

El catalogo no otorga badges por si mismo. Solo declara que badges existen,
a que categoria pertenecen y cual es la definicion NIP-58 que debe usarse al
otorgarlos.

## Eventos usados

- Catalogo de badges: `kind: 30078`, evento parametrizado reemplazable.
- Definicion de badge: `kind: 30009`, NIP-58 Badge Definition.
- Otorgamiento de badge: `kind: 8`, NIP-58 Badge Award.
- Perfil de badges del usuario: `kind: 30008`, NIP-58 Profile Badges.

## Catalogo

El catalogo se publica como `kind: 30078` por la pubkey oficial de publicacion
de La Crypta. Esa pubkey se deriva server-side desde `LACRYPTA_NSEC`.
Debe tener un tag `d` estable:

```json
["d", "lacrypta.dev:hackathon-badges:<hackathon-id>"]
```

Ejemplo para Commerce:

```json
["d", "lacrypta.dev:hackathon-badges:commerce"]
```

### Tags requeridos

```json
[
  ["d", "lacrypta.dev:hackathon-badges:commerce"],
  ["client", "La Crypta Dev"],
  ["hackathon", "commerce"],
  ["schema", "lacrypta.dev/hackathon-badges", "1"],
  ["title", "Badges Commerce"],
  ["a", "30009:<issuer-pubkey>:lacrypta.dev:badge:commerce:rank-1"],
  ["a", "30009:<issuer-pubkey>:lacrypta.dev:badge:commerce:rank-2"]
]
```

Los tags `a` son un indice rapido de todas las definiciones NIP-58 usadas por
el catalogo. La informacion completa vive en `content`.

### Content

`content` debe ser JSON valido. `version` versiona el schema, no el evento. La
ultima version del evento se obtiene por `(kind, pubkey, d)`.

```json
{
  "version": 1,
  "hackathon": "commerce",
  "title": "Badges Commerce",
  "categories": [
    {
      "id": "ranking",
      "label": "Ranking",
      "description": "Badges por posicion final."
    }
  ],
  "badges": [
    {
      "id": "rank-1",
      "category": "ranking",
      "definition": "30009:<issuer-pubkey>:lacrypta.dev:badge:commerce:rank-1",
      "name": "1er Puesto",
      "description": "Proyecto ganador de la hackaton.",
      "criteria": {
        "type": "rank",
        "position": 1
      }
    }
  ]
}
```

### Campos de categoria

- `id`: identificador estable en kebab-case.
- `label`: nombre visible.
- `description`: descripcion corta opcional.

Categorias iniciales:

```json
[
  { "id": "ranking", "label": "Ranking" },
  { "id": "favorites", "label": "Favoritos" },
  { "id": "specials", "label": "Especiales" },
  { "id": "streaks", "label": "Rachas" }
]
```

### Campos de badge

- `id`: identificador estable dentro de la hackaton.
- `category`: `id` de una categoria declarada en `categories`.
- `definition`: a-tag de la definicion NIP-58 (`30009:<issuer>:<d>`).
- `name`: nombre visible.
- `description`: descripcion visible.
- `criteria`: objeto que describe la regla de asignacion.
- `image`: opcional; URL de imagen del badge, si se quiere duplicar desde la
  definicion para render rapido.
- `thumb`: opcional; thumbnail del badge.

`definition` es obligatorio y debe apuntar a un evento `kind: 30009` publicado
por la pubkey emisora oficial.

## Definiciones NIP-58

Cada badge del catalogo debe tener una definicion NIP-58 independiente:

```json
{
  "kind": 30009,
  "pubkey": "<issuer-pubkey>",
  "content": "",
  "tags": [
    ["d", "lacrypta.dev:badge:commerce:rank-1"],
    ["name", "1er Puesto"],
    ["description", "Proyecto ganador de Commerce."],
    ["image", "https://lacrypta.dev/badges/commerce/rank-1.png"],
    ["thumb", "https://lacrypta.dev/badges/commerce/rank-1-thumb.png"]
  ]
}
```

El `d` de cada definicion debe seguir esta forma:

```txt
lacrypta.dev:badge:<hackathon-id>:<badge-id>
```

Ejemplo:

```txt
lacrypta.dev:badge:commerce:great-pitch
```

## Badges iniciales

```json
[
  {
    "id": "rank-1",
    "category": "ranking",
    "name": "1er Puesto",
    "criteria": { "type": "rank", "position": 1 }
  },
  {
    "id": "rank-2",
    "category": "ranking",
    "name": "2do Puesto",
    "criteria": { "type": "rank", "position": 2 }
  },
  {
    "id": "rank-3",
    "category": "ranking",
    "name": "3er Puesto",
    "criteria": { "type": "rank", "position": 3 }
  },
  {
    "id": "top-6",
    "category": "ranking",
    "name": "Podio (top 6)",
    "criteria": { "type": "rank-range", "min": 1, "max": 6 }
  },
  {
    "id": "favorite-gorilatron",
    "category": "favorites",
    "name": "Favorito de Gorilatron",
    "criteria": { "type": "manual", "juror": "gorilatron" }
  },
  {
    "id": "favorite-gorilator",
    "category": "favorites",
    "name": "Favorito de Gorilator",
    "criteria": { "type": "manual", "juror": "gorilator" }
  },
  {
    "id": "favorite-claudio",
    "category": "favorites",
    "name": "Favorito de Claudio",
    "criteria": { "type": "manual", "juror": "claudio" }
  },
  {
    "id": "viability",
    "category": "specials",
    "name": "Premio a la viabilidad",
    "criteria": { "type": "manual" }
  },
  {
    "id": "beautiful-ui",
    "category": "specials",
    "name": "Hermoso UI",
    "criteria": { "type": "manual" }
  },
  {
    "id": "great-pitch",
    "category": "specials",
    "name": "Tremendo Pitch",
    "criteria": { "type": "manual" }
  },
  {
    "id": "first-submit",
    "category": "specials",
    "name": "Primer submit",
    "criteria": { "type": "first-submit" }
  },
  {
    "id": "streak-2",
    "category": "streaks",
    "name": "2 hackatons al hilo",
    "criteria": { "type": "streak", "count": 2 }
  },
  {
    "id": "streak-3",
    "category": "streaks",
    "name": "3 hackatons al hilo",
    "criteria": { "type": "streak", "count": 3 }
  },
  {
    "id": "streak-4",
    "category": "streaks",
    "name": "4 hackatons al hilo",
    "criteria": { "type": "streak", "count": 4 }
  },
  {
    "id": "streak-5",
    "category": "streaks",
    "name": "5 hackatons al hilo",
    "criteria": { "type": "streak", "count": 5 }
  }
]
```

## Ejemplo completo de catalogo

```json
{
  "kind": 30078,
  "pubkey": "<issuer-pubkey>",
  "content": "{\"version\":1,\"hackathon\":\"commerce\",\"title\":\"Badges Commerce\",\"categories\":[{\"id\":\"ranking\",\"label\":\"Ranking\"},{\"id\":\"favorites\",\"label\":\"Favoritos\"},{\"id\":\"specials\",\"label\":\"Especiales\"},{\"id\":\"streaks\",\"label\":\"Rachas\"}],\"badges\":[{\"id\":\"rank-1\",\"category\":\"ranking\",\"definition\":\"30009:<issuer-pubkey>:lacrypta.dev:badge:commerce:rank-1\",\"name\":\"1er Puesto\",\"description\":\"Proyecto ganador de Commerce.\",\"criteria\":{\"type\":\"rank\",\"position\":1}}]}",
  "tags": [
    ["d", "lacrypta.dev:hackathon-badges:commerce"],
    ["client", "La Crypta Dev"],
    ["hackathon", "commerce"],
    ["schema", "lacrypta.dev/hackathon-badges", "1"],
    ["title", "Badges Commerce"],
    ["a", "30009:<issuer-pubkey>:lacrypta.dev:badge:commerce:rank-1"]
  ]
}
```

## Otorgamiento

Para otorgar un badge se publica un `kind: 8` NIP-58 Badge Award. El award debe
referenciar:

- La definicion NIP-58 con tag `a`.
- El receptor con tag `p`.
- La hackaton con tag `hackathon`.
- El proyecto, si aplica, con tag `project`.
- El badge id con tag `badge`.

Ejemplo:

```json
{
  "kind": 8,
  "pubkey": "<issuer-pubkey>",
  "content": "1er Puesto Commerce: Cursats",
  "tags": [
    ["a", "30009:<issuer-pubkey>:lacrypta.dev:badge:commerce:rank-1"],
    ["p", "<recipient-pubkey>"],
    ["hackathon", "commerce"],
    ["project", "cursats"],
    ["badge", "rank-1"],
    ["category", "ranking"]
  ]
}
```

Desde `/badges`, cada badge del catalogo abre un modal con:

- la definicion publicada `kind: 30009`, formateada como JSON;
- los owners actuales, leidos desde awards `kind: 8` que tienen `#a` apuntando
  a esa definicion;
- un flujo admin para otorgar el badge a uno o multiples usuarios.

El flujo admin permite seleccionar soldados con pubkey Nostr, o agregar un
receptor resolviendo un `nip05`. El backend no acepta pubkeys libres sin firma
admin: el browser primero firma un request efimero y luego el backend firma los
awards oficiales con `LACRYPTA_NSEC`.

Endpoint:

```txt
POST /api/hackathon-badges/award
```

Body:

```json
{
  "hackathonId": "zaps",
  "badge": {
    "id": "rank-1",
    "definition": "30009:<issuer-pubkey>:lacrypta.dev:badge:zaps:rank-1"
  },
  "recipients": [
    {
      "pubkey": "<recipient-pubkey>",
      "name": "Builder",
      "nip05": "builder@example.com"
    }
  ],
  "request": "<signed kind 27235 event>"
}
```

El request `kind: 27235` debe incluir tags:

```json
[
  ["action", "award-hackathon-badge"],
  ["hackathon", "zaps"],
  ["badge", "rank-1"],
  ["a", "30009:<issuer-pubkey>:lacrypta.dev:badge:zaps:rank-1"],
  ["p", "<recipient-pubkey>"]
]
```

El backend devuelve los `kind: 8` firmados. El browser los publica en los relays
de datos y vuelve a leer owners desde Nostr.

## Reglas de lectura

1. Buscar el ultimo evento `kind: 30078` por `(pubkey oficial, d)`.
2. Parsear `content` como JSON.
3. Validar que cada `badge.category` exista en `categories`.
4. Resolver cada `badge.definition` buscando su evento `kind: 30009`.
5. Mostrar solo badges con definicion resuelta o marcarlos como incompletos.
6. Para awards, buscar `kind: 8` con `#p` del usuario y cruzar el tag `a` con
   las definiciones del catalogo.

## Bootstrap

Si el catalogo no existe en Nostr, el frontend puede mostrar un boton
`Bootstrap` solo al admin logueado. Ese admin es la pubkey configurada en
`NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB`. Es publica y no firma los eventos oficiales:
solo firma el request efimero que autoriza al backend a devolver eventos ya
firmados.

Flujo:

1. El admin (`NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB`) firma un request Nostr efimero
   `kind: 27235`.
2. El frontend envia ese request a `/api/hackathon-badges/bootstrap`.
3. El backend verifica firma, pubkey y tags del request.
4. El backend genera y firma con `LACRYPTA_NSEC`:
   - una definicion `kind: 30009` por cada badge default;
   - un catalogo `kind: 30078` que linkea todas esas definiciones.
5. El backend devuelve los eventos firmados.
6. El frontend publica esos eventos en los relays de datos.
7. El frontend vuelve a leer el catalogo desde Nostr.

El backend nunca publica directo a relays en este flujo. Solo firma los eventos.
La publicacion queda visible y trazable desde el browser.

## Creacion incremental

Si el catalogo ya existe, el admin puede crear badges faltantes o un badge nuevo
desde `/badges`. La UI compara el catalogo publicado contra la lista local de
badges iniciales y muestra los pendientes: primer puesto, top 6, favoritos de
Gorilator, Gorilatron, Claudio y demas defaults.

Flujo:

1. El admin (`NEXT_PUBLIC_LACRYPTA_ADMIN_NPUB`) firma un request Nostr efimero
   `kind: 27235`.
2. El frontend envia ese request a `/api/hackathon-badges/create` junto con:
   - `hackathonId`;
   - los badges a crear;
   - categorias nuevas o existentes;
   - el catalogo visible actual, si existe.
3. El backend verifica firma, pubkey admin, expiracion y tags `badge` del
   request.
4. El backend firma con `LACRYPTA_NSEC`:
   - una definicion `kind: 30009` por cada badge nuevo o actualizado;
   - un nuevo catalogo reemplazable `kind: 30078` con badges existentes + nuevos.
5. El frontend publica esos eventos en los relays de datos.
6. El frontend vuelve a leer el catalogo desde Nostr.

Las categorias nuevas se agregan al `content.categories` del catalogo y cada
definicion recibe tambien un tag `category`. El `id` de badge y el `id` de
categoria se normalizan a kebab-case para mantener estabilidad entre renders y
eventos.

## Compatibilidad

La fuente de verdad para mostrar el catalogo es el evento `kind: 30078`. Las
definiciones `kind: 30009` siguen siendo necesarias para compatibilidad NIP-58
y para que otras apps puedan reconocer los awards.

Si una definicion cambia de imagen o descripcion, se actualiza su `kind: 30009`.
Si cambia el orden, categoria o lista disponible de badges para la hackaton, se
actualiza el catalogo `kind: 30078`.
