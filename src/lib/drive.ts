// Google Drive 업로드 유틸 — 방법 1 (OAuth 토큰 클라이언트 + drive.file 스코프)
// 사용자가 본인 계정으로 로그인 후 본인 드라이브에 파일을 업로드한다.
// 세션 캐시: 브라우저 탭이 살아있는 동안 토큰/폴더 ID 재사용 (탭 닫으면 자동 삭제).

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            hint?: string;
            callback: (resp: {
              access_token?: string;
              expires_in?: number | string;
              error?: string;
              error_description?: string;
            }) => void;
            error_callback?: (err: unknown) => void;
          }) => { requestAccessToken: (overrides?: { prompt?: string; hint?: string }) => void };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

const GSI_SRC = "https://accounts.google.com/gsi/client";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME =
  process.env.NEXT_PUBLIC_DRIVE_FOLDER_NAME || "Book Photo Booth";

const TOKEN_KEY = "drive:accessToken";
const TOKEN_EXP_KEY = "drive:accessTokenExp";
const FOLDER_KEY = "drive:folderId";
// 만료 여유: 실제 만료보다 60초 먼저 새로 발급
const TOKEN_SKEW_MS = 60_000;

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

function readCachedToken(): string | null {
  try {
    const tok = sessionStorage.getItem(TOKEN_KEY);
    const expStr = sessionStorage.getItem(TOKEN_EXP_KEY);
    if (!tok || !expStr) return null;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp - TOKEN_SKEW_MS) return null;
    return tok;
  } catch {
    return null;
  }
}

function writeCachedToken(token: string, expiresInSec: number) {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + expiresInSec * 1000));
  } catch {
    // 무시
  }
}

function clearCachedToken() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXP_KEY);
    sessionStorage.removeItem(FOLDER_KEY);
  } catch {
    // 무시
  }
}

async function requestNewToken(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("NEXT_PUBLIC_GOOGLE_CLIENT_ID 가 설정되지 않았습니다");

  await loadGsi();
  const oauth2 = window.google!.accounts.oauth2;

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      prompt: "select_account",
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error_description || resp.error || "토큰 획득 실패"));
          return;
        }
        const expiresIn =
          typeof resp.expires_in === "string" ? parseInt(resp.expires_in, 10) : resp.expires_in ?? 3600;
        writeCachedToken(resp.access_token, expiresIn || 3600);
        resolve(resp.access_token);
      },
      error_callback: (err) => {
        reject(err instanceof Error ? err : new Error("OAuth 오류"));
      },
    });
    client.requestAccessToken();
  });
}

async function getAccessToken(forceNew = false): Promise<string> {
  if (!forceNew) {
    const cached = readCachedToken();
    if (cached) return cached;
  }
  return requestNewToken();
}

/**
 * 명시적 로그아웃 — 현재 탭의 캐시된 토큰을 폐기하고 세션 캐시를 삭제한다.
 * 공용 기기에서 사용자를 마치고 나갈 때 호출.
 */
export function signOutDrive() {
  try {
    const tok = sessionStorage.getItem(TOKEN_KEY);
    if (tok) {
      window.google?.accounts.oauth2.revoke(tok);
    }
  } catch {
    // 무시
  }
  clearCachedToken();
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

async function ensureFolder(token: string, name: string): Promise<string> {
  // 세션 내에 이미 확보한 폴더 ID가 있으면 재사용
  try {
    const cached = sessionStorage.getItem(FOLDER_KEY);
    if (cached) return cached;
  } catch {
    // 무시
  }

  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) {
    throw new Error(`폴더 조회 실패 (${searchRes.status}): ${await searchRes.text()}`);
  }
  const { files } = (await searchRes.json()) as { files?: { id: string }[] };
  let id: string;
  if (files && files.length > 0) {
    id = files[0].id;
  } else {
    const createRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
        }),
      }
    );
    if (!createRes.ok) {
      throw new Error(`폴더 생성 실패 (${createRes.status}): ${await createRes.text()}`);
    }
    id = ((await createRes.json()) as { id: string }).id;
  }

  try {
    sessionStorage.setItem(FOLDER_KEY, id);
  } catch {
    // 무시
  }
  return id;
}

async function uploadOne(
  token: string,
  file: DriveFileInput,
  folderId?: string
): Promise<DriveUploadResult> {
  const metadata: Record<string, unknown> = { name: file.name, mimeType: file.mime };
  if (folderId) metadata.parents = [folderId];
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
 * 세션에 캐시된 토큰이 있으면 그대로 재사용하므로, 탭을 닫기 전에는 추가 로그인 없이 업로드된다.
 * 토큰이 만료되었거나 서버에서 401이 떨어지면 한 번만 재인증을 시도한다.
 */
export async function uploadToDrive(
  files: DriveFileInput[]
): Promise<DriveUploadResult[]> {
  if (files.length === 0) return [];

  const run = async (forceNew: boolean) => {
    const token = await getAccessToken(forceNew);
    const folderId = await ensureFolder(token, FOLDER_NAME);
    const results: DriveUploadResult[] = [];
    for (const f of files) {
      results.push(await uploadOne(token, f, folderId));
    }
    return results;
  };

  try {
    return await run(false);
  } catch (err) {
    // 토큰 만료/권한 문제로 보이는 에러면 캐시 비우고 한 번만 재시도
    const msg = err instanceof Error ? err.message : String(err);
    if (/\b(401|403)\b/.test(msg)) {
      clearCachedToken();
      return await run(true);
    }
    throw err;
  }
}
