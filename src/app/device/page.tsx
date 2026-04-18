import { AuthSignInPanel } from '@/app/auth-sign-in-panel';
import { DeviceFlowPanel } from '@/app/device/device-flow-panel';
import { resolveArenaUserFromServerComponent } from '@/lib/kolk/auth/server';
import { describeScope, normalizeUserCode } from '@/lib/kolk/device-flow';
import { supabaseAdmin } from '@/lib/kolk/db';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

type DeviceRequestView = {
  userCode: string;
  /**
   * The opaque device_code from `ka_device_codes` is forwarded to the client
   * so that the verify/deny POSTs carry proof-of-knowledge (~2^238 entropy).
   * It is only exposed on this page to the signed-in user who loaded the
   * pending row; it is never written to URLs, logs, or shared storage.
   */
  deviceCode: string | null;
  clientKind: string;
  requestedScopes: Array<{ scope: string; label: string; detail: string }>;
  grantedScopes: string[];
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'verified' | 'denied' | 'expired' | 'invalid';
};

export default async function DevicePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const initialCodeRaw = Array.isArray(query.code) ? query.code[0] ?? '' : query.code ?? '';
  const initialCode = normalizeUserCode(initialCodeRaw);
  const user = await resolveArenaUserFromServerComponent();
  const nextPath = initialCode ? `/device?code=${encodeURIComponent(initialCode)}` : '/device';

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <AuthSignInPanel
            nextPath={nextPath}
            title="Sign in to authorize your CLI"
            description="The Kolk Arena CLI uses a browser-based device authorization flow. Sign in once, review the requested scopes, and the CLI receives a token automatically."
          />
        </div>
      </main>
    );
  }

  let deviceRequest: DeviceRequestView | null = null;

  if (initialCode) {
    const { data: rowRaw } = await supabaseAdmin
      .from('ka_device_codes')
      .select('user_code, client_kind, requested_scopes, granted_scopes, created_at, expires_at, verified_at, denied_at')
      .eq('user_code', initialCode)
      .maybeSingle();

    const row = rowRaw as {
      user_code: string;
      client_kind: string;
      requested_scopes: string[] | null;
      granted_scopes: string[] | null;
      created_at: string;
      expires_at: string;
      verified_at: string | null;
      denied_at: string | null;
    } | null;

    if (!row) {
      deviceRequest = {
        userCode: initialCode,
        deviceCode: null,
        clientKind: 'kolk-arena-cli',
        requestedScopes: [],
        grantedScopes: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        status: 'invalid',
      };
    } else {
      const status =
        row.denied_at ? 'denied'
        : row.verified_at ? 'verified'
        : 'pending';

      // Fetch device_code alongside user_code only for pending rows, and only
      // when the signed-in user is about to authorize. We expose it to the
      // browser so verify/deny POSTs carry proof-of-knowledge, defeating a
      // cross-site attacker who can only guess user_codes.
      let deviceCode: string | null = null;
      if (status === 'pending') {
        const { data: secretRowRaw } = await supabaseAdmin
          .from('ka_device_codes')
          .select('device_code')
          .eq('user_code', initialCode)
          .maybeSingle();
        const secretRow = secretRowRaw as { device_code: string } | null;
        deviceCode = secretRow?.device_code ?? null;
      }

      deviceRequest = {
        userCode: row.user_code,
        deviceCode,
        clientKind: row.client_kind,
        requestedScopes: (row.requested_scopes ?? []).map((scope) => ({
          scope,
          ...describeScope(scope),
        })),
        grantedScopes: row.granted_scopes ?? [],
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        status,
      };
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <DeviceFlowPanel
          initialCode={initialCode}
          deviceRequest={deviceRequest}
        />
      </div>
    </main>
  );
}
