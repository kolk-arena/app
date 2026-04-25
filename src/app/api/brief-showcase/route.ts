import { NextResponse } from 'next/server';
import { isBriefShowcaseEnabled, normalizeLocale } from '@/lib/kolk/brief-showcase/config';
import {
  getLatestPromotedBatch,
  toClientRequests,
} from '@/lib/kolk/brief-showcase/store';
import { createIpRateLimiter, getClientIp } from '@/lib/kolk/rate-limit';

// Per-IP bucket: the homepage hits this on mount and when an expired batch
// is refreshed. 30 reqs/minute/IP comfortably covers normal browsing plus
// one rapid carousel reload, while capping a single attacker at a level
// where they can't meaningfully amplify the paid AI-generation path behind
// the scenes.
const publicReadLimiter = createIpRateLimiter({
  windowMs: 60_000,
  maxPerWindow: 30,
});

type ShowcaseRequest = {
  level: number;
  scenarioTitle: string;
  industry: string;
  requesterName: string;
  requesterRole: string;
  requestContext: string;
  scoringFocus: string[];
  outputShape: string[];
};

const FALLBACK_REQUESTS: Record<'en' | 'es-mx' | 'zh-tw', ShowcaseRequest[]> = {
  en: [
    {
      level: 2,
      scenarioTitle: 'Translate a customer update',
      industry: 'Local services',
      requesterName: 'Marta Ruiz',
      requesterRole: 'Operations Lead',
      requestContext: 'A fictional home-services team needs a concise customer update rewritten for Mexican Spanish. The message must sound natural, respectful, and ready to send without extra explanation.',
      scoringFocus: ['Locale fit', 'Clear customer action', 'No wrapper prose'],
      outputShape: ['One translated message', 'Plain text only'],
    },
    {
      level: 3,
      scenarioTitle: 'Shape a small business profile',
      industry: 'Advisory services',
      requesterName: 'Jordan Lee',
      requesterRole: 'Founder',
      requestContext: 'A fictional advisory studio has strong referrals but weak positioning. It needs a clean profile that explains who it helps, what it offers, and why the service feels trustworthy.',
      scoringFocus: ['Professional structure', 'Specific services', 'Conversion clarity'],
      outputShape: ['Short overview', 'Service bullets', 'Trust signals'],
    },
    {
      level: 4,
      scenarioTitle: 'Turn notes into support copy',
      industry: 'Subscription software',
      requesterName: 'Elena Novak',
      requesterRole: 'Support Manager',
      requestContext: 'A fictional SaaS team has messy internal notes about a billing change. It needs customer-facing support copy that is calm, precise, and easy to scan.',
      scoringFocus: ['Accurate transformation', 'Helpful tone', 'Actionable next step'],
      outputShape: ['Customer notice', 'FAQ bullets', 'Support CTA'],
    },
    {
      level: 5,
      scenarioTitle: 'Write a welcome flow',
      industry: 'Hospitality',
      requesterName: 'Luis Romero',
      requesterRole: 'Guest Experience Manager',
      requestContext: 'A fictional boutique stay wants an automated welcome message for new guests. The delivery must include a warm WhatsApp message, quick facts, and a first-step checklist.',
      scoringFocus: ['Three-part delivery', 'Mobile-friendly wording', 'Immediate next action'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
    {
      level: 6,
      scenarioTitle: 'Create a launch note',
      industry: 'Education',
      requesterName: 'Sofia Marin',
      requesterRole: 'Program Director',
      requestContext: 'A fictional learning program is opening a new cohort. It needs a one-page launch note that explains the value, the audience, and the first registration step.',
      scoringFocus: ['Audience fit', 'Offer clarity', 'Concise structure'],
      outputShape: ['Headline', 'One-page copy', 'CTA section'],
    },
    {
      level: 7,
      scenarioTitle: 'Assemble a prompt pack',
      industry: 'Retail operations',
      requesterName: 'Mina Park',
      requesterRole: 'Retail Ops Lead',
      requestContext: 'A fictional retail team wants reusable prompts for daily store updates. The agent must turn a loose operating need into practical prompts that staff can run repeatedly.',
      scoringFocus: ['Reusable prompt design', 'Operational realism', 'Clear boundaries'],
      outputShape: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
    {
      level: 8,
      scenarioTitle: 'Build a compact delivery kit',
      industry: 'Professional services',
      requesterName: 'Noah Chen',
      requesterRole: 'Client Success Lead',
      requestContext: 'A fictional services team needs a compact kit for a new offer. The final delivery should feel ready for a small team to copy into a site, assistant, and customer message.',
      scoringFocus: ['Cross-channel consistency', 'Commercial clarity', 'Execution-ready output'],
      outputShape: ['One-page copy', 'Prompt pack', 'WhatsApp welcome'],
    },
    {
      level: 5,
      scenarioTitle: 'Prepare a first-contact message',
      industry: 'Wellness',
      requesterName: 'Camila Torres',
      requesterRole: 'Studio Manager',
      requestContext: 'A fictional wellness studio needs a friendly first-contact flow for new members. The agent must keep it practical, warm, and easy to paste into a real onboarding tool.',
      scoringFocus: ['Welcoming tone', 'Useful facts', 'Clear checklist'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
  ],
  'es-mx': [
    {
      level: 2,
      scenarioTitle: 'Traducir una actualización para clientes',
      industry: 'Servicios locales',
      requesterName: 'Marta Ruiz',
      requesterRole: 'Líder de operaciones',
      requestContext: 'Un equipo ficticio de servicios para el hogar necesita una actualización breve en español de México. El mensaje debe sonar natural, respetuoso y listo para enviarse sin explicación extra.',
      scoringFocus: ['Adaptación local', 'Acción clara para el cliente', 'Sin texto envoltorio'],
      outputShape: ['Un mensaje traducido', 'Solo texto plano'],
    },
    {
      level: 3,
      scenarioTitle: 'Dar forma a un perfil de negocio',
      industry: 'Servicios de asesoría',
      requesterName: 'Jordan Lee',
      requesterRole: 'Fundador',
      requestContext: 'Un estudio ficticio de asesoría tiene buenas referencias pero posicionamiento débil. Necesita un perfil claro que explique a quién ayuda, qué ofrece y por qué inspira confianza.',
      scoringFocus: ['Estructura profesional', 'Servicios específicos', 'Claridad de conversión'],
      outputShape: ['Resumen breve', 'Bullets de servicios', 'Señales de confianza'],
    },
    {
      level: 4,
      scenarioTitle: 'Convertir notas en soporte al cliente',
      industry: 'Software por suscripción',
      requesterName: 'Elena Novak',
      requesterRole: 'Gerente de soporte',
      requestContext: 'Un equipo ficticio de SaaS tiene notas internas desordenadas sobre un cambio de facturación. Necesita un texto para clientes que sea tranquilo, preciso y fácil de escanear.',
      scoringFocus: ['Transformación precisa', 'Tono útil', 'Siguiente paso accionable'],
      outputShape: ['Aviso para clientes', 'Bullets de FAQ', 'CTA de soporte'],
    },
    {
      level: 5,
      scenarioTitle: 'Escribir un flujo de bienvenida',
      industry: 'Hospitalidad',
      requesterName: 'Luis Romero',
      requesterRole: 'Gerente de experiencia',
      requestContext: 'Una estancia boutique ficticia quiere automatizar el mensaje de bienvenida para nuevos huéspedes. La entrega debe incluir WhatsApp, datos rápidos y una checklist de primer paso.',
      scoringFocus: ['Entrega en tres partes', 'Texto amigable para móvil', 'Acción inmediata'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
    {
      level: 6,
      scenarioTitle: 'Crear una nota de lanzamiento',
      industry: 'Educación',
      requesterName: 'Sofia Marin',
      requesterRole: 'Directora de programa',
      requestContext: 'Un programa educativo ficticio abre una nueva generación. Necesita una nota de una página que explique el valor, la audiencia y el primer paso de registro.',
      scoringFocus: ['Ajuste a la audiencia', 'Claridad de oferta', 'Estructura concisa'],
      outputShape: ['Titular', 'Copy de una página', 'Sección CTA'],
    },
    {
      level: 7,
      scenarioTitle: 'Armar un paquete de prompts',
      industry: 'Operaciones retail',
      requesterName: 'Mina Park',
      requesterRole: 'Líder de operaciones retail',
      requestContext: 'Un equipo ficticio de retail quiere prompts reutilizables para actualizaciones diarias de tienda. El agente debe convertir una necesidad operativa amplia en prompts prácticos.',
      scoringFocus: ['Diseño reutilizable', 'Realismo operativo', 'Límites claros'],
      outputShape: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
    {
      level: 8,
      scenarioTitle: 'Construir un kit compacto de entrega',
      industry: 'Servicios profesionales',
      requesterName: 'Noah Chen',
      requesterRole: 'Líder de éxito del cliente',
      requestContext: 'Un equipo ficticio de servicios necesita un kit compacto para una nueva oferta. La entrega debe estar lista para copiarse a un sitio, asistente y mensaje al cliente.',
      scoringFocus: ['Consistencia entre canales', 'Claridad comercial', 'Salida lista para ejecutar'],
      outputShape: ['Copy de una página', 'Paquete de prompts', 'Bienvenida por WhatsApp'],
    },
    {
      level: 5,
      scenarioTitle: 'Preparar un mensaje de primer contacto',
      industry: 'Bienestar',
      requesterName: 'Camila Torres',
      requesterRole: 'Gerente de estudio',
      requestContext: 'Un estudio ficticio de bienestar necesita un flujo amable para nuevos miembros. El agente debe mantenerlo práctico, cálido y fácil de pegar en una herramienta de onboarding.',
      scoringFocus: ['Tono de bienvenida', 'Datos útiles', 'Checklist clara'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
  ],
  'zh-tw': [
    {
      level: 2,
      scenarioTitle: '翻譯客戶更新訊息',
      industry: '在地服務',
      requesterName: 'Marta Ruiz',
      requesterRole: '營運負責人',
      requestContext: '一個虛構的居家服務團隊需要把客戶更新改寫成墨西哥西語。訊息要自然、有禮貌，且能直接發送，不需要額外解釋。',
      scoringFocus: ['在地語氣', '清楚的客戶動作', '沒有包裝文字'],
      outputShape: ['一段翻譯訊息', '純文字'],
    },
    {
      level: 3,
      scenarioTitle: '整理小型商業介紹',
      industry: '顧問服務',
      requesterName: 'Jordan Lee',
      requesterRole: '創辦人',
      requestContext: '一個虛構的顧問工作室有不錯的轉介紹，但定位不清。它需要一份清楚的介紹，說明服務對象、提供內容，以及為什麼值得信任。',
      scoringFocus: ['專業結構', '具體服務', '轉換清晰度'],
      outputShape: ['短介紹', '服務條列', '信任訊號'],
    },
    {
      level: 4,
      scenarioTitle: '把筆記整理成客服文案',
      industry: '訂閱制軟體',
      requesterName: 'Elena Novak',
      requesterRole: '客服經理',
      requestContext: '一個虛構的 SaaS 團隊有一批關於帳單調整的內部筆記。它需要一份給客戶看的說明，語氣冷靜、精準且容易掃讀。',
      scoringFocus: ['轉換準確', '語氣有幫助', '下一步明確'],
      outputShape: ['客戶公告', 'FAQ 條列', '客服 CTA'],
    },
    {
      level: 5,
      scenarioTitle: '撰寫歡迎流程',
      industry: '旅宿服務',
      requesterName: 'Luis Romero',
      requesterRole: '住客體驗經理',
      requestContext: '一間虛構的精品住宿想自動化新住客歡迎訊息。交付物必須包含 WhatsApp 訊息、快速資訊與第一步 checklist。',
      scoringFocus: ['三段式交付', '手機友善文案', '立即下一步'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
    {
      level: 6,
      scenarioTitle: '製作招生啟動說明',
      industry: '教育',
      requesterName: 'Sofia Marin',
      requesterRole: '專案主任',
      requestContext: '一個虛構的學習專案即將開放新梯次。它需要一頁式啟動文案，說清楚價值、對象與第一個報名步驟。',
      scoringFocus: ['受眾貼合', '方案清楚', '結構精簡'],
      outputShape: ['標題', '一頁式文案', 'CTA 區塊'],
    },
    {
      level: 7,
      scenarioTitle: '組裝 prompt pack',
      industry: '零售營運',
      requesterName: 'Mina Park',
      requesterRole: '零售營運負責人',
      requestContext: '一個虛構的零售團隊想要可重複使用的每日門市更新 prompts。Agent 必須把鬆散的營運需求變成員工能反覆使用的實用 prompts。',
      scoringFocus: ['可重複使用', '營運真實感', '邊界清楚'],
      outputShape: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
    {
      level: 8,
      scenarioTitle: '建立精簡交付套件',
      industry: '專業服務',
      requesterName: 'Noah Chen',
      requesterRole: '客戶成功負責人',
      requestContext: '一個虛構的服務團隊需要為新方案準備精簡套件。最終交付應該能直接放進網站、助理與客戶訊息中。',
      scoringFocus: ['跨通路一致', '商業清晰度', '可直接執行'],
      outputShape: ['一頁式文案', 'Prompt pack', 'WhatsApp welcome'],
    },
    {
      level: 5,
      scenarioTitle: '準備第一次接觸訊息',
      industry: '身心健康',
      requesterName: 'Camila Torres',
      requesterRole: '工作室經理',
      requestContext: '一個虛構的健康工作室需要給新會員的友善第一步流程。Agent 要讓內容實用、溫暖，且容易貼進 onboarding 工具。',
      scoringFocus: ['歡迎語氣', '有用資訊', '清楚 checklist'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
  ],
};

function getFallbackShowcase(lang: 'en' | 'es-mx' | 'zh-tw') {
  return FALLBACK_REQUESTS[lang] ?? FALLBACK_REQUESTS.en;
}

export async function GET(request: Request) {
  if (!isBriefShowcaseEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  const ip = getClientIp(request);
  if (!publicReadLimiter.check(ip)) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMITED' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Cache-Control': 'no-store',
        },
      },
    );
  }

  const { searchParams } = new URL(request.url);
  const lang = normalizeLocale(searchParams.get('lang'));

  try {
    const rows = await getLatestPromotedBatch();
    if (!rows || rows.length === 0) {
      const now = new Date();
      return NextResponse.json(
        {
          kind: 'challenge_brief_preview',
          synthetic: true,
          disclaimer: 'Synthetic examples, not customer work. Official play starts from /play or the L0-L8 API.',
          officialPlayPath: '/play',
          batchId: 'static-fallback-2026-04-24',
          generatedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 20 * 60 * 1000).toISOString(),
          locale: lang,
          fallback: true,
          requests: getFallbackShowcase(lang),
        },
        {
          headers: {
            'Cache-Control': 's-maxage=300, stale-while-revalidate=300',
          },
        },
      );
    }

    const requests = toClientRequests(rows, lang);
    const fallback = lang !== 'en' && rows.some((row) => !row.translations?.[lang]);

    return NextResponse.json(
      {
        kind: 'challenge_brief_preview',
        synthetic: true,
        disclaimer: 'Synthetic examples, not customer work. Official play starts from /play or the L0-L8 API.',
        officialPlayPath: '/play',
        batchId: rows[0].batch_id,
        generatedAt: rows[0].generated_at,
        expiresAt: rows[0].expires_at,
        locale: lang,
        fallback,
        requests,
      },
      {
        headers: {
          'Cache-Control': 's-maxage=1200, stale-while-revalidate=300',
        },
      },
    );
  } catch (error) {
    console.error('[api/brief-showcase] Error:', error);
    return NextResponse.json(
      {
        error: 'Unable to load brief showcase',
        code: 'SHOWCASE_UNAVAILABLE',
      },
      { status: 503 },
    );
  }
}
