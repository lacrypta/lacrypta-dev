# 🥉 Hash21 Shop — Reporte Final

**Posición:** 3° · **Score final: 7.07**
**Equipo:** Abstract Lai · Ragnar
**Stack:** HTML/CSS/JS, LNURL-pay, NIP-57 Zaps, Lightning Address

---

## 📊 Puntajes por Juez

| Juez | Modelo | Puntaje |
|------|--------|--------|
| ⚡ Claudio | Claude Opus 4.6 | **7.4** |
| 🤖 Gorilatron | OpenAI Codex 5.4 | **4.9** |
| 🦍 Gorilator | Claude Opus 4.6 | **8.9** |

---

### ⚡ Claudio (Claude Opus 4.6) — 7.4
| Categoría | Puntaje |
|-----------|--------|
| Viabilidad | 8 |
| Impacto Bitcoin | 8 |
| Implementación | 5 |
| Originalidad | 8 |
| Feedback Global | 8 |

---

### 🤖 Gorilatron (OpenAI Codex 5.4) — 4.9
| Categoría | Puntaje |
|-----------|--------|
| Compilación | 8.5 |
| Calidad de Código | 5.0 |
| Testing | 0.0 |
| Consistencia | 6.0 |
| Seguridad | 2.0 |
| Innovación | 7.0 |

**Resumen:** Hash21 está realmente construido: el sitio corre fácil y muestra una integración Lightning visible, con shop, zaps y verificación de certificados. La base técnica alcanza para una demo funcional, pero no para considerarla confiable en producción porque el flujo de pagos y datos sensibles está resuelto con criterio de seguridad débil. Lo mejor del proyecto es la integración de primitives Bitcoin/Li

---

### 🦍 Gorilator (Claude Opus 4.6) — 8.9
| Categoría | Puntaje |
|-----------|--------|
| Funcionalidad | 9 |
| UI/UX | 9 |
| QR & Lightning | 9 |
| Completitud | 8 |
| Experiencia General | 9 |

**Resumen:** E-commerce de joyería Bitcoin real. Diseño premium, pagos NIP-57 en 2s, 42 sats gastados. Mejor experiencia visual de la hackathon.

---

## 💡 Feedback Consolidado

### Fortalezas
- Tienda REAL de joyería Bitcoin con plata 925. Ya tiene productos. No es un demo — es un negocio. Sustentable por definición: vende cosas reales por sa
- LNURL-pay, NIP-57 Zaps, Lightning Address. Joyería Bitcoin vendida por Bitcoin. Zero intermediarios, zero KYC. Grassroots puro. Eat what you cook: ven
- Joyería artesanal Bitcoin vendida con Lightning. No es un clon de nada. Producto real, marca real (Hash21). Único en la hackathon.
- Le daría sats ahora mismo. Tiene producto real, marca, y la voluntad de vender por Lightning. Que arregle la seguridad y tiene un negocio.

### Áreas de Mejora
- HTML/CSS/JS puro — funciona pero claves LNbits expuestas en frontend, checkout confirma sin verificar pago real. Para una tienda que maneja dinero, es
- La implementación funciona, pero la lógica está concentrada en archivos HTML monolíticos con CSS y JS inline muy largos. Hay smells claros de mantenib
- No hay tests automatizados ni estructura de testing en el repo. No existe evidencia reproducible de cobertura para flujos críticos de pagos, zaps o ve
- Hay un problema serio: el frontend expone claves de LNbits (`LNBITS_KEY` y `LNBITS_ADMIN`) directamente en `index.html:2251-2253`, incluyendo una admi

---

*Reporte generado por los jueces AI de Lightning Hackathon FOUNDATIONS 2026 — La Crypta*
*Claudio · Gorilatron · Gorilator*
