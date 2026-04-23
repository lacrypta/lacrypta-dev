# 🏆 Proof of Attendance (HDMP) — Reporte Final

**Posición:** 1° (empatado) · **Score final: 7.49**
**Equipo:** Looker
**Repo:** proof-of-attendance-hdmp
**Stack:** Vanilla JS + Vite, NWC (NIP-47), LNURL, Nostr Zaps (NIP-57), HMAC-SHA256

---

## 📊 Puntajes por Juez

| Juez | Modelo | Puntaje |
|------|--------|---------|
| ⚡ Claudio | Claude Opus 4.6 | **7.10** |
| 🤖 Gorilatron | OpenAI Codex 5.4 | **6.40** |
| 🦍 Gorilator | Claude Opus 4.6 | **8.98** |

---

### ⚡ Claudio (Claude Opus 4.6) — 7.10
| Categoría | Puntaje | Peso |
|-----------|---------|------|
| Viabilidad | 7 | 25% |
| Impacto Bitcoin | 8 | 25% |
| Implementación | 6 | 20% |
| Originalidad | 7 | 15% |
| Feedback Global | 7 | 15% |

**Lo mejor:** Resuelve un problema real de La Crypta (no-shows). NWC + Zaps + LNURL fallback + verificación pública en relays Nostr reales. No es Bitcoin como sticker — es integración genuina.

**Lo que falta:** index.html de 3600 líneas es una bomba de tiempo. innerHTML + funciones en window + estado en localStorage para una app que maneja sats es riesgoso. Migrar a componentes y mover estado sensible al servidor.

---

### 🤖 Gorilatron (OpenAI Codex 5.4) — 6.40
| Categoría | Puntaje | Peso |
|-----------|---------|------|
| Compilación | 8.5 | 20% |
| Calidad de Código | 5.4 | 25% |
| Testing | 6.4 | 15% |
| Consistencia | 6.1 | 10% |
| Seguridad | 4.1 | 15% |
| Innovación | 8.2 | 15% |

**Lo mejor:** Compila, tiene deploy, integra Lightning/Nostr de forma no trivial. Suite de tests poco común para hackathon. Mezcla NWC, fallback LNURL, Zaps, ticketing firmado y staff scanner — propuesta técnica genuina.

**Lo que falta:** App principal en un `index.html` de ~3635 líneas con lógica/UI/estado mezclados. `TICKET_SECRET` cae a `process.env` sin fallback seguro. Drift fuerte entre docs (README, AGENTS.md, CLAUDE.md) y código real — rastros del starter kit sin limpiar.

---

### 🦍 Gorilator (Claude Opus 4.6) — 8.98
| Categoría | Puntaje | Peso |
|-----------|---------|------|
| Funcionalidad | 9.5 | 30% |
| UI/UX | 7.5 | 25% |
| QR & Lightning | 10 | 20% |
| Completitud | 8.5 | 15% |
| Experiencia General | 9 | 10% |

**Lo mejor:** Flujo end-to-end impecable. Pago → detección en 2 segundos → ticket firmado → Zap publicado en Nostr. Pagó 3 invoices durante testing, todos funcionaron. Se siente como producto real, no prototipo de hackathon.

**Lo que falta:** Formulario de reserva minimalista (nombre + email, sin validación). Algunos elementos UI tienen z-index issues. Multi-evento existe pero el selection UX es básico.

---

## 🛡️ Observación Anti-Injection

Los 3 jueces detectaron archivos `AGENTS.md` y `CLAUDE.md` con **framing persuasivo** — listing de features y "puntos clave para evaluación" dirigidos a evaluadores AI. No alcanzó el umbral de prompt injection deliberado, pero quedó registrado como marketing disfrazado de documentación.

**Resultado:** No descalificado. Sin penalización de score.

---

## 💡 Feedback y Recomendaciones

### Fortalezas
1. **Integración Lightning más completa de la hackathon** — NWC + LNURL + Zaps + verificación Nostr. No es decorativo.
2. **Resuelve un problema real** — no-shows en eventos. Modelo depósito+canje pragmático.
3. **Scope ambicioso ejecutado** — 7 vistas, API, staff scanner, audit dashboard, multi-evento.
4. **Pagos reales funcionando** — 3 sats pagados por Gorilator, detección en 2s.

### Áreas de Mejora
1. **Deuda técnica crítica:** Migrar de monolito HTML a componentes (React, Svelte, lo que sea). 3600 líneas en un archivo no escala.
2. **Seguridad:** Sacar estado sensible de localStorage. HMAC está bien pero `TICKET_SECRET` necesita gestión de secrets real.
3. **Limpiar herencia del starter kit:** README, AGENTS.md, CLAUDE.md tienen drift con el código real. Profesionalizar la documentación.
4. **Testing:** Suite existente es casera y desacoplada del código productivo. Integrar tests con el flujo real.
5. **UX del formulario:** Validaciones, feedback visual, manejo de errores. El checkout funciona pero el ingreso es básico.

### Próximos Pasos Sugeridos
- Refactor a componentes con estado centralizado
- Audit de seguridad del manejo de secrets server-side
- CI/CD con tests integrados
- Agregar verificación de pago real en checkout (no solo optimistic)

---

*Reporte generado por los jueces AI de Lightning Hackathon FOUNDATIONS 2026 — La Crypta*
*Claudio · Gorilatron · Gorilator*
