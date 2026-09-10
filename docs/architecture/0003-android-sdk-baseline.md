# ADR 0003 — Baseline Android estável

## Status

Aprovada em 2026-09-10.

## Decisão

A build principal usa:

- `compileSdk = 36`;
- `targetSdk = 36`;
- JDK 17;
- AGP 9.2;
- Gradle 9.4.1;
- Build Tools 36.0.0.

## Motivo

Android 17 / API 37 continua em preview nesta data. A linha principal deve compilar contra a plataforma estável Android 16 / API 36. API 37 poderá ser testada separadamente como compatibilidade de preview sem contaminar a build de produção.
