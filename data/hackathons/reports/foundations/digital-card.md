# 🏅 Digital card — Reporte Final

**Posición:** 6° · **Score final: 6.83**
**Equipo:** negr0
**Stack:** Vanilla JS, Lightning Address, LNURL, Vite

---

## 📊 Puntajes por Juez

| Juez | Modelo | Puntaje |
|------|--------|--------|
| ⚡ Claudio | Claude Opus 4.6 | **6.25** |
| 🤖 Gorilatron | OpenAI Codex 5.4 | **6.1** |
| 🦍 Gorilator | Claude Opus 4.6 | **8.15** |

---

### ⚡ Claudio (Claude Opus 4.6) — 6.25
| Categoría | Puntaje |
|-----------|--------|
| Viabilidad | 6 |
| Impacto Bitcoin | 7 |
| Implementación | 6 |
| Originalidad | 6 |
| Feedback Global | 6 |

---

### 🤖 Gorilatron (OpenAI Codex 5.4) — 6.1
| Categoría | Puntaje |
|-----------|--------|
| Compilación | 7.5 |
| Calidad de Código | 6.8 |
| Testing | 3.0 |
| Consistencia | 6.5 |
| Seguridad | 4.5 |
| Innovación | 7.2 |

**Resumen:** Es un proyecto real, con build reproducible, demo pública y una integración bastante ambiciosa entre identidad Nostr y cobros Lightning. La base técnica tiene valor, pero queda castigada por una arquitectura demasiado monolítica y por tests que no pasan. El principal riesgo técnico es seguridad de persistencia: el esquema de Supabase propuesto permite modificaciones públicas de datos. Destaca por 

---

### 🦍 Gorilator (Claude Opus 4.6) — 8.15
| Categoría | Puntaje |
|-----------|--------|
| Funcionalidad | 8 |
| UI/UX | 9 |
| QR & Lightning | 8 |
| Completitud | 7 |
| Experiencia General | 8 |

**Resumen:** Tarjeta digital Bitcoin con flujo completo end-to-end. Pago 21 sats detectado en 2s. UI profesional, múltiples métodos de pago.

---

## 💡 Feedback Consolidado

### Fortalezas
- El proyecto instala dependencias y `npm run build` funciona; además hay demo deployada. El README permite levantarlo, pero depende de credenciales de 
- Flujo completo: crear perfil, agregar links, generar invoice, pagar, compartir. 21 sats pagados, detectados en ~2s.
- Dark theme Bitcoin-native, responsive impecable en mobile. Múltiples métodos de pago: QR, WebLN, NWC, copy. Sonidos argentinos.
- Invoice generado, QR funcional, pago de 21 sats exitoso, detección en 2 segundos. 9/9 tests pasando.

### Áreas de Mejora
- Hay tests automatizados, pero la suite no pasa completa: `src/nwc.test.js` falla por asumir un `localStorage.clear()` inexistente en el entorno. Ademá
- No encontré secrets reales hardcodeados, y la NWC URL se mantiene en localStorage. El problema serio es el diseño de persistencia sugerido: las polici

---

*Reporte generado por los jueces AI de Lightning Hackathon FOUNDATIONS 2026 — La Crypta*
*Claudio · Gorilatron · Gorilator*
