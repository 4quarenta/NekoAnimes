# Anúncios, Analytics e consentimento

**Observado:** `app/build.gradle.kts` contém Firebase Analytics e Google Play In-App Review; não contém AdMob, Meta Audience Network, AppLovin, Unity Ads, LevelPlay, Pangle ou Mintegral. Busca no código ativo não encontrou renderização de anúncio. Portanto, anúncios: **NÃO APLICÁVEL nesta versão**; a declaração “contém anúncios” ainda deve ser confirmada com a SPA publicada e painel remoto.

O Firebase Analytics inicializa pela `FirebaseInitProvider` antes do `MainActivity`; o código não implementa tela de consentimento, Google UMP/CMP, TCF, revogação nem `setAnalyticsCollectionEnabled`. Nesta rodada, `google_analytics_adid_collection_enabled=false` foi adicionado e `AD_ID`, `ACCESS_ADSERVICES_ATTRIBUTION` e `ACCESS_ADSERVICES_AD_ID` foram removidos do manifesto mesclado Play. Há registro de eventos de tela/player/menu/review na classe `NekoAnalytics`; dados automáticos do SDK ainda precisam ser confirmados no Firebase Console e em captura de tráfego.

**Decisão pendente de produto/jurídica:** determinar mercados, público-alvo, base de consentimento e se Analytics é necessário. Como a versão atual não usa anúncios/atribuição, a coleta de Advertising ID foi desligada e as permissões foram removidas. Se o produto mudar para anúncios ou atribuição, reavaliar consentimento, permissões, SDK e Data Safety antes de reintroduzir. [Controles oficiais do Firebase](https://firebase.google.com/docs/analytics/android/configure-data-collection).

**NÃO CONFIRMADO — REQUER VALIDAÇÃO MANUAL:** vínculos do projeto Analytics com Ads, sinais de personalização, configurações da propriedade, retenção, consentimento por região e declaração atual no Play Console.
