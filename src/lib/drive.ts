// Google Drive 업로드 유틸 — 방법 1 (OAuth 토큰 클라이언트 + drive.file 스코프)
// 사용자가 본인 계정으로 로그인 후 본인 드라이브에 파일을 업로드한다.
// 키오스크/공용 기기 대응: 매 호출마다 계정 선택 → 업로드 → 토큰 폐기.

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: { access_token?: string; error?: string; error_description?: string }) => void;
            error_callback?: (err: unknown) => void;
          }) => { requestAccessToken: (overrides?: { prompt?: string }) => void };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let gsiLoadingPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("window 없음"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoadingPromise) return gsiLoadingPromise;

  gsiLoadingPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("GSI 스크립트 로드 실패")), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GSI 스크립트 로드 실패"));
    document.head.appendChild(s);
  });

  return gsiLoadingPromise;
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID 가 설정되지 않았습니다");

  await loadGsi();
  const oauth2 = window.google!.accounts.oauth2;

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      // 매번 계정 선택 화면을 보여줘서 공용 기기에서 직전 사용자 계정이 자동선택되지 않도록
      prompt: "select_account",
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || "토큰 획득 실패"));
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(err instanceof Error ? err : new Error("OAuth 오류"));
      },
    });
    client.requestAccessToken();
  });
}

function revokeToken(token: string) {
  try {
    window.google?.accounts.oauth2.revoke(token);
  } catch {
    // 무시 — best effort
  }
}

export interface DriveUploadResult {
  id: string;
  name: string;
  webViewLink?: string;
}

export interface DriveFileInput {
  blob: Blob;
  name: string;
  mime: string;
}

async function uploadOne(
  token: string,
  file: DriveFileInput
): Promise<DriveUploadResult> {
  const metadata = { name: file.name, mimeType: file.mime };
  const form = new FormData();
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  form.append("file", file.blob, file.name);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`업로드 실패 (${res.status}): ${text}`);
  }
  return (await res.json()) as DriveUploadResult;
}

/**
 * 한 번의 로그인/토큰으로 여러 파일을 사용자 드라이브에 업로드한다.
 * 업로드 완료/실패 무관하게 finally에서 토큰을 폐기한다.
 */
export async function uploadToDrive(
  files: DriveFileInput[]
): Promise<DriveUploadResult[]> {
  if (files.length === 0) return [];
  const token = await getAccessToken();
  try {
    const results: DriveUploadResult[] = [];
    for (const f of files) {
      results.push(await uploadOne(token, f));
    }
    return results;
  } finally {
    revokeToken(token);
  }
}
