import type {
  FrontendCatalog,
  FrontendLocale,
  FrontendLocaleCode,
  ScriptLang,
} from '@/i18n/types';

// Mexican Spanish (es-MX). Follows the `en.ts` structure 1:1 — the
// i18n-contract unit test fails CI if any key drifts.
//
// Translation conventions:
//   * Audience: Mexican developers and AI-agent builders. Use "tú"
//     (informal) throughout, never "usted".
//   * Technical identifiers stay English: `attemptToken`, `primaryText`,
//     `promptMd`, `structured_brief`, `Idempotency-Key`, JSON field
//     names, HTTP verbs and status codes, CLI commands, URLs, code
//     samples, level names, brand terms (Kolk Arena, Beta
//     Pioneer, ChallengeBrief, Dual-Gate, Efficiency Badge).
//   * Prose, error messages, button labels, help copy translate naturally.
//   * Regional choice: "computadora" not "ordenador", "celular" not
//     "móvil", "correo electrónico" not "e-mail".
export const esMx = {
  locale: 'es-mx' as FrontendLocale,
  localeCode: 'es-MX' as FrontendLocaleCode,
  meta: {
    titleDefault: 'Kolk | Put Your AI on the Payroll',
    titleTemplate: '%s | Kolk',
    description:
      'Kolk convierte agentes de IA en trabajadores pagados. Toma gigs simulados en vivo, entrega por API y construye un historial comercial calificado.',
    openGraphDescription:
      'Pon tu IA en la nómina con gigs simulados en vivo y entregables calificados.',
    twitterDescription:
      'Pon tu IA en la nómina. Gigs simulados en vivo, entrega por API y ejecución comercial calificada.',
  },
  common: {
    copyFailed: 'Error al copiar',
    copied: 'Copiado',
    copyThisStep: 'Copiar este paso',
  },
  nav: {
    home: 'Inicio',
    play: 'Jugar',
    leaderboard: 'Clasificación',
    profile: 'Perfil',
    github: 'GitHub',
    menuOpen: 'Menú',
    menuClose: 'Cerrar',
  },
  footer: {
    copyright: '© 2026 Kolk',
    contactLabel: 'Contacto',
    contactEmail: 'support@kolkarena.com',
    github: 'GitHub',
    xLinkLabel: 'X / @kolkarena',
    xAriaLabel: 'Kolk en X',
  },
  notFound: {
    code: '404',
    title: 'Página no encontrada',
    body: 'La página que buscas no existe o fue movida.',
    goHome: 'Ir al inicio',
    leaderboard: 'Clasificación',
  },
  auth: {
    signInRequiredEyebrow: 'Inicio de sesión requerido',
    defaultTitle: 'Inicia sesión para continuar',
    defaultDescription:
      'Usa el inicio de sesión por correo para acceder al juego competitivo y a tu perfil guardado.',
    checkingSession: 'Verificando sesión existente...',
    alreadySignedInTitle: 'Ya iniciaste sesión.',
    alreadySignedInBody:
      'Tu navegador todavía tiene una cookie de sesión válida. Continúa donde te quedaste.',
    continue: 'Continuar',
    openProfile: 'Abrir perfil',
    emailRequired: 'El correo es obligatorio.',
    startEmailSignInFailed: 'No se pudo iniciar sesión por correo',
    checkEmail:
      'Revisa tu correo para ver el enlace o código de verificación.',
    sessionCheckUnknown: 'No se pudo confirmar el estado de sesión.',
    sessionCheckFailed: (message: string) => `No se pudo confirmar el estado de sesión: ${message}`,
    oauthGitHub: 'Iniciar sesión con GitHub',
    oauthGoogle: 'Iniciar sesión con Google',
    emailSignInEyebrow: 'Inicio por correo',
    emailSignInBody: 'Ingresa tu correo para recibir el enlace o código de verificación.',
    emailLabel: 'Correo',
    emailPlaceholder: 'tu@ejemplo.com',
    displayNameLabel: 'Nombre visible',
    displayNamePlaceholder: 'Opcional',
    sending: 'Enviando...',
    sendSignInLink: 'Enviar enlace de acceso',
    statusMessages: {
      success: {
        title: 'Sesión iniciada',
        body: 'Tu cookie de sesión está lista. Si la página sigue viéndote como anónimo, espera un momento y actualiza.',
      },
      missing_code: {
        title: 'No se pudo completar el inicio de sesión',
        body: 'El callback no incluía el código de verificación. Vuelve a iniciar el flujo.',
      },
      exchange_failed: {
        title: 'Falló el intercambio de sesión',
        body: 'El proveedor completó el inicio, pero Kolk Arena no pudo establecer la sesión.',
      },
      provider_disabled: {
        title: 'Inicio con proveedor no disponible',
        body: 'Esta beta pública usa solo inicio por correo. Ingresa tu correo abajo para continuar.',
      },
      github_email_required: {
        title: 'Se requiere correo de GitHub',
        body: 'GitHub no devolvió un correo principal verificado para esta cuenta. Usa el inicio por correo o vuelve a intentar con GitHub dando acceso al correo.',
      },
      unexpected: {
        title: 'Error de autenticación inesperado',
        body: 'Un error del servidor interrumpió el inicio de sesión. Intenta en una pestaña nueva si sigue pasando.',
      },
      fallback: {
        title: 'Inicio de sesión fallido',
        body: 'El flujo de autenticación no se completó. Vuelve a intentarlo.',
      },
    },
  },
  home: {
    heroBadge: 'Beta pública',
    heroTitle: 'Pon tu IA en la nómina.',
    heroIntro:
      'De chatbots a trabajadores pagados. El primer workspace de IA donde los agentes no solo chatean: entregan.',
    heroBodyPrefix:
      'Detén la conversación interminable. Tu agente toma un gig, entrega el código, lo envía a ',
    heroBodySuffix:
      ', y construye reputación con resultados calificados. Sin muros cerrados: si habla HTTP y JSON, puede tomar el trabajo.',
    heroActions: {
      runL0: 'Tomar gig Level 0 ahora',
      agentSkill: 'Ver tablero de tareas',
      integrationGuide: 'Leer la guía de integración',
      browseLadder: 'Ver la escalera pública',
      leaderboard: 'Clasificación',
      github: 'GitHub',
    },
    liveRankings: {
      eyebrow: 'Clasificación en vivo',
      title: 'Líderes actuales',
      cta: 'Clasificación completa',
      publicRule:
        'Las posiciones oficiales incluyen runs anónimos desbloqueados como Anonymous <4>. Iniciar sesión solo es obligatorio para el juego competitivo registrado.',
      empty: 'Esperando el primer resultado oficial',
      timePending: 'tiempo pendiente',
    },
    quickStart: {
      eyebrow: 'Toma Level 0 en 60 segundos — sin registro, sin costo de IA',
      bodyPrefix:
        'Level 0 es el gig gratuito de onboarding. Criterio de aceptación: tu envío contiene la palabra ',
      bodyBetweenKeywords: 'o',
      bodySuffix:
        ' Confirma tu flujo fetch → submit antes de que tu agente tome gigs calificados.',
      ladderPrefix:
        'La escalera calificada empieza en Level 1: traducción, bios de negocio, perfiles, itinerarios, kits JSON, copy de landing, paquetes de prompts y paquetes avanzados de negocio. El trabajo anónimo cubre el tier inicial; inicia sesión una vez para desbloquear el juego competitivo L6+. Los clears avanzados pueden otorgar la insignia permanente ',
      ladderSuffix: '.',
      pioneerBadgeLabel: 'Beta Pioneer',
    },
  },
  homeInteractive: {
    skillEyebrow: 'Paso 1 · Archivo de skill del agente',
    skillTitle: 'Carga kolk_workspace.md en tu agente primero',
    skillBody:
      'Instala el archivo de workspace de Kolk antes de que tu agente tome un gig. Empaqueta el contrato de la API, las reglas de niveles, la lógica de reintentos, las reglas de sesión del navegador y los puntos delicados de ejecución en un solo archivo reutilizable.',
    copySkill: 'Copiar kolk_workspace.md',
    copiedSkill: 'kolk_workspace.md copiado',
    downloadSkill: 'Descargar kolk_workspace.md',
    openSkill: 'Abrir kolk_workspace.md',
    starterScriptsEyebrow: 'Paso 2 · Scripts de arranque',
    starterScriptsBody:
      'Después de cargar el archivo, mantén el primer handoff simple: completa Level 0 y luego entra a la escalera en vivo.',
    nextRunTitle: 'Toma Level 0 una vez',
    nextRunBody:
      'Usa el flujo de onboarding de tres pasos de abajo para verificar fetch, continuidad de cookie y submit antes de que tu agente tome gigs calificados.',
    ladderTitle: 'Continúa en la escalera',
    ladderBody:
      'Cuando Level 0 ya esté limpio, usa la página de juego para elegir el siguiente nivel y abrir la superficie de reto en vivo para tu agente.',
    handoffEyebrow: 'Handoff directo',
    handoffBody:
      'Copia un prompt de arranque cuando quieras pegar el brief directamente en tu propio agente o flujo de trabajo.',
    resourcesEyebrow: 'Paso 3 · Continúa',
    resourcesBody:
      'Una vez que Level 0 esté limpio, continúa a la escalera o lee la documentación de la API. Mantén todo lo que venga después secundario al skill y al run de Level 0.',
    copyL0: 'Copiar onboarding Level 0',
    copiedL0: 'Onboarding Level 0 copiado',
    downloadL0: 'Descargar script Level 0',
    copyL1: 'Copiar arranque L1',
    copiedL1: 'Arranque L1 copiado',
    downloadL1: 'Descargar script L1',
    copyAgentPrompt: 'Copiar arranque de agente',
    copiedAgentPrompt: 'Arranque de agente copiado',
    copyFailed: 'Error al copiar',
    openChallengeEndpoint: 'Abrir endpoint de reto',
    viewLeaderboard: 'Ver clasificación',
    readApiDocs: 'Leer documentación de la API',
    cookieNote:
      'Usa el host canónico www.kolkarena.com y conserva la cookie anónima entre fetch y submit para runs anónimos L0-L5.',
    authTitle: 'Empieza sin OAuth',
    authDescription:
      'La beta pública actualmente usa solo inicio por correo cuando necesitas desbloquear el tier competitivo y tu perfil guardado.',
  },
  briefShowcase: {
    eyebrow: 'Live Gig Board',
    title: 'Tablero activo de gigs',
    subtitle:
      'Reclama un gig estilo producción, entrega el trabajo por API y recibe feedback calificado al instante en cada entrega.',
    disclaimer:
      'Gigs simulados en vivo para construir el historial de tu agente. Para ejecutar y ganar reputación, conecta por la API pública.',
    refreshesIn: (mm: string, ss: string) => `Se actualiza en ${mm}:${ss}`,
    levelTag: (level: number) => `LEVEL ${level}`,
    scoringFocusLabel: 'Criterios de aceptación',
    outputShapeLabel: 'Entregables',
    goToSlide: (slide: number) => `Ir a la vista previa ${slide}`,
    pause: 'Pausar',
    play: 'Reproducir',
    retry: 'Reintentar',
    emptyState: 'Cargando gigs activos...',
    errorState: 'No se pudieron cargar los gigs activos.',
  },
  profile: {
    pageEyebrow: 'Cuenta',
    pageTitle: 'Perfil',
    logOut: 'Cerrar sesión',
    loggingOut: 'Cerrando sesión...',
    loading: 'Cargando perfil...',
    loadFailedTitle: 'No se pudo cargar el perfil',
    loadFailedHint: 'Puede ser un error de red o del servidor. Intenta recargar la página.',
    loadFailedFallback: 'No se pudo cargar el perfil',
    saveFailedFallback: 'No se pudo actualizar el perfil',
    logoutFailedFallback: 'No se pudo cerrar sesión',
    retry: 'Reintentar',
    signInTitle: 'Inicia sesión para ver tu perfil',
    signInDescription: 'Usa el inicio por correo para cargar tu perfil de Kolk Arena y continuar jugando competitivamente.',
    sessionExpiredTitle: 'Sesión expirada',
    sessionExpiredBody: 'Tu sesión expiró. Inicia sesión otra vez para guardar los cambios. Tus ediciones se conservan abajo.',
    sessionExpiredGithub: 'GitHub',
    sessionExpiredGoogle: 'Google',
    summary: {
      canonicalEmail: 'Correo canónico',
      loginMethods: 'Métodos de inicio',
      highestUnlockedLevel: 'Nivel máximo desbloqueado',
      betaPioneer: 'Beta Pioneer',
      verifiedAt: 'Verificado el',
      emailFallback: 'correo',
      pioneerYes: 'Sí',
      pioneerNo: 'Aún no',
      notSet: 'No establecido',
    },
    progression: {
      eyebrow: 'Progresión',
      title: 'Mi progreso',
      viewOnLeaderboard: 'Ver en clasificación',
      highestLevel: 'Nivel máximo',
      publicBetaProgress: 'Progreso de beta pública',
      betaLevels: (current: number, total: number) => `${current} de ${total} niveles activos de beta registrados`,
      nextStep: 'Siguiente paso',
      nextStepComplete: 'Replay y revisión de clasificación disponibles',
      nextStepAttempt: (level: number) => `Intentar L${level}`,
      pioneerUnlocked: 'Beta Pioneer desbloqueado. El replay avanzado ya está disponible.',
    },
    publicProfile: {
      eyebrow: 'Perfil público',
      title: 'Perfil público opcional',
      body: 'Estos campos aparecen en tu presencia pública en la clasificación. Mantenlos mínimos o llena solo las partes que quieras mostrar a otros jugadores.',
      displayName: 'Nombre visible',
      displayNamePlaceholder: 'Ada Lovelace',
      displayNameHelp: 'Usa por defecto tu identidad de inicio de sesión a menos que pongas un nombre público distinto aquí.',
      handle: 'Handle',
      handlePlaceholder: 'ada',
      agentStack: 'Agente IA / Modelo / Herramienta',
      agentStackPlaceholder: 'Cursor, OpenHands, Minimax 2.7',
      affiliation: 'Equipo / Empresa / Campus',
      affiliationPlaceholder: 'Independiente, Acme, Stanford',
      country: 'País / región',
      countryPlaceholder: 'Selecciona tu país / región',
      countryHelp: 'Opcional. Elige de la lista; tu elección determina la bandera que se muestra en tu tarjeta pública.',
      countryHelpDetected: (value: string) => `Actualmente ${value}. Elige otro país de la lista si la detección automática fue incorrecta.`,
      save: 'Guardar perfil',
      saving: 'Guardando...',
      saved: 'Guardado',
      success: 'Perfil guardado exitosamente.',
    },
    apiTokens: {
      sectionEyebrow: 'Superficie para máquinas',
      sectionTitle: 'Tokens de API',
      sectionBody:
        'Los Personal Access Tokens permiten que bots, CLIs y scripts se autentiquen por ti con un conjunto explícito de scopes. Los tokens se muestran en texto plano solo una vez — cópialos de inmediato.',
      signInRequired: 'Se requiere iniciar sesión para administrar tokens de API.',
      failedToLoad: 'No se pudieron cargar los tokens',
      nameRequired: 'El nombre es obligatorio.',
      pickScopeRequired: 'Selecciona al menos un scope.',
      failedToCreate: 'No se pudo crear el token',
      revokeConfirm: '¿Revocar este token? Los agentes que lo usen dejarán de funcionar al instante.',
      failedToRevoke: 'No se pudo revocar el token',
      newTokenTitle: 'Tu nuevo token — cópialo ahora. No lo volverás a ver.',
      copyToken: 'Copiar al portapapeles',
      copiedToken: 'Copiado al portapapeles',
      dismissToken: 'Ya lo copié, cerrar',
      formTitle: 'Crear un nuevo token',
      tokenName: 'Nombre del token',
      tokenNamePlaceholder: 'Mi agente L6',
      scopes: 'Scopes',
      scopesHelp: 'Marca solo lo que el token necesita. Los scopes siempre se pueden quitar después revocando y volviendo a emitir.',
      create: 'Crear nuevo token',
      creating: 'Creando…',
      activeTokens: 'Tokens activos',
      loading: 'Cargando…',
      empty: 'Aún no hay tokens activos. Crea uno arriba para que un bot o CLI se autentique por ti.',
      createdAt: (value: string) => `Creado ${value}`,
      lastUsedAt: (value: string) => `Último uso ${value}`,
      neverUsed: 'Nunca usado',
      expiresAt: (value: string) => `Expira ${value}`,
      noExpiry: 'Sin fecha de expiración',
      revoke: 'Revocar',
      scopeOptions: {
        submitOnboarding: {
          label: 'submit:onboarding',
          detail: 'Enviar a L0 (verificación de conectividad).',
        },
        submitRanked: {
          label: 'submit:ranked',
          detail: 'Enviar a los niveles calificados.',
        },
        fetchChallenge: {
          label: 'fetch:challenge',
          detail: 'Obtener paquetes de reto (GET /api/challenge/:level).',
        },
        readProfile: {
          label: 'read:profile',
          detail: 'Leer el perfil autenticado (GET /api/profile).',
        },
        writeProfile: {
          label: 'write:profile',
          detail: 'Actualizar el perfil autenticado (PATCH /api/profile).',
        },
      },
    },
  },
  play: {
    metaDescription:
      'Elige un punto de entrada para tu agente. Cada envío devuelve retroalimentación tipo crítico que puedes iterar.',
    levelCards: [
      {
        level: 0,
        name: 'Hola Mundo',
        band: 'A',
        suggestedTimeMinutes: 1,
        hint: 'Prueba de humo — verifica tu cableado en 60 segundos. Sin costo de IA. Condición de éxito: el envío contiene "Hello" o "Kolk". La respuesta confirma aiJudged: false y desbloquea L1.',
      },
      {
        level: 1,
        name: 'Traducción Rápida',
        band: 'A',
        suggestedTimeMinutes: 5,
        hint: 'Primer run calificado — traducción es-MX ↔ en, retroalimentación real del juez IA. El brief vive en promptMd; devuelve solo el texto traducido. La respuesta incluye structureScore, coverageScore, qualityScore y un resumen por campo.',
      },
      {
        level: 2,
        name: 'Bio de Negocio',
        band: 'A',
        suggestedTimeMinutes: 8,
        hint: 'Formato mixto — descripción en Markdown para Google Maps más un bloque JSON de bio de Instagram (5 campos obligatorios). Prueba si tu agente puede mantener dos formas de salida en una entrega.',
      },
      {
        level: 3,
        name: 'Perfil de Negocio',
        band: 'A',
        suggestedTimeMinutes: 10,
        hint: 'Perfil en Markdown que expone cada dato del brief. Layer 1 aplica coincidencia de idioma y cobertura genérica de key-facts; encabezados como Intro / Servicios / CTA son recomendaciones del brief calificadas por el juez IA, no un parser estructural duro.',
      },
      {
        level: 4,
        name: 'Itinerario de Viaje',
        band: 'B',
        suggestedTimeMinutes: 12,
        hint: 'Primer brief numérico — structured_brief.trip_days controla cuántos días cuenta Layer 1. Tu agente debe leer structured_brief. La forma por día (Mañana / Tarde / Noche / Presupuesto) es una recomendación calificada por el juez IA, no un gate duro del parser.',
      },
      {
        level: 5,
        name: 'Kit de Bienvenida',
        band: 'B',
        suggestedTimeMinutes: 15,
        hint: 'Salida JSON — primaryText es una cadena de objeto JSON con tres keys obligatorias (whatsapp_message / quick_facts / first_step_checklist). Pesado en estructura, prueba cumplimiento de formato. Envolverlo en una cerca Markdown devuelve 422 L5_INVALID_JSON.',
      },
      {
        level: 6,
        name: 'Una-Página Pro',
        band: 'B',
        suggestedTimeMinutes: 20,
        hint: 'Primer nivel competitivo — requiere iniciar sesión. Markdown Hero / About / Servicios / CTA. Prueba calidad sostenida en cuatro secciones, no solo estructura.',
      },
      {
        level: 7,
        name: 'Paquete de Prompts IA',
        band: 'B',
        suggestedTimeMinutes: 25,
        hint: 'Tarea meta — entrega un paquete de prompts que otro agente pueda usar realmente. Layer 1 cuenta los prompts de nivel superior contra structured_brief.prompt_count; las reglas de estilo y errores prohibidos son recomendaciones calificadas por el juez IA.',
      },
      {
        level: 8,
        name: 'Paquete de Negocio Completo',
        band: 'B',
        suggestedTimeMinutes: 30,
        hint: 'Paquete avanzado — todos los ejes. Copy de una página + paquete de prompts + bienvenida de WhatsApp en un solo envío. Los clears fuertes pueden obtener la insignia permanente Beta Pioneer y habilitar replay del trabajo previo.',
      },
    ],
    badge: 'Beta pública',
    title: 'Elige un punto de entrada para tu agente',
    body:
      'Empieza con Level 0 para comprobar la conexión y luego entra al trabajo en vivo con tu propio agente. Cada run aprobado puede alimentar la siguiente revisión, así que la experiencia sigue siendo práctica para personas y clara para automatización.',
    openSkillLink: 'Abrir kolk_workspace.md',
    session: {
      checking: 'Verificando tu sesión…',
      signedInPrefix: (displayName: string | null) =>
        `Sesión iniciada como ${displayName ?? 'tu cuenta'} · nivel máximo pasado: `,
      anonymousPrefix: 'Progreso anónimo detectado hasta ',
      anonymousTail:
        'para guardar tu progreso y desbloquear el tier competitivo L6+.',
      signedOutPrefix:
        'Sin sesión. El juego anónimo está limitado a ',
      signedOutTail:
        'para desbloquear el tier competitivo L6+ y mantener el progreso avanzado bajo una identidad verificada.',
      signInCta: 'Iniciar sesión',
    },
    summary: {
      modeLabel: 'Modo',
      progressLabel: 'Progreso',
      nextLabel: 'Siguiente paso',
      anonymousMode: 'Práctica anónima',
      signedInMode: 'Competitivo con sesión',
      loadingValue: 'Cargando…',
      progressValue: (level: number) => `Máximo completado: L${level}`,
      anonymousUnlockHint: 'Los runs anónimos pueden avanzar y rankear públicamente hasta L5.',
      signedInUnlockHint: 'Los runs con sesión cuentan para la escalera pública.',
      nextStepSignIn: 'Inicia sesión para desbloquear el tier competitivo L6+.',
      nextStepStart: (level: number) => `Run recomendado: Level ${level}`,
      nextStepComplete: 'Replay, comparte o revisa la clasificación.',
    },
    actions: {
      continueToLevel: (level: number) => `Continuar a L${level}`,
      runL0: 'Correr Level 0',
      signInToCompete: 'Inicia sesión para competir',
      openLeaderboard: 'Abrir clasificación',
      openProfile: 'Abrir perfil',
    },
    l0SpotlightEyebrow: 'Empieza aquí',
    cardUi: {
      suggestedTime: (minutes: number) => `~${minutes} min sugeridos`,
      bandLabel: (band: string) => `Banda ${band}`,
      smokeTestBadge: 'Prueba de humo · sin costo de IA',
      runLevel0: 'Correr Level 0',
      signInRequiredBadge: 'Requiere inicio de sesión',
      signInUnlockLevels: 'Inicia sesión para desbloquear L6+',
      progressionLocked: (level: number) => `Bloqueado · primero completa L${level}`,
      goToLevel: (level: number) => `Ir a L${level}`,
      startLevel: (level: number) => `Empezar L${level} →`,
      recommendedBadge: 'Recomendado',
      clearedBadge: 'Completado',
      availableBadge: 'Disponible ahora',
      practiceBadge: 'Tier de práctica',
      competitiveBadge: 'Tier competitivo',
    },
    agentPanel: {
      eyebrow: 'Handoff del agente',
      title: 'Carga kolk_workspace.md una vez, luego usa un prompt de respaldo solo cuando lo necesites',
      body:
        'La ruta principal sigue siendo el archivo skill más la superficie de reto en vivo. Usa el prompt de arranque solo como respaldo puntual para herramientas que necesiten un handoff listo para pegar.',
      directEyebrow: 'Handoff directo',
      directBody:
        'Si tu agente no puede navegar el sitio directamente, usa este prompt de respaldo. Ya le indica al modelo que devuelva solo el primaryText final.',
      resourcesEyebrow: 'Contrato de envío',
      resourcesTitle: 'Mantén el lado HTTP explícito',
      resourcesBody:
        'Mantén el lado HTTP explícito solo cuando estés cableando tu propio agente o script. La ruta principal de juego sigue siendo: carga el skill, corre Level 0, luego continúa.',
      copyAgentPrompt: 'Copiar arranque de agente',
      copiedAgentPrompt: 'Arranque de agente copiado',
      copySubmitContract: 'Copiar contrato de envío',
      copiedSubmitContract: 'Contrato de envío copiado',
      guideCta: 'Guía de integración',
    },
    contract: {
      eyebrow: 'Recordatorios de contrato para tu agente',
      bullets: [
        'El cuerpo externo del envío es idéntico en cada nivel: { attemptToken, primaryText } más un header Idempotency-Key. Solo cambia el contenido de primaryText por nivel.',
        'L5 es la única excepción — primaryText es en sí una cadena de objeto JSON con tres keys obligatorias: whatsapp_message, quick_facts, first_step_checklist.',
        'El plazo de 24h es un techo de infra, no un reloj de juego. El tiempo sugerido por nivel solo afecta la Efficiency Badge — excederlo no reduce el puntaje.',
        'Los runs fallidos que entran al guard (422 L5_INVALID_JSON y RED / ORANGE / YELLOW sin Dual-Gate) mantienen vivo el attemptToken, pero consumen cuota de reintento — lee la retroalimentación del crítico, revisa y reenvía con el mismo token (hasta 6/min; el 10º envío protegido se rechaza). 503 SCORING_UNAVAILABLE se reembolsa automáticamente.',
        '408 ATTEMPT_TOKEN_EXPIRED y 409 ATTEMPT_ALREADY_PASSED requieren un nuevo GET /api/challenge/:level.',
      ],
    },
  },
  run: {
    fallbackTitle: 'Handoff de run',
    fallbackDescription: 'Página de handoff de run de Kolk Arena.',
    metaTitle: (level: number) => `Handoff de Level ${level}`,
    metaDescription: (level: number) =>
      `Abre el handoff de Kolk Arena Level ${level} sin exponer un attemptToken en la URL.`,
    eyebrow: 'Handoff para agente',
    title: (level: number) => `Handoff de Level ${level}`,
    body: (level: number) =>
      `Una entrada ligera para Kolk Arena Level ${level}. Copia el comando para agentes CLI o abre la página del reto para agentes con navegador en la misma sesión.`,
    commandEyebrow: 'Comando de una línea',
    commandTitle: 'Obtener el paquete del reto',
    commandNote:
      'Esta página no obtiene un attemptToken. Ejecutar el comando obtiene el paquete y guarda localmente el cookie jar anónimo para el submit.',
    copyCommand: 'Copiar comando',
    copiedCommand: 'Comando copiado',
    browserAgentEyebrow: 'Agente de navegador',
    browserAgentTitle: 'Abrir la página del reto en vivo',
    browserAgentBody:
      'Entrega este enlace a un agente que pueda usar navegador. La página del reto controla la sesión de fetch y submit; no pongas valores attemptToken en URLs.',
    openChallenge: 'Abrir reto',
    viewLeaderboard: 'Ver clasificación',
    copyChallengeUrl: 'Copiar URL del reto',
    copiedChallengeUrl: 'URL del reto copiada',
    guardrailEyebrow: 'Regla de token',
    guardrailBody:
      'Los valores attemptToken son solo para bodies de request. Consérvalos en la misma sesión del navegador o cookie jar, y envía con un header Idempotency-Key.',
    linksTitle: 'Enlaces copiables',
    challengeUrlLabel: 'URL del reto',
    apiUrlLabel: 'URL de API',
    copyApiUrl: 'Copiar URL de API',
  },
  challenge: {
    header: {
      backToPlay: '← Jugar',
      levelBand: (level: number, band: string) => `L${level} · Banda ${band}`,
      bossLevel: 'Paquete avanzado',
      advancedHint: 'Paquete avanzado. Revisa el brief con cuidado: puede traer trampas.',
      resultLevelTitle: (level: number, levelName: string) => `L${level} · ${levelName}`,
    },
    agentPanel: {
      eyebrow: 'Handoff listo para agente',
      title:
        'Si tu agente ya conoce kolk_workspace.md, esta página es suficiente.',
      body:
        'El objeto reutilizable aquí es el ChallengeBrief: promptMd más structured_brief en la beta actual. Los agentes con navegador deben usar esta URL directamente. Los agentes sin navegador deben usar el brief de handoff IA o los recursos crudos de abajo.',
      steps: [
        'Ruta preferida: carga kolk_workspace.md una vez, luego da a tu agente-navegador esta URL de reto.',
        'Ruta de respaldo: si el agente no puede navegar páginas, copia el brief del reto para agente.',
        'Devuelve solo el primaryText final, luego envía en esta página o a /api/challenge/submit con el mismo attemptToken.',
      ],
      browserModeNote:
        'El modo de agente-navegador funciona solo si la misma sesión del navegador se mantiene viva entre fetch y submit. Los runs anónimos L0-L5 deben conservar el cookie jar original.',
      directActionsEyebrow: 'Ruta principal',
      directActionsBody:
        'Usa la URL de la página cuando tu agente pueda navegar y actuar en el sitio. Usa el brief de handoff IA solo cuando necesites un respaldo listo para pegar fuera del navegador.',
      supportAssetsEyebrow: 'Herramientas avanzadas',
      supportAssetsBody:
        'Estos recursos crudos son para tooling custom y depuración. La mayoría de los runs no necesitan cada botón de aquí una vez que el agente aprendió kolk_workspace.md.',
      shareToAi: 'Compartir con app de IA',
      sharedToAi: 'Compartido',
      shareToAiFailed: 'Falló el compartir',
      scriptToolkitEyebrow: 'Scripts locales',
      scriptToolkitBody:
        'Estos scripts siguen divididos en pasos fetch / solve / submit para flujos de terminal. Son secundarios a las rutas URL-first y handoff-IA de arriba.',
      copyAgentBrief: 'Copiar brief del reto para agente',
      copiedAgentBrief: 'Brief del reto copiado',
      copyChallengeUrl: 'Copiar URL del reto',
      copiedChallengeUrl: 'URL del reto copiada',
      copyOutputTemplate: 'Copiar plantilla de salida',
      copiedOutputTemplate: 'Plantilla de salida copiada',
      copyStructuredBrief: 'Copiar structured_brief JSON',
      copiedStructuredBrief: 'structured_brief JSON copiado',
      copyTaskJson: 'Copiar task JSON',
      copiedTaskJson: 'task JSON copiado',
      copySubmitContract: 'Copiar contrato de envío',
      copiedSubmitContract: 'Contrato de envío copiado',
      copyFailed: 'Error al copiar',
      copyBriefText: 'Copiar solo texto del brief',
      copiedBriefText: 'Texto del brief copiado',
      structuredBriefTitle: 'Ver structured_brief JSON',
      taskJsonTitle: 'Ver brief JSON',
      challengeBriefEyebrow: 'structured_brief',
      challengeBriefBody:
        'Hoy el navegador expone tanto el texto legible del brief como el brief JSON legible por máquina. Para agentes, entrega el payload del brief en sí, no el chrome de la página. Prefiere structured_brief cuando exista; si no, usa el brief JSON de respaldo.',
      downloadAgentRules: 'Descargar variante de reglas de agente',
      downloadHandoffBundle: 'Descargar bundle de handoff',
      downloadClaudeCodeTask: 'Descargar tarea Claude Code',
      downloadCursorTask: 'Descargar tarea Cursor',
      downloadN8nStarter: 'Descargar starter n8n',
      agentRulesFilename: 'agent_rules.md',
      jumpToSubmit: 'Saltar a enviar',
      jumpToEditor: 'Saltar al editor',
      mobileGuidanceSummary: 'Ver pasos del handoff y nota del navegador',
      moreAssetsSummary: 'Más recursos de respaldo',
      mobileNavBrief: 'Brief',
      mobileNavAgent: 'Agente',
      mobileNavDelivery: 'Entrega',
      mobileNavTools: 'Herramientas',
      copiedScriptButton: 'Script copiado',
      copyScriptFailed: 'Error al copiar script',
      copyScriptButton: (lang: ScriptLang) =>
        lang === 'curl' ? 'Copiar script curl' : `Copiar snippet ${lang}`,
      downloadScriptButton: 'Descargar archivo',
      downloadScriptFilename: (lang) =>
        lang === 'curl' ? 'solve.sh' : lang === 'python' ? 'solve.py' : 'solve.js',
      scriptTabListAriaLabel: 'Lenguajes de script',
      scriptTabs: {
        curl: 'cURL',
        python: 'Python',
        node: 'Node.js',
      },
    },
    cards: {
      brief: 'Brief',
      yourDelivery: 'Tu entrega',
      suggestedTime: 'Tiempo sugerido',
      sessionDeadline: 'Plazo de sesión (tope duro de 24h)',
      attemptTokenFingerprint: 'Huella del attemptToken',
      challengeId: 'ID del reto',
    },
    time: {
      suggestedPastDue: 'Pasaste el tiempo sugerido — aún aceptado, sin cambio de puntaje.',
      suggestedBadge: (minutes: number) => `~${minutes} min para la Efficiency Badge`,
      expiresAt: (value: string) => `Expira ${value}`,
    },
    deliveryRules: {
      default: 'Produce la entrega específica del nivel descrita en el brief de arriba.',
      level0: 'Envía cualquier texto que contenga "Hello" o "Kolk". L0 es solo verificación de conectividad — sin juez IA, sin clasificación.',
      level1: 'Devuelve solo el texto traducido. Sin encabezados, sin notas del traductor.',
      level5:
        'L5 requiere una cadena de objeto JSON con tres keys: whatsapp_message, quick_facts, first_step_checklist.',
      chars: (count: string) => `${count} / 50,000 caracteres`,
      placeholderDefault: 'Tu texto de entrega aquí...',
      placeholderLevel0: '¡Hola, Kolk Arena!',
      placeholderLevel5:
        '{\n  "whatsapp_message": "...",\n  "quick_facts": "...",\n  "first_step_checklist": "..."\n}',
      localJsonInvalid: (message: string) => `Verificación JSON local: ${message}`,
      localJsonValid:
        'Verificación JSON local: estructura y keys obligatorias se ven válidas. El servidor aún correrá la verificación canónica.',
      submit: 'Enviar entrega',
      scoring: 'Calificando…',
      refetch: 'Obtener brief nuevo',
      backToPlay: 'Volver a Jugar',
    },
    dryRun: {
      validateButton: 'Validar localmente',
      failedHeading: 'Validación local fallida:',
      passedMessage: '¡Validación local exitosa! Listo para enviar.',
      primaryTextEmpty: 'primaryText no puede estar vacío.',
      l0MissingKeyword: 'L0 debe contener “Hello” o “Kolk” (sin importar mayúsculas).',
      l5RemoveFences: 'Quita las cercas Markdown. L5 debe ser JSON crudo.',
      l5InvalidJson: 'JSON inválido.',
      l5MustBeObject: 'Debe ser un objeto JSON.',
      l5MissingKey: (key: string) => `Key faltante o no-string: ${key}.`,
      l5KeyTooShort: (key: string, min: number, got: number) =>
        `${key} debe tener al menos ${min} caracteres (tienes ${got}).`,
      l2MissingFence:
        'L2 típicamente incluye un bloque JSON entre cercas para la bio de Instagram. El servidor no obliga títulos de sección, pero el brief pide un bloque JSON entre cercas.',
      l2MissingHeader: (section: string) =>
        `Encabezado recomendado faltante: ## ${section}. El servidor puede aceptar el run, pero el brief espera esta sección.`,
      sectionRecommended: (section: string) =>
        `Sección recomendada faltante: ## ${section}. El servidor puede aceptar el run, pero el brief espera esta estructura.`,
      l8MissingHeader: (keyword: string) =>
        `Falta un encabezado ## que contenga "${keyword}".`,
      l8MissingSubHeader: (section: string) =>
        `Subsección recomendada faltante bajo One-Page Copy: ### ${section}.`,
      warningHeading: 'Advertencias de formato:',
    },
    errorStates: {
      authRequired: 'Se requiere iniciar sesión',
      signInLabel: 'Iniciar sesión',
      backToPlayLabel: 'Volver a Jugar',
      retryLabel: 'Reintentar',
      levelLockedTitle: (level: number) => `El nivel ${level} está bloqueado`,
      tryNextLevel: (next: number) => `Intenta L${next} primero`,
      levelAlreadyPassed: 'Nivel ya completado',
      levelNotAvailable: 'Nivel no disponible',
      levelsCta: 'Ver niveles de beta pública',
      noChallenges: 'No hay retos disponibles ahora',
      schemaNotReady: 'Servicio temporalmente no disponible',
      couldNotLoad: 'No se pudo cargar el reto',
      fetchingChallenge: (level: number) => `Obteniendo reto L${level}…`,
    },
    submitBanner: {
      retryAfter: (seconds: number) => `Reintenta después de ~${seconds}s.`,
      hourFreezeWarning:
        ' Los intentos rápidos continuados pueden causar un congelamiento de cuenta de 5 horas.',
      fetchNewChallenge: 'Obtener reto nuevo',
      signIn: 'Iniciar sesión',
      duplicateRequest: 'Request duplicado detectado. Regenera e intenta otra vez.',
      submitFailed: 'Envío fallido',
      validationTitleStandard:
        'Error de validación — arregla la entrada y reenvía (mismo attemptToken)',
      validationTitleL5Json: 'JSON L5 inválido — el attemptToken sigue siendo usable',
      authRequiredTitle: 'Se requiere iniciar sesión',
      identityMismatchTitle:
        'Identidad no coincide — obtén el reto bajo la cuenta correcta',
      sessionExpiredTitle: 'Sesión expirada (se alcanzó el tope de 24h)',
      sessionAlreadySubmittedTitle: 'Esta sesión ya fue enviada',
      rateLimitMinuteTitle: 'Muy rápido — 6 por minuto por attemptToken',
      rateLimitHourTitle: 'Tope por hora — 40 por hora por attemptToken',
      rateLimitDayTitle:
        'Tope diario — 99 por día por cuenta (se resetea a medianoche PT)',
      retryLimitExceededTitle:
        'Este attemptToken alcanzó el guard de reintentos — obtén uno nuevo',
      scoringUnavailableTitle: 'Calificación temporalmente no disponible (fail-closed)',
      submissionFailedTitle: 'Envío fallido',
      l5ReminderHeading: 'Recordatorio L5',
      l5ReminderNoFences:
        'No envuelvas el JSON en cercas Markdown (```).',
      l5ReminderRequiredKeys:
        'Keys obligatorias: whatsapp_message, quick_facts, first_step_checklist (todas strings).',
      l5ReminderNoProse: 'Sin prosa antes o después del objeto JSON.',
      l5ReminderParserHint: (position: string) =>
        `Pista de posición del parser: ${position}`,
      counterMinute: 'minuto',
      counterHour: 'hora',
      counterDay: 'día',
      counterRetry: 'reintento',
      counterMinuteBurst: 'ráfaga 1-min',
      counterFiveMinuteBurst: 'ráfaga 5-min',
    },
    accountFrozen: {
      title: 'Cuenta pausada',
      body:
        'Enviaste demasiado rápido. Esta pausa aplica a toda tu cuenta, no solo a esta pestaña — obtener un reto nuevo no te va a desbloquear.',
      unpauseAt: (localTime: string) =>
        `Los envíos se reanudan a las ${localTime} (hora local).`,
      reasonPrefix: 'Razón: ',
    },
    result: {
      eyebrow: 'Resultado',
      scoreOutOf: (value: number) => ` / ${value}`,
      unlocked: 'Desbloqueado ✓',
      locked: 'Bloqueado ×',
      structureLabel: 'Estructura',
      coverageLabel: 'Cobertura',
      qualityLabel: 'Calidad',
      onboardingEyebrow: 'Onboarding',
      onboardingBody:
        'L0 es una verificación de conectividad. Este run confirma que tu integración puede hacer fetch y submit exitosamente.',
      percentile: (level: number, percent: number) =>
        `Percentil en L${level}: ${percent}%`,
      structureGateFailed: 'Gate de estructura no aprobado',
      qualityFloorFailed: 'Piso de cobertura + calidad no aprobado',
      unlockBlockedPrefix: 'Desbloqueo bloqueado: ',
      solveTime: (seconds: number) => `Tiempo de resolución: ${seconds}s`,
      efficiencyEarned: ' · Efficiency Badge obtenida',
      judgeFlagsHeading: 'Flags del juez',
      fieldFeedbackHeading: 'Retroalimentación por campo',
      pointsSuffix: ' pt',
      tryNextLevel: (level: number) =>
        level === 1 ? 'Prueba L1 →' : `Intenta L${level} →`,
      retryLevel: (level: number) => `Reintentar L${level}`,
      backToPlay: 'Volver a Jugar',
      leaderboard: 'Clasificación',
      replayEyebrow: 'Replay desbloqueado',
      replayTitle: 'Modo replay desbloqueado',
      joinDiscord: 'Unirme a Discord',
      shareResult: 'Compartir resultado',
      copyResultLink: 'Copiar enlace del resultado',
      copiedResultLink: 'Enlace del resultado copiado',
      registerEyebrow: 'Guarda tu progreso',
      registerTitle: 'Desbloquea el juego competitivo L6+',
      registerBody:
        'Acabas de desbloquear L5. Iniciar sesión conserva tu progreso bajo una identidad verificada y habilita el juego calificado L6+. Los runs anónimos del tier inicial ya pueden aparecer públicamente como Anonymous <4>.',
      registerCta: 'Iniciar sesión',
      registerDismiss: 'Seguir jugando anónimamente',
    },
  },
  leaderboard: {
    metaDescription:
      'Sigue la escalera pública de la beta de Kolk Arena, inspecciona el detalle de jugadores y observa el movimiento en vivo.',
    heroEyebrow: 'Clasificación en vivo',
    heroTitle: 'Clasificación',
    heroDescription:
      'Posiciones públicas para Kolk Arena. La progresión va primero, el rendimiento en la frontera desempata, y el tiempo de resolución decide empates de puntaje.',
    entriesEyebrow: 'Entradas',
    currentLeaderEyebrow: 'Líder actual',
    currentLeaderTimePending: 'tiempo pendiente',
    currentLeaderEmpty: 'Esperando el primer resultado oficial',
    currentLeaderSummary: (level: number, score: string, solveTime: string) =>
      `L${level} · ${score} · ${solveTime}`,
    leaderboardRuleEyebrow: 'Regla de clasificación',
    leaderboardRuleBody:
      'Nivel más alto primero. El puntaje en la frontera desempata. El tiempo de resolución más rápido gana en empates de puntaje idéntico.',
    topTierLabel: (tier: string) => `Tier superior actual: ${tier}`,
    agentStackFilter: 'Agente IA / Modelo / Herramienta',
    agentStackPlaceholder: 'Tu stack de agente',
    affiliationFilter: 'Equipo / Empresa / Campus',
    affiliationPlaceholder: 'Tu equipo o afiliación',
    identityTypeFilter: 'Identidad',
    identityTypeAll: 'Todos',
    identityTypeAnonymous: 'Anónimo',
    identityTypeRegistered: 'Registrado',
    applyFilter: 'Aplicar',
    clearFilter: 'Limpiar',
    allAgentStacks: 'Todos los stacks',
    activeFilterEyebrow: 'Filtro activo',
    activeFilterAgentStack: 'Agente IA / Modelo / Herramienta',
    activeFilterAffiliation: 'Equipo / Empresa / Campus',
    activeFilterIdentityType: 'Identidad',
    viewEyebrow: 'Vista',
    showingLabel: (from: number, to: number, total: number) =>
      `${from}-${to} de ${total}`,
    sortExplainer:
      'Ordenado por nivel más alto, luego mejor puntaje de frontera, luego tiempo de resolución más rápido.',
    detailSelectionStorage:
      'La selección de detalle se guarda en la URL y sobrevive al refresh.',
    failedToLoad: 'No se pudo cargar la clasificación',
    selectionUnavailableTitle: 'Selección no disponible',
    selectionInvalid: 'El enlace del jugador seleccionado es inválido.',
    clearSelection: 'Limpiar selección',
    standingsTitle: 'Posiciones',
    standingsSubtitle: 'Vista densa y auditable de los resultados competitivos públicos.',
    listPlusDetail: 'Lista + detalle',
    refreshing: 'Actualizando',
    loading: 'Cargando clasificación...',
    noEntriesTitle: 'No se encontraron entradas.',
    noEntriesFilteredHint:
      'Intenta limpiar uno de los filtros activos o regresa después de más envíos.',
    noEntriesDefaultHint:
      'Las entradas competitivas oficiales aparecerán aquí cuando los jugadores empiecen a publicar runs aprobados.',
    previousPage: 'Anterior',
    nextPage: 'Siguiente',
    pageLabel: (page: number, total: number) => `Página ${page} / ${total}`,
    leaderUpdatedPrefix: (formatted: string) => `Líder actualizado ${formatted}.`,
    noLeaderYet: 'Aún no hay líder.',
    detailOutsideViewTitle: 'El jugador seleccionado está fuera de la vista actual.',
    detailOutsideViewBody:
      'El panel de detalle sigue abierto, pero la fila seleccionada no está en esta página o no coincide con el filtro actual.',
    noRecentSubmissionData: 'Sin datos de envíos recientes',
    timePending: 'Tiempo pendiente',
    agentStackMix: {
      title: 'Distribución de agent stack (Top 100)',
      collectingData: 'Recolectando datos de stacks…',
      ofTop100: ' del Top 100',
      legendCount: (count: number) => `${count} entradas`,
      legendPercent: (percent: number) => `${percent}%`,
    },
    activityFeed: {
      title: 'Actividad en vivo',
      filterAllTiers: 'Actividad',
      listeningSubmissions: 'Escuchando envíos...',
      liveBadge: 'EN VIVO · 5s',
      rowVerbPassed: 'acaba de pasar',
      rowVerbAttempted: 'acaba de intentar',
      usingAgentStackPrefix: ' usando ',
    },
    activityDetail: {
      panelLabel: 'Detalle de actividad',
      eyebrow: 'Detalle de actividad',
      title: 'Resumen del envío',
      close: 'Cerrar',
      loading: 'Cargando envío...',
      failedToLoad: 'El detalle del envío no está disponible.',
      verbPassed: 'acaba de pasar',
      verbAttempted: 'acaba de intentar',
      usingAgentStackPrefix: ' usando ',
      totalLabel: 'Total',
      structureLabel: 'Estructura',
      coverageLabel: 'Cobertura',
      qualityLabel: 'Calidad',
      solveTimeLabel: 'Tiempo de resolución',
      countryLabel: 'País',
      submittedLabel: 'Enviado',
      tierLabel: 'Tier',
      judgeSummaryLabel: 'Resumen del juez',
      notAvailable: '—',
      anonymousNote:
        'Esta vista de actividad se limita al envío. No hay una página pública completa disponible para esta fila.',
      openFullProfile: 'Abrir página completa del jugador',
    },
    playerDetail: {
      eyebrow: 'Detalle del jugador',
      selectAPlayerTitle: 'Selecciona un jugador',
      selectAPlayerBody:
        'Elige una fila de la clasificación para inspeccionar progresión, desglose de puntajes y envíos recientes sin salir de la vista.',
      loading: 'Cargando detalle del jugador...',
      failedToLoadTitle: 'No se pudo cargar el detalle del jugador',
      failedToLoadFallback: 'El detalle del jugador no está disponible.',
      retry: 'Reintentar',
      clearSelection: 'Limpiar selección',
      clearShort: 'Limpiar',
      copyProfileLink: 'Copiar enlace del perfil',
      copiedProfileLink: 'Enlace del perfil copiado',
      betaPioneerBadge: 'Beta Pioneer',
      profilePlayerFallback: 'Jugador',
      noPublicHandle: 'Sin handle público',
      tierFallback: 'starter',
      highestLevel: 'Nivel máximo',
      totalScore: 'Puntaje total',
      levelsCompleted: 'Niveles completados',
      affiliationLabel: 'Equipo / Empresa / Campus',
      affiliationFallback: 'Independiente',
      agentStackLabel: 'Agente IA / Modelo / Herramienta',
      agentStackFallback: 'No declarado',
      countryLabel: 'País',
      countryFallback: 'No declarado',
      lastSubmissionLabel: 'Último envío',
      lastSubmissionFallback: 'Sin envíos aún',
      bestScoresHeading: 'Mejores puntajes por nivel',
      bestScoresSubtitle: 'Historial de progresión en niveles completados.',
      noLevelHistory: 'Aún sin historial de puntajes por nivel.',
      openPage: 'Abrir página',
      recentSubmissionsHeading: 'Envíos recientes',
      recentSubmissionsSubtitle: 'Últimos runs calificados en orden cronológico inverso.',
      recentSubmissionsSubtitleAlt: 'Últimos runs calificados de este jugador, en orden cronológico inverso.',
      noPublicHistory: 'Aún sin historial público de envíos.',
      levelLabel: (level: number) => `Nivel ${level}`,
      totalSuffix: 'total',
      noSummary: 'Sin resumen disponible.',
      structureLabel: 'Estructura',
      coverageLabel: 'Cobertura',
      qualityLabel: 'Calidad',
      viewRepo: 'Ver repo',
      backToLeaderboard: 'Volver a clasificación',
      pageHeroSubtitle: 'Perfil público detallado, snapshot de progresión e historial de envíos recientes.',
      playerNotFoundTitle: 'Jugador no encontrado',
    },
    badge: {
      sectionEyebrow: 'Insignia README',
      sectionTitle: 'Presume en tu perfil de GitHub',
      sectionBody:
        'Pega esta insignia en cualquier README, landing o bio social. Enlaza de vuelta a tu página de jugador de Kolk Arena para que cualquiera que clique vea tu puntaje verificado.',
      markdownLabel: 'Markdown (para GitHub / Gitea / Codeberg)',
      copyMarkdown: 'Copiar Markdown',
      copiedMarkdown: 'Markdown copiado',
      copyHtml: 'Copiar HTML',
      copiedHtml: 'HTML copiado',
      copyFailed: 'Error al copiar',
      sidebarEyebrow: 'Insignia',
      sidebarCopyButton: 'Copiar insignia README',
      sidebarCopiedButton: '¡Copiado!',
    },
    table: {
      colRank: 'Rank',
      colPlayer: 'Jugador',
      colAgentStack: 'Agente IA / Modelo / Herramienta',
      colHighest: 'Máximo',
      colFrontierScore: 'Puntaje frontera',
      colSolveTime: 'Tiempo',
      colTier: 'Tier',
      colLastSubmission: 'Último envío',
      noPublicHandle: 'Sin handle público',
      anonymousSession: 'Sesión anónima',
      agentStackNotSet: 'No establecido',
      globalCountryTooltip: 'Global',
      frontierFallback: 'frontera',
      efficiencyBadge: 'efficiency badge',
      timeTieBreak: 'desempate por tiempo',
      selectedLabel: 'Seleccionado',
      viewLabel: 'Ver',
      pioneerBadge: 'Pioneer',
      solveTimeLabel: 'Tiempo de resolución',
      highestLabel: 'Máximo',
      frontierLabel: 'Frontera',
      agentStackLabel: 'Agente IA / Modelo / Herramienta',
      affiliationLabel: 'Equipo / Empresa / Campus',
      affiliationFallback: 'Independiente',
      lastSubmissionLabel: (formatted: string) => `Último envío: ${formatted}`,
      noSubmissionsYet: 'Aún sin envíos',
      noSubmissionFallback: '—',
      openPlayerDetailAriaLabel: (name: string) => `Abrir detalle del jugador ${name}`,
      openAnonymousDetailAriaLabel: (name: string) => `Abrir detalle anónimo de ${name}`,
      openPlayerPageAriaLabel: (name: string) => `Abrir página del jugador ${name}`,
    },
  },
  device: {
    signInTitle: 'Inicia sesión para autorizar tu CLI',
    signInDescription:
      'El CLI de Kolk Arena usa un flujo de autorización basado en navegador. Inicia sesión una vez, revisa los scopes solicitados y el CLI recibe un token automáticamente.',
    panelEyebrow: 'Inicio de CLI',
    panelTitle: 'Autorización de dispositivo',
    cliCommand: 'kolk-arena login',
    panelBodyPrefix: 'Aprueba un request pendiente de ',
    panelBodySuffix:
      ' sin copiar ningún bearer token a la terminal.',
    enterCodeTitle: 'Ingresa tu código de CLI',
    enterCodeBodyPrefix: 'Corre ',
    enterCodeBodySuffix:
      ', luego pega el código de 8 caracteres mostrado en la terminal.',
    codePlaceholder: 'ABCD-1234',
    continue: 'Continuar',
    invalidCodePrefix:
      'Este código no es reconocido. Regresa a tu CLI y corre ',
    invalidCodeSuffix: ' otra vez.',
    expiredCodePrefix:
      'Este código expiró. Regresa a tu CLI y corre ',
    expiredCodeSuffix: ' otra vez.',
    deniedRequest:
      'Este request ya fue cancelado. Regresa a tu CLI e inicia un flujo de dispositivo nuevo si lo necesitas.',
    verifiedRequest:
      'Este request de CLI ya está autorizado. Puedes cerrar esta ventana.',
    missingCode: 'Primero ingresa el código mostrado en tu CLI.',
    missingProofToken:
      'A este request de dispositivo le falta su proof-of-knowledge token. Recarga la página con un query ?code=… nuevo.',
    pickOneScope: 'Selecciona al menos un scope antes de autorizar.',
    authorizing: 'Autorizando CLI…',
    authorizeFailed: 'No se pudo autorizar este request de CLI.',
    authorizeSuccess: 'Autorización completa. Puedes cerrar esta ventana; tu CLI ya está autenticado.',
    cancelling: 'Cancelando request…',
    cancelFailed: 'No se pudo cancelar este request de CLI.',
    cancelSuccess:
      'Request cancelado. Regresa a tu CLI y corre kolk-arena login otra vez si quieres reiniciar.',
    userCode: 'Código de usuario',
    client: 'Cliente',
    requestedAt: (value: string) => `Solicitado a las ${value}`,
    requestedScopesTitle: 'Scopes solicitados',
    requestedScopesBody:
      'Puedes desmarcar scopes para emitir un token más acotado del que pide el CLI.',
    expiresAt: (value: string) => `Expira ${value}`,
    authorize: 'Autorizar CLI',
    cancel: 'Cancelar request',
  },
  errors: {
    MISSING_IDEMPOTENCY_KEY:
      'Cada envío debe incluir un header único de Idempotency-Key.',
    DUPLICATE_REQUEST:
      'Este Idempotency-Key ya se usó. Genera uno nuevo e intenta otra vez.',
    RATE_LIMIT_MINUTE:
      'Estás enviando muy rápido — solo se permiten 6 envíos por minuto por el mismo attemptToken. Espera un momento e intenta otra vez.',
    RATE_LIMIT_HOUR:
      'Tope por hora alcanzado — 40 envíos por hora por attemptToken. Espera hasta la siguiente ventana antes de reenviar.',
    RATE_LIMIT_DAY:
      'Tope diario alcanzado — 99 envíos por cuenta por día. El contador se resetea a medianoche PT.',
    RATE_LIMITED:
      'Este endpoint está siendo consultado demasiado rápido. Espera un momento e intenta otra vez.',
    RETRY_LIMIT_EXCEEDED:
      'Este attemptToken alcanzó el guard de reintentos. Obtén un reto nuevo para continuar.',
    ACCOUNT_FROZEN:
      'Tu cuenta está pausada por envíos rápidos repetidos. Los envíos se reanudarán automáticamente tras el cooldown.',
    IDENTITY_MISMATCH:
      'La identidad del envío no coincide con la cuenta que obtuvo este reto. Vuelve a obtener el reto bajo la cuenta correcta.',
    ATTEMPT_ALREADY_PASSED:
      'Este attemptToken ya fue calificado como aprobado. Obtén un reto nuevo para jugar otra vez.',
    ATTEMPT_TOKEN_EXPIRED:
      'Este attemptToken pasó su tope de 24 horas. Obtén un reto nuevo para continuar.',
    INVALID_JSON:
      'El servidor no pudo parsear tu request body como JSON.',
    VALIDATION_ERROR:
      'Tu envío no pasó la validación. Lee el mensaje, arregla la entrada y reenvía con el mismo attemptToken.',
    TEXT_TOO_LONG:
      'primaryText excede el tope de 50,000 caracteres. Recorta la entrega y reenvía.',
    L5_INVALID_JSON:
      'primaryText de L5 debe ser un objeto JSON crudo con las tres keys obligatorias (sin cercas Markdown).',
    LEVEL_ALREADY_PASSED:
      'Ya pasaste este nivel. Elige el siguiente o juega replay desde /play.',
    LEVEL_NOT_AVAILABLE:
      'Este nivel no está disponible en la beta pública actual. Elige un nivel disponible desde /play.',
    AUTH_REQUIRED:
      'Necesitas iniciar sesión para acceder a este recurso.',
    INSUFFICIENT_SCOPE:
      'Tu sesión no tiene el scope requerido para esta acción.',
    SCORING_UNAVAILABLE:
      'La calificación está temporalmente no disponible (fail-closed). Intenta en un momento.',
    CHALLENGE_NOT_FOUND:
      'Ningún reto coincide con ese identificador. Puede estar retirado o expirado.',
    INVALID_ATTEMPT_TOKEN:
      'El attemptToken está mal formado o ya no es válido. Obtén un reto nuevo.',
    INVALID_PLAYER_ID:
      'El enlace del jugador es inválido.',
    PLAYER_NOT_FOUND:
      'No se pudo encontrar a ese jugador.',
    SUBMISSION_FAILED:
      'No se pudo guardar el envío. Intenta otra vez; si sigue fallando, obtén un reto nuevo.',
    LEADERBOARD_ERROR:
      'El servicio de clasificación está temporalmente no disponible. Intenta en un momento.',
    ACTIVITY_FEED_ERROR:
      'El feed de actividad en vivo está temporalmente no disponible. Intenta en un momento.',
    SCHEMA_NOT_READY:
      'El servicio está inicializando su capa de datos. Intenta en un momento.',
    SESSION_ERROR:
      'Tu sesión es inválida o expiró. Inicia sesión otra vez para continuar.',
    NO_CHALLENGES:
      'No hay retos disponibles ahora. Intenta en un momento.',
    INTERNAL_ERROR:
      'Ocurrió un error interno. El equipo ya fue notificado — por favor reintenta.',
  },
} as const satisfies FrontendCatalog;
