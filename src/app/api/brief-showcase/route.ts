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
      scenarioTitle: 'URGENT: Localize Customer Update for Mexican Spanish',
      industry: 'Local services',
      requesterName: 'Marta Ruiz',
      requesterRole: 'Operations Lead',
      requestContext: 'A home-services team is behind on customer notices and needs a concise update rewritten for Mexican Spanish today. Budget is $80. The message must sound natural, respectful, and ready to send without extra explanation.',
      scoringFocus: ['Locale fit', 'Clear customer action', 'No wrapper prose'],
      outputShape: ['One translated message', 'Plain text only'],
    },
    {
      level: 3,
      scenarioTitle: 'Need a Trustworthy Small Business Profile',
      industry: 'Advisory services',
      requesterName: 'Jordan Lee',
      requesterRole: 'Founder',
      requestContext: 'An advisory studio has strong referrals but weak positioning, and the founder needs the profile cleaned up before a sales call. Budget is $180. It needs to explain who the studio helps, what it offers, and why the service feels trustworthy.',
      scoringFocus: ['Professional structure', 'Specific services', 'Conversion clarity'],
      outputShape: ['Short overview', 'Service bullets', 'Trust signals'],
    },
    {
      level: 4,
      scenarioTitle: 'Convert Messy Billing Notes into Customer Support Copy',
      industry: 'Subscription software',
      requesterName: 'Elena Novak',
      requesterRole: 'Support Manager',
      requestContext: 'A SaaS team has messy internal notes about a billing change and support is already getting confused tickets. Budget is $220. They need customer-facing support copy that is calm, precise, and easy to scan.',
      scoringFocus: ['Accurate transformation', 'Helpful tone', 'Actionable next step'],
      outputShape: ['Customer notice', 'FAQ bullets', 'Support CTA'],
    },
    {
      level: 5,
      scenarioTitle: 'Build a Guest Welcome Flow Before Check-In Spike',
      industry: 'Hospitality',
      requesterName: 'Luis Romero',
      requesterRole: 'Guest Experience Manager',
      requestContext: 'A boutique stay has a check-in spike coming and needs an automated welcome flow before guests start arriving. Budget is $320. The delivery must include a warm WhatsApp message, quick facts, and a first-step checklist.',
      scoringFocus: ['Three-part delivery', 'Mobile-friendly wording', 'Immediate next action'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
    {
      level: 6,
      scenarioTitle: 'Need Launch Copy for a New Cohort',
      industry: 'Education',
      requesterName: 'Sofia Marin',
      requesterRole: 'Program Director',
      requestContext: 'A learning program is opening a new cohort and the director needs launch copy before registration opens. Budget is $280. They need a one-page launch note that explains the value, the audience, and the first registration step.',
      scoringFocus: ['Audience fit', 'Offer clarity', 'Concise structure'],
      outputShape: ['Headline', 'One-page copy', 'CTA section'],
    },
    {
      level: 7,
      scenarioTitle: 'Create Reusable Store Ops Prompt Pack',
      industry: 'Retail operations',
      requesterName: 'Mina Park',
      requesterRole: 'Retail Ops Lead',
      requestContext: 'A retail team keeps rewriting daily store updates by hand and needs reusable prompts before next week. Budget is $450. The agent must turn a loose operating need into practical prompts that staff can run repeatedly.',
      scoringFocus: ['Reusable prompt design', 'Operational realism', 'Clear boundaries'],
      outputShape: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
    {
      level: 8,
      scenarioTitle: 'Build Compact Delivery Kit for New Service Offer',
      industry: 'Professional services',
      requesterName: 'Noah Chen',
      requesterRole: 'Client Success Lead',
      requestContext: 'A services team is launching a new offer and needs a compact delivery kit before the sales team starts outreach. Budget is $650. The final delivery should be ready to copy into a site, assistant, and customer message.',
      scoringFocus: ['Cross-channel consistency', 'Commercial clarity', 'Execution-ready output'],
      outputShape: ['One-page copy', 'Prompt pack', 'WhatsApp welcome'],
    },
    {
      level: 5,
      scenarioTitle: 'Prepare First-Contact Flow for New Members',
      industry: 'Wellness',
      requesterName: 'Camila Torres',
      requesterRole: 'Studio Manager',
      requestContext: 'A wellness studio is losing new-member momentum because first replies are inconsistent. Budget is $240. The agent must create a friendly first-contact flow that is practical, warm, and easy to paste into a real onboarding tool.',
      scoringFocus: ['Welcoming tone', 'Useful facts', 'Clear checklist'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
  ],
  'es-mx': [
    {
      level: 2,
      scenarioTitle: 'URGENTE: Localizar actualización para clientes',
      industry: 'Servicios locales',
      requesterName: 'Marta Ruiz',
      requesterRole: 'Líder de operaciones',
      requestContext: 'Un equipo de servicios para el hogar va tarde con avisos a clientes y necesita una actualización breve en español de México hoy. Presupuesto: $80. El mensaje debe sonar natural, respetuoso y listo para enviarse sin explicación extra.',
      scoringFocus: ['Adaptación local', 'Acción clara para el cliente', 'Sin texto envoltorio'],
      outputShape: ['Un mensaje traducido', 'Solo texto plano'],
    },
    {
      level: 3,
      scenarioTitle: 'Necesito un perfil de negocio confiable',
      industry: 'Servicios de asesoría',
      requesterName: 'Jordan Lee',
      requesterRole: 'Fundador',
      requestContext: 'Un estudio de asesoría tiene buenas referencias pero posicionamiento débil, y el fundador necesita arreglar el perfil antes de una llamada comercial. Presupuesto: $180. Debe explicar a quién ayuda, qué ofrece y por qué inspira confianza.',
      scoringFocus: ['Estructura profesional', 'Servicios específicos', 'Claridad de conversión'],
      outputShape: ['Resumen breve', 'Bullets de servicios', 'Señales de confianza'],
    },
    {
      level: 4,
      scenarioTitle: 'Convertir notas de facturación en copy de soporte',
      industry: 'Software por suscripción',
      requesterName: 'Elena Novak',
      requesterRole: 'Gerente de soporte',
      requestContext: 'Un equipo SaaS tiene notas internas desordenadas sobre un cambio de facturación y soporte ya recibe tickets confundidos. Presupuesto: $220. Necesita un texto para clientes que sea tranquilo, preciso y fácil de escanear.',
      scoringFocus: ['Transformación precisa', 'Tono útil', 'Siguiente paso accionable'],
      outputShape: ['Aviso para clientes', 'Bullets de FAQ', 'CTA de soporte'],
    },
    {
      level: 5,
      scenarioTitle: 'Crear flujo de bienvenida antes del pico de check-in',
      industry: 'Hospitalidad',
      requesterName: 'Luis Romero',
      requesterRole: 'Gerente de experiencia',
      requestContext: 'Una estancia boutique tiene un pico de check-in cerca y necesita automatizar el mensaje de bienvenida antes de que lleguen los huéspedes. Presupuesto: $320. La entrega debe incluir WhatsApp, datos rápidos y una checklist de primer paso.',
      scoringFocus: ['Entrega en tres partes', 'Texto amigable para móvil', 'Acción inmediata'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
    {
      level: 6,
      scenarioTitle: 'Necesito copy de lanzamiento para una nueva generación',
      industry: 'Educación',
      requesterName: 'Sofia Marin',
      requesterRole: 'Directora de programa',
      requestContext: 'Un programa educativo abre una nueva generación y la directora necesita copy de lanzamiento antes de abrir registros. Presupuesto: $280. Necesita una nota de una página que explique el valor, la audiencia y el primer paso de registro.',
      scoringFocus: ['Ajuste a la audiencia', 'Claridad de oferta', 'Estructura concisa'],
      outputShape: ['Titular', 'Copy de una página', 'Sección CTA'],
    },
    {
      level: 7,
      scenarioTitle: 'Crear prompt pack reutilizable para operaciones retail',
      industry: 'Operaciones retail',
      requesterName: 'Mina Park',
      requesterRole: 'Líder de operaciones retail',
      requestContext: 'Un equipo retail reescribe a mano las actualizaciones diarias de tienda y necesita prompts reutilizables antes de la próxima semana. Presupuesto: $450. El agente debe convertir una necesidad operativa amplia en prompts prácticos.',
      scoringFocus: ['Diseño reutilizable', 'Realismo operativo', 'Límites claros'],
      outputShape: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
    {
      level: 8,
      scenarioTitle: 'Construir kit compacto para nueva oferta de servicio',
      industry: 'Servicios profesionales',
      requesterName: 'Noah Chen',
      requesterRole: 'Líder de éxito del cliente',
      requestContext: 'Un equipo de servicios lanza una nueva oferta y necesita un kit compacto antes de que ventas empiece outreach. Presupuesto: $650. La entrega debe estar lista para copiarse a un sitio, asistente y mensaje al cliente.',
      scoringFocus: ['Consistencia entre canales', 'Claridad comercial', 'Salida lista para ejecutar'],
      outputShape: ['Copy de una página', 'Paquete de prompts', 'Bienvenida por WhatsApp'],
    },
    {
      level: 5,
      scenarioTitle: 'Preparar flujo de primer contacto para nuevos miembros',
      industry: 'Bienestar',
      requesterName: 'Camila Torres',
      requesterRole: 'Gerente de estudio',
      requestContext: 'Un estudio de bienestar está perdiendo impulso con nuevos miembros porque las primeras respuestas son inconsistentes. Presupuesto: $240. El agente debe crear un flujo amable, práctico y fácil de pegar en una herramienta de onboarding.',
      scoringFocus: ['Tono de bienvenida', 'Datos útiles', 'Checklist clara'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
  ],
  'zh-tw': [
    {
      level: 2,
      scenarioTitle: '急件：在地化客戶更新訊息',
      industry: '在地服務',
      requesterName: 'Marta Ruiz',
      requesterRole: '營運負責人',
      requestContext: '一個居家服務團隊的客戶通知已經延遲，今天需要把更新訊息改寫成墨西哥西語。預算是 $80。訊息要自然、有禮貌，且能直接發送，不需要額外解釋。',
      scoringFocus: ['在地語氣', '清楚的客戶動作', '沒有包裝文字'],
      outputShape: ['一段翻譯訊息', '純文字'],
    },
    {
      level: 3,
      scenarioTitle: '需要可信任的小型商業介紹',
      industry: '顧問服務',
      requesterName: 'Jordan Lee',
      requesterRole: '創辦人',
      requestContext: '一個顧問工作室有不錯的轉介紹，但定位不清，創辦人要在銷售電話前把介紹修好。預算是 $180。它需要一份清楚的介紹，說明服務對象、提供內容，以及為什麼值得信任。',
      scoringFocus: ['專業結構', '具體服務', '轉換清晰度'],
      outputShape: ['短介紹', '服務條列', '信任訊號'],
    },
    {
      level: 4,
      scenarioTitle: '把帳單筆記整理成客服文案',
      industry: '訂閱制軟體',
      requesterName: 'Elena Novak',
      requesterRole: '客服經理',
      requestContext: '一個 SaaS 團隊有一批關於帳單調整的內部筆記，客服已經開始收到困惑的工單。預算是 $220。它需要一份給客戶看的說明，語氣冷靜、精準且容易掃讀。',
      scoringFocus: ['轉換準確', '語氣有幫助', '下一步明確'],
      outputShape: ['客戶公告', 'FAQ 條列', '客服 CTA'],
    },
    {
      level: 5,
      scenarioTitle: '入住高峰前建立住客歡迎流程',
      industry: '旅宿服務',
      requesterName: 'Luis Romero',
      requesterRole: '住客體驗經理',
      requestContext: '一間精品住宿即將迎來入住高峰，必須在住客抵達前自動化歡迎流程。預算是 $320。交付物必須包含 WhatsApp 訊息、快速資訊與第一步 checklist。',
      scoringFocus: ['三段式交付', '手機友善文案', '立即下一步'],
      outputShape: ['whatsapp_message string', 'quick_facts string', 'first_step_checklist string'],
    },
    {
      level: 6,
      scenarioTitle: '需要新梯次招生啟動文案',
      industry: '教育',
      requesterName: 'Sofia Marin',
      requesterRole: '專案主任',
      requestContext: '一個學習專案即將開放新梯次，專案主任需要在開放報名前完成啟動文案。預算是 $280。它需要一頁式啟動文案，說清楚價值、對象與第一個報名步驟。',
      scoringFocus: ['受眾貼合', '方案清楚', '結構精簡'],
      outputShape: ['標題', '一頁式文案', 'CTA 區塊'],
    },
    {
      level: 7,
      scenarioTitle: '建立可重用的門市營運 Prompt Pack',
      industry: '零售營運',
      requesterName: 'Mina Park',
      requesterRole: '零售營運負責人',
      requestContext: '一個零售團隊每天都手動重寫門市更新，下週前需要可重複使用的 prompts。預算是 $450。Agent 必須把鬆散的營運需求變成員工能反覆使用的實用 prompts。',
      scoringFocus: ['可重複使用', '營運真實感', '邊界清楚'],
      outputShape: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
    },
    {
      level: 8,
      scenarioTitle: '為新服務方案建立精簡交付套件',
      industry: '專業服務',
      requesterName: 'Noah Chen',
      requesterRole: '客戶成功負責人',
      requestContext: '一個服務團隊正在推出新方案，業務開始外聯前需要一套精簡交付套件。預算是 $650。最終交付應該能直接放進網站、助理與客戶訊息中。',
      scoringFocus: ['跨通路一致', '商業清晰度', '可直接執行'],
      outputShape: ['一頁式文案', 'Prompt pack', 'WhatsApp welcome'],
    },
    {
      level: 5,
      scenarioTitle: '為新會員準備第一次接觸流程',
      industry: '身心健康',
      requesterName: 'Camila Torres',
      requesterRole: '工作室經理',
      requestContext: '一個健康工作室因為第一則回覆不一致，正在流失新會員的動能。預算是 $240。Agent 要建立友善、實用、溫暖且容易貼進 onboarding 工具的第一次接觸流程。',
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
