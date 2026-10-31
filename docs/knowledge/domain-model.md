---
okf_version: "0.2"
type: Reference
title: Modelo de Dominio y Entidades
description: Definición formal de entidades, tipos TypeScript, estados relacionales y transformaciones de conjuntos.
tags:
  - domain-model
  - typescript
  - types
  - relationships
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# Modelo de Dominio y Entidades de FollowLens

Este documento documenta formalmente los tipos de datos, entidades y reglas de dominio implementadas en `lib/relationships.ts`.

---

## 1. Entidades Principales

### Snapshot
Representa una captura temporal completa del estado de seguidores y seguidos de una cuenta en una fecha determinada.

```ts
export type Snapshot = {
  id: string;          // Identificador único (ej: fecha o timestamp)
  account: string;     // Nombre de usuario del propietario (ej: 'mi_cuenta')
  date: string;        // Fecha de la exportación (YYYY-MM-DD)
  importedAt: string;  // Fecha en que se realizó la importación en FollowLens
  followers: string[]; // Lista ordenada alfabéticamente de seguidores normalizados
  following: string[]; // Lista ordenada alfabéticamente de seguidos normalizados
};
```

---

## 2. Grupos de Relación (`Group`)

La aplicación clasifica las relaciones en 11 categorías discretas agrupadas en dos contextos:

```ts
export type Group =
  // Estado actual (1 snapshot)
  | 'followers'    // Todos los que te siguen
  | 'following'    // Todos a quienes seguís
  | 'mutuals'      // Seguimiento mutuo (intersección)
  | 'notBack'      // Cuentas a las que seguís pero no te siguen de vuelta
  | 'fans'         // Cuentas que te siguen pero vos no seguís

  // Cambios históricos (comparación entre 2 snapshots)
  | 'lost'         // Seguidores presentes antes que ya no están
  | 'new'          // Nuevos seguidores no presentes antes
  | 'unfollowed'   // Cuentas que seguías antes y dejaste de seguir
  | 'followed'     // Cuentas que no seguías antes y empezaste a seguir
  | 'lostMutuals'  // Relaciones mutuas que dejaron de serlo
  | 'newMutuals';  // Nuevas relaciones mutuas consolidadas
```

### Etiquetas Humanas (`labels`)
```ts
export const labels: Record<Group, string> = {
  followers: 'Seguidores',
  following: 'Seguidos',
  mutuals: 'Mutuos',
  notBack: 'No te siguen',
  fans: 'No seguís de vuelta',
  lost: 'Seguidores perdidos',
  new: 'Seguidores nuevos',
  unfollowed: 'Dejaste de seguir',
  followed: 'Empezaste a seguir',
  lostMutuals: 'Mutuos perdidos',
  newMutuals: 'Nuevos mutuos',
};
```

---

## 3. Lógica de Álgebra de Conjuntos (`analyze`)

Dado un snapshot actual $C$ y opcionalmente un snapshot previo $P$ ($P.date < C.date$ y $P.account == C.account$):

| Grupo | Operación Matemática |
|---|---|
| `mutuals` | $C.followers \cap C.following$ |
| `notBack` | $C.following \setminus C.followers$ |
| `fans` | $C.followers \setminus C.following$ |
| `lost` | $P.followers \setminus C.followers$ |
| `new` | $C.followers \setminus P.followers$ |
| `unfollowed` | $P.following \setminus C.following$ |
| `followed` | $C.following \setminus P.following$ |
| `lostMutuals` | $P.mutuals \setminus C.mutuals$ |
| `newMutuals` | $C.mutuals \setminus P.mutuals$ |

---

## 4. Normalización de Identificadores (`normalize`)

Todo nombre de usuario de Instagram se sanitiza antes de entrar al modelo:
```ts
export function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/^@/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(name) ? name : null;
}
```
- Longitud permitida: 1 a 30 caracteres.
- Caracteres válidos: letras minúsculas (`a-z`), dígitos (`0-9`), puntos (`.`) y guiones bajos (`_`).
- Se descarta cualquier entrada con caracteres especiales, URLs arbitrarias o sintaxis de inyección.

---

## 5. Clasificación de Estado Individual (`relationship`)

Determina la relación actual de un usuario respecto a un snapshot:
- **`'Mutuos'`**: está en `followers` Y en `following`.
- **`'Te sigue'`**: está solo en `followers`.
- **`'Lo seguís'`**: está solo en `following`.
- **`'Sin relación detectada'`**: no está en ninguna lista del snapshot.

---

## 6. Evolución Histórica (`timeline`)

Reconstruye el historial cronológico de un usuario a lo largo de todos los snapshots guardados de una misma cuenta:
- Ordena los snapshots cronológicamente por `date`.
- Colapsa estados consecutivos idénticos para no generar ruido.
- Detecta reapariciones o cambios de estado a lo largo del tiempo.

---

## 7. Exportación CSV (`csvRows`)

Genera un archivo CSV con codificación UTF-8 con BOM (`\uFEFF`) y columnas estandarizadas:
1. `usuario`: nombre de usuario normalizado.
2. `grupo`: nombre del grupo activo consultado.
3. `relacion_actual`: estado detectado en el snapshot seleccionado (`Mutuos`, `Te sigue`, `Lo seguís`).
4. `primera_observacion`: fecha más antigua en que se observó al usuario en el historial de la cuenta.
5. `ultima_observacion`: fecha más reciente en que se observó al usuario en el historial.
6. `fecha_exportacion`: fecha del snapshot activo.

## 8. Motor de Verificación de Disponibilidad de Perfiles (ADR-0006, ADR-0007)

El sistema implementa una arquitectura modular de verificación en dos capas mediante `ProfileVerificationEngine` (`lib/profile-availability/`):

### Cobertura vs. Confirmación
- **Cobertura de auditoría (100 %):** En cada importación y bajo demanda, el motor recorre la totalidad de los nombres de usuario únicos entre seguidores y seguidos (deduplicando perfiles mutuos).
- **Confirmación objetiva de estados:** No equipara «perfil examinado» con «disponibilidad confirmada». Solo asigna certeza ante evidencia fehaciente.

### Modelo de Estados Formal (`ProfileVerificationStatus`)
1. `available`: Accesible y confirmado mediante fuente autorizada.
2. `deleted_confirmed`: Evidencia demostrable de eliminación (ej. marcador estructural `__deleted__`).
3. `deactivated_confirmed`: Evidencia demostrable de desactivación temporal.
4. `suspended_confirmed`: Evidencia verificable de suspensión.
5. `private`: Perfil existente y privado.
6. `renamed`: Evidencia fehaciente de cambio de nombre de usuario.
7. `unavailable_unconfirmed`: Perfil presente en la exportación sin marcadores de eliminación; disponibilidad en vivo sin confirmar externamente.
8. `unknown`: Evidencia insuficiente para clasificar.
9. `verification_error`: Fallo técnico, timeout o error de red.

### Registro de Verificación (`ProfileVerificationRecord`)
Cada resultado almacena: `username`, `status`, `verifiedAt`, `providerId`, `reason`, `confidence` (`'high' | 'medium' | 'low' | 'none'`), `evidence` opcional, `metadata` y `nextCheckAfter` para reintentos planificados.

### Reglas de Exclusión Conservadoras
- **Exclusión:** Solo los estados `deleted_confirmed` y `deactivated_confirmed` se excluyen de métricas relacionales y comparaciones históricas.
- **Conservación:** Cuentas `available`, `private`, `unavailable_unconfirmed`, `unknown`, `suspended_confirmed` y `verification_error` permanecen en las estadísticas.
- **Anulación por el usuario:** El usuario puede alternar la exclusión de cualquier perfil (`isExcluded`), permitiendo recuperar cuentas en cualquier momento.
- **Inmutabilidad:** Los snapshots originales jamás se modifican; las proyecciones se calculan en memoria.
