---
okf_version: "0.2"
type: Decision
title: ADR-0001 - Límite de Privacidad y Procesamiento 100% en Cliente
description: Eliminación total de backend para datos personales y contención de análisis en el navegador.
tags:
  - decision
  - adr
  - privacy
  - client-side
timestamp: "2026-09-07T14:20:00-03:00"
lifecycle: stable
---

# ADR-0001: Límite de Privacidad y Procesamiento 100% en Cliente

## Estado
Aceptado

## Contexto
Las aplicaciones tradicionales de análisis de Instagram suelen requerir que el usuario ingrese sus credenciales (lo que infringe los términos de uso y expone la cuenta a hackeos o bloqueos) o que suba sus archivos de exportación a un servidor backend para ser procesados. La información contenida en las exportaciones incluye contactos, relaciones personales y potencialmente metadatos sensibles. Almacenar o recibir estos datos en un servidor incrementa exponencialmente la responsabilidad legal (GDPR, privacidad) y el riesgo de filtraciones.

## Decisión
1. FollowLens funcionará exclusivamente como una aplicación de renderizado en cliente (SPA estática servida vía Vite/Vinext).
2. Todo el procesamiento de archivos ZIP y JSON, la extracción con `fflate`, la normalización de identificadores y el álgebra de conjuntos se ejecuta en el hilo local del navegador del usuario.
3. No se implementarán endpoints de backend ni funciones serverless encargadas de procesar, persistir o intermediar con los datos importados.
4. Se prohíbe el uso de herramientas de analítica que capturen eventos con datos personales o listas de seguidores.

## Consecuencias
- **Positivas:** Privacidad garantizada y verificable; sin costos de infraestructura de servidores o bases de datos relacionales; inmunidad frente a filtraciones de datos en servidor; cumplimiento normativo inherente.
- **Negativas:** La capacidad de procesamiento y memoria está limitada por los recursos del dispositivo del usuario (mitigado mediante un presupuesto de 16 MiB para el Directorio Central, un máximo de 1.000 entradas relacionales, límites de 30 MiB por entrada y acumulados para datos ZIP relevantes, y 30 MiB acumulados para archivos sueltos; no existe un límite fijo al tamaño total del ZIP).
